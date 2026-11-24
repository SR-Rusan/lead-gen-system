/**
 * The only way the leads site sends email. Every send starts from a Send click on the dashboard,
 * with one exception Rusan asked for (24 Nov): follow-ups still due at 11 pm Dhaka are sent by the
 * backup job (runFollowUpBackup), if the switch is on. First emails are never sent automatically.
 * Guards: personal addresses only, daily caps, weekdays only, and a database row per (lead, step)
 * so the same email can never go out twice, even if Send is clicked twice.
 */
import { ProspectMasterRecord } from '../types';
import { ensureSchema, getSql } from '../db/pg';
import { dbClient } from '../db/sheets-client';
import { splitDraft } from './gmail-api';
import { sendEmail } from './smtp-send';
import { isPersonalEmail } from './email-rules';
import { followUpText, nextFollowUp, scheduleFollowUps } from './mailbox-sync';

export const FIRST_CAP = Number(process.env.DAILY_FIRST_EMAIL_CAP || 15);
export const TOTAL_CAP = Number(process.env.DAILY_TOTAL_EMAIL_CAP || 40);
const READY = ['A+', 'A', 'B', 'Ready for Review', 'Qualified', 'Approved'];

let ready: Promise<void> | null = null;
async function sendLog() {
  const sql = getSql();
  if (!ready) {
    ready = (async () => {
      await ensureSchema(sql);
      await sql`
        create table if not exists sends (
          lead_id    text not null,
          kind       text not null,
          to_addr    text not null,
          message_id text not null default '',
          sent_at    timestamptz not null default now(),
          primary key (lead_id, kind)
        )`;
    })().catch((e) => { ready = null; throw e; });
  }
  await ready;
  return sql;
}

/** Emails sent today (UTC day), split into first emails and follow-ups. */
export async function sentToday(): Promise<{ first: number; followUps: number; total: number }> {
  const sql = await sendLog();
  const rows = await sql<{ kind: string; n: string }[]>`
    select kind, count(*) as n from sends where sent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc' group by kind`;
  const logged = Number(rows.find((r) => r.kind === 'first')?.n || 0);
  const loggedTotal = rows.reduce((a, r) => a + Number(r.n), 0);
  // Emails sent by hand from Webmail are not in the log; the inbox sync dates them, so count those too.
  const d = new Date().toISOString().split('T')[0];
  const byHand = dbClient.getAll().filter((l) => l.dateContacted === d).length;
  const first = Math.max(logged, byHand);
  return { first, followUps: loggedTotal - logged, total: first + (loggedTotal - logged) };
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function note(lead: ProspectMasterRecord, text: string) {
  lead.notes = `${lead.notes ? lead.notes + '\n' : ''}${text}`;
}

/** Claims the (lead, step) row first; if it already exists the email was sent before. */
async function sendOnce(lead: ProspectMasterRecord, kind: string, email: { subject: string; body: string; inReplyTo?: string }) {
  const sql = await sendLog();
  const claimed = await sql`insert into sends (lead_id, kind, to_addr) values (${lead.leadId}, ${kind}, ${lead.email}) on conflict do nothing returning lead_id`;
  if (!claimed.length) throw new Error('This email was already sent. Nothing was sent again.');
  try {
    const { messageId } = await sendEmail({ to: lead.email, ...email });
    await sql`update sends set message_id = ${messageId}, sent_at = now() where lead_id = ${lead.leadId} and kind = ${kind}`;
    return messageId;
  } catch (err) {
    await sql`delete from sends where lead_id = ${lead.leadId} and kind = ${kind}`;
    throw err;
  }
}

function checkCommon(lead: ProspectMasterRecord) {
  if (!lead.email) throw new Error('No email address.');
  if (!isPersonalEmail(lead.email)) throw new Error('Shared inbox (info@, team@...). Your rule: only personal addresses.');
  if (lead.emailVerificationStatus === 'invalid') throw new Error('This address is marked invalid (bounced or failed the check).');
  const wd = new Date().getUTCDay();
  if (wd === 0 || wd === 6) throw new Error('Weekend: B2B email waits until Monday.');
}

/** Sends the first email of a lead (the draft shown on the dashboard). */
export async function sendFirstEmail(lead: ProspectMasterRecord, override = false): Promise<string> {
  checkCommon(lead);
  if (lead.needsLook && !override) throw new Error(`Needs a look first: ${lead.needsLook}`);
  if (!READY.includes(lead.status) || lead.emailsSent) throw new Error(`Already contacted (status ${lead.status}).`);
  const { subject, body } = splitDraft(lead.draftEmail || '', '');
  if (!subject || !body || !/^(hi|hello|hey|dear)\b/i.test(body.trim())) throw new Error('The email needs a subject and a greeting first.');
  if (/\[|\{|lorem|TODO/i.test(subject + body)) throw new Error('The email still has a placeholder in it.');
  const counts = await sentToday();
  if (counts.first >= FIRST_CAP) throw new Error(`Daily limit reached: ${FIRST_CAP} first emails today. The rest wait for tomorrow.`);
  if (counts.total >= TOTAL_CAP) throw new Error(`Daily limit reached: ${TOTAL_CAP} emails today.`);

  const messageId = await sendOnce(lead, 'first', { subject, body });
  lead.status = 'Contacted';
  lead.dateContacted = today();
  lead.emailsSent = 1;
  lead.lastSentAt = new Date().toISOString();
  lead.lastMessageId = messageId;
  lead.lastSubject = subject;
  scheduleFollowUps(lead);
  note(lead, `Sent ${today()} from the dashboard. Nudge due ${lead.followUp1}.`);
  return `Sent to ${lead.email}. First nudge due ${lead.followUp1}.`;
}

/** Sends the next follow-up (1 or 2), threaded under the earlier email. Only when it is due. */
export async function sendFollowUpEmail(lead: ProspectMasterRecord, by = 'the dashboard'): Promise<string> {
  checkCommon(lead);
  const next = nextFollowUp(lead);
  if (next.step === 0) throw new Error(next.why);
  if (next.due > today()) throw new Error(`Not due yet (due ${next.due}).`);
  const counts = await sentToday();
  if (counts.total >= TOTAL_CAP) throw new Error(`Daily limit reached: ${TOTAL_CAP} emails today.`);

  const { subject, body } = followUpText(lead, next.step);
  const messageId = await sendOnce(lead, `fu${next.step}`, { subject, body, inReplyTo: lead.lastMessageId });
  lead.status = 'Follow-up';
  lead.emailsSent = (lead.emailsSent || 1) + 1;
  lead.lastSentAt = new Date().toISOString();
  lead.lastMessageId = messageId;
  note(lead, `Follow-up ${next.step} sent ${today()} from ${by}.`);
  return `Follow-up ${next.step} sent to ${lead.email}.`;
}
