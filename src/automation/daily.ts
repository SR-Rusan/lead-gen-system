/**
 * Scheduled jobs (Vercel Cron, weekdays). First emails are never sent by these jobs.
 *   runFinder()          - reads queued coach websites (searches Google first when the queue runs low)
 *   runDigest()          - 6 pm Dhaka: checks the inbox, then emails Rusan the summary (DIGEST_TO)
 *   runFollowUpBackup()  - 11 pm Dhaka: sends follow-ups Rusan didn't send himself, if the switch is on
 */
import { ProspectMasterRecord } from '../types';
import { dbClient } from '../db/sheets-client';
import { processNext, queueCounts, searchIntoQueue } from '../finder/run';
import { syncMailbox, nextFollowUp } from '../outreach/mailbox-sync';
import { sendEmail } from '../outreach/smtp-send';
import { mailboxUser } from '../outreach/imap-draft';
import { isPersonalEmail } from '../outreach/email-rules';
import { FIRST_CAP, sendFollowUpEmail } from '../outreach/send-service';
import { getSetting } from '../db/settings';

export const BACKUP_KEY = 'followUpBackup';

const READY = ['A+', 'A', 'B', 'Ready for Review', 'Qualified', 'Approved'];
const DASHBOARD = 'https://leads.axiomsdigital.com/dashboard';

/** Leads whose first email can be sent now (personal address, not invalid, not contacted). */
export function readyToSend(all: ProspectMasterRecord[]): ProspectMasterRecord[] {
  return all
    .filter((l) => READY.includes(l.status) && l.email && isPersonalEmail(l.email) && l.emailVerificationStatus !== 'invalid' && !l.emailsSent && !l.needsLook && /^subject:/i.test(l.draftEmail || ''))
    .sort((a, b) => (b.icpScore || 0) - (a.icpScore || 0));
}

export function followUpsDue(all: ProspectMasterRecord[]): ProspectMasterRecord[] {
  const today = new Date().toISOString().split('T')[0];
  return all.filter((l) => {
    const n = nextFollowUp(l);
    return n.step !== 0 && n.due <= today;
  });
}

/** Fills the lead list: keeps reading queued sites until the time budget is nearly used. */
export async function runFinder(budgetMs = 270_000): Promise<{ checked: number; good: number; searched: boolean }> {
  const stop = Date.now() + budgetMs;
  let checked = 0, good = 0, searched = false;
  if ((await queueCounts()).pending < 12) {
    await searchIntoQueue();
    searched = true;
  }
  // Each site can take up to 170 s, so only start a batch with enough time left.
  while (Date.now() + 180_000 < stop) {
    const step = await processNext(async (rec) => {
      dbClient.upsert(rec);
      await dbClient.flush();
    }, 6);
    checked += step.checked.length;
    good += step.checked.filter((c) => c.status && c.status !== 'Rejected' && c.email).length;
    if (!step.pending || !step.checked.length) break;
  }
  return { checked, good, searched };
}

function list(leads: ProspectMasterRecord[], max = 20): string {
  const lines = leads.slice(0, max).map((l) => `  - ${l.fullName && l.fullName !== l.company ? `${l.fullName}, ` : ''}${l.company} (${l.email})`);
  if (leads.length > max) lines.push(`  ...and ${leads.length - max} more`);
  return lines.join('\n');
}

/** Overall outreach results, counted from the leads themselves. */
export function outreachStats(all: ProspectMasterRecord[]) {
  const emailed = all.filter((l) => l.dateContacted && l.email);
  const replied = emailed.filter((l) => l.response === 'Yes' || /\bREPLY \d{4}-/.test(l.notes || '') || ['Replied', 'Positive', 'Call Booked', 'Proposal', 'Won'].includes(l.status));
  const interested = emailed.filter((l) => l.positiveResponse === 'Yes' || ['Positive', 'Call Booked', 'Proposal', 'Won'].includes(l.status));
  const bounced = emailed.filter((l) => l.emailVerificationStatus === 'invalid' || /bounced|undeliverable/i.test(l.notes || ''));
  const pct = (n: number) => (emailed.length ? `${Math.round((n / emailed.length) * 1000) / 10}%` : '0%');
  return {
    emailed: emailed.length, replied: replied.length, interested: interested.length, bounced: bounced.length,
    line: `${emailed.length} people emailed · ${replied.length} replied (${pct(replied.length)}) · ${interested.length} interested (${pct(interested.length)}) · ${bounced.length} bounced (${pct(bounced.length)})`,
    // For the warning, only the last 3 days count, so old problems don't keep raising it.
    bounceRate: (() => {
      const since = new Date(Date.now() - 3 * 86_400_000).toISOString().split('T')[0];
      const recent = emailed.filter((l) => l.dateContacted >= since);
      return recent.length >= 10 ? recent.filter((l) => bounced.includes(l)).length / recent.length : 0;
    })(),
  };
}

/** Checks the inbox, then emails Rusan the day's summary. */
export async function runDigest(): Promise<{ to: string; subject: string }> {
  const all = dbClient.getAll();
  const { changed, summary } = await syncMailbox(all);
  for (const l of changed) dbClient.upsert(l);
  await dbClient.flush();

  const replied = all.filter((l) => l.status === 'Replied');
  const stats = outreachStats(all);
  const due = followUpsDue(all);
  const ready = readyToSend(all);
  const parts: string[] = [];
  if (summary.replies.length) parts.push(`${summary.replies.length} new ${summary.replies.length === 1 ? 'reply' : 'replies'}`);
  parts.push(`${due.length} follow-ups due`, `${ready.length} new emails ready`);
  const subject = `Leads today: ${parts.join(', ')}`;

  const body = [
    'Hi Rusan,',
    '',
    `RESULTS SO FAR: ${stats.line}`,
    stats.emailed >= 100
      ? (stats.interested / stats.emailed >= 0.02 ? 'Interested rate is at or above 2%: the leads and message are working.\n' : 'Interested rate is below 2% after 100+ emails: time to test a change (see the master file plan).\n')
      : `(Judge after about 100 people emailed. Mark interested replies as "Interested" on the dashboard so they count.)\n`,
    stats.bounceRate > 0.04 ? 'WARNING: more than 4% of the last 3 days bounced. Tell Claude to lower the daily limit for a while.\n' : '',
    summary.replies.length ? `NEW REPLIES (answer these first, from rusan@):\n${summary.replies.map((r) => `  - ${r}`).join('\n')}\n` : 'No new replies since yesterday.\n',
    replied.length ? `Waiting on your answer: ${replied.length} lead(s) in the Replied tab.\n` : '',
    summary.bounces.length ? `Bounced (marked Lost): ${summary.bounces.join(', ')}\n` : '',
    due.length ? `FOLLOW-UPS DUE (${due.length}). Open the "Follow-up due" tab and press "Send all due":\n${list(due)}\n` : 'No follow-ups due today.\n',
    ready.length ? `NEW EMAILS READY (${ready.length}; send up to ${FIRST_CAP} today). Open "To review", read each one, press Send:\n${list(ready, 15)}\n` : 'No new emails ready. Press "Find leads" if you want more.\n',
    (() => { const look = all.filter((l) => l.needsLook && READY.includes(l.status) && !l.emailsSent); return look.length ? `NEEDS A LOOK (${look.length}): emails that failed an automatic check. Fix or skip them in the "Needs a look" tab.\n` : ''; })(),
    `Dashboard: ${DASHBOARD}`,
    '',
    (await getSetting(BACKUP_KEY, true))
      ? 'Follow-ups you have not sent by 11 pm Dhaka go out automatically (switch it off on the Follow-up due tab). New emails only go out when you press Send.'
      : 'Nothing goes out to any lead until you press Send (the 11 pm follow-up backup is off).',
  ].filter((x) => x !== '').join('\n');

  const to = process.env.DIGEST_TO || mailboxUser();
  await sendEmail({ to, subject, body });
  return { to, subject };
}

/** 11 pm Dhaka backup: sends the follow-ups still due (switch on), then tells Rusan what went out. */
export async function runFollowUpBackup(budgetMs = 250_000): Promise<{ on: boolean; sent: string[]; failed: string[] }> {
  if (!(await getSetting(BACKUP_KEY, true))) return { on: false, sent: [], failed: [] };
  const stop = Date.now() + budgetMs;
  // Pick up replies first, so nobody who answered today gets a nudge.
  const { changed } = await syncMailbox(dbClient.getAll());
  for (const l of changed) dbClient.upsert(l);
  await dbClient.flush();

  const sent: string[] = [];
  const failed: string[] = [];
  for (const lead of followUpsDue(dbClient.getAll())) {
    if (Date.now() > stop) break;
    try {
      await sendFollowUpEmail(lead, 'the 11 pm backup');
      dbClient.upsert(lead);
      await dbClient.flush();
      sent.push(`${lead.fullName && lead.fullName !== lead.company ? `${lead.fullName}, ` : ''}${lead.company} (${lead.email})`);
      await new Promise((r) => setTimeout(r, 8000));
    } catch (err) {
      failed.push(`${lead.company || lead.email}: ${(err as Error).message}`);
    }
  }
  if (sent.length || failed.length) {
    const to = process.env.DIGEST_TO || mailboxUser();
    await sendEmail({
      to,
      subject: `Backup sent ${sent.length} follow-up${sent.length === 1 ? '' : 's'}`,
      body: [
        'Hi Rusan,',
        '',
        `These follow-ups were due and not sent by 11 pm, so the backup sent them:`,
        sent.length ? sent.map((s) => `  - ${s}`).join('\n') : '  (none)',
        failed.length ? `\nNot sent:\n${failed.map((f) => `  - ${f}`).join('\n')}` : '',
        '',
        `Turn the backup off on the Follow-up due tab: ${DASHBOARD}?tab=due`,
      ].filter((x) => x !== '').join('\n'),
    });
  }
  return { on: true, sent, failed };
}
