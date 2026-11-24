/**
 * Reads the rusan@axiomsdigital.com mailbox (IMAP, read-only) and keeps the leads up to date:
 *  - Sent folder: who was emailed and when -> status Contacted / Follow-up, follow-up due dates,
 *    and the last Message-ID so a follow-up can be threaded under it.
 *  - Inbox: real replies -> Replied; bounces -> Lost (address marked invalid); auto-replies and
 *    helpdesk tickets -> noted only, status unchanged.
 * Nothing is sent, moved or deleted.
 */
import type { ImapFlow } from 'imapflow';
import { ProspectMasterRecord } from '../types';
import { client } from './imap-draft';
import { isPersonalEmail } from './email-rules';

const DAY = 86_400_000;
const PRE_CONTACT = ['Raw', 'Researching', 'Qualified', 'A+', 'A', 'B', 'Ready for Review', 'Approved'];
const LIVE = ['Contacted', 'Follow-up'];
const FREEMAIL = /@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail|gmx|msn)\./i;
const AUTO_SUBJECT = /(automatic reply|auto.?reply|autoresponse|out of (the )?office|\booo\b|away (from|until|in|till)|on (leave|vacation|holiday)|annual leave|thank you for (your )?(email|message|contacting)|we('ve| have) received your)/i;
const HELPDESK_FROM = /(jira@|atlassian\.net|zendesk|freshdesk|helpscout|help\.?desk|intercom|hubspot|^support@|^noreply|^no-reply|^donotreply)/i;
const BOUNCE_FROM = /(mailer-daemon|postmaster)@/i;
const BOUNCE_SUBJECT = /(undeliver|delivery (status notification|has failed|failure|incomplete)|returned to sender|failure notice|could not be delivered|mail delivery failed|address not found)/i;

/** Adds working days (Mon-Fri) to a YYYY-MM-DD date. */
export function addBusinessDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().split('T')[0];
}

/** Follow-up schedule: first nudge 3 working days after the first email, the last one 8 working days after. */
export function scheduleFollowUps(lead: ProspectMasterRecord): void {
  if (!lead.dateContacted) return;
  lead.followUp1 = addBusinessDays(lead.dateContacted, 3);
  lead.followUp2 = addBusinessDays(lead.dateContacted, 8);
}

function day(d: Date | string | undefined): string {
  return new Date(d || Date.now()).toISOString().split('T')[0];
}

function note(lead: ProspectMasterRecord, text: string) {
  lead.notes = `${lead.notes ? lead.notes + '\n' : ''}${text}`;
}

function cleanId(id: string | undefined): string {
  return String(id || '').replace(/[<>\s]/g, '');
}

async function folderPath(c: ImapFlow, use: string, name: RegExp): Promise<string | null> {
  const list = await c.list();
  return (list.find((f) => f.specialUse === use) || list.find((f) => name.test(f.path)))?.path || null;
}

export interface SyncSummary {
  contacted: number;
  followUps: number;
  replies: string[];
  autoReplies: string[];
  bounces: string[];
}

/**
 * Updates the given leads in place from the mailbox and returns the ones that changed.
 * Looks back `days` days (default 45).
 */
export async function syncMailbox(leads: ProspectMasterRecord[], days = 45): Promise<{ changed: ProspectMasterRecord[]; summary: SyncSummary }> {
  const summary: SyncSummary = { contacted: 0, followUps: 0, replies: [], autoReplies: [], bounces: [] };
  const changed = new Set<ProspectMasterRecord>();
  const byEmail = new Map<string, ProspectMasterRecord>();
  for (const l of leads) if (l.email && l.status !== 'Rejected') byEmail.set(l.email.toLowerCase(), l);
  const since = new Date(Date.now() - days * DAY);

  const c = client();
  await c.connect();
  try {
    // ---- Sent folder: what went out, to whom ----
    const sentPath = await folderPath(c, '\\Sent', /(^|[./])sent( items| messages)?$/i);
    const sent = new Map<ProspectMasterRecord, { date: Date; id: string; subject: string }[]>();
    if (sentPath) {
      const lock = await c.getMailboxLock(sentPath);
      try {
        for await (const m of c.fetch({ since }, { envelope: true })) {
          const env = m.envelope;
          if (!env) continue;
          for (const to of [...(env.to || []), ...(env.cc || [])]) {
            const lead = byEmail.get(String(to.address || '').toLowerCase());
            if (!lead) continue;
            const list = sent.get(lead) || [];
            const id = cleanId(env.messageId);
            if (!list.some((x) => x.id === id)) list.push({ date: new Date(env.date || Date.now()), id, subject: env.subject || '' });
            sent.set(lead, list);
          }
        }
      } finally {
        lock.release();
      }
    }
    for (const [lead, list] of sent) {
      list.sort((a, b) => a.date.getTime() - b.date.getTime());
      const last = list[list.length - 1];
      const before = JSON.stringify([lead.status, lead.emailsSent, lead.lastMessageId, lead.dateContacted, lead.followUp1]);
      lead.emailsSent = list.length;
      lead.lastSentAt = last.date.toISOString();
      lead.lastMessageId = last.id;
      lead.lastSubject = last.subject.replace(/^(re|fwd?):\s*/i, '');
      if (!lead.dateContacted || lead.dateContacted > day(list[0].date)) lead.dateContacted = day(list[0].date);
      if (PRE_CONTACT.includes(lead.status)) {
        lead.status = 'Contacted';
        summary.contacted++;
      }
      if (list.length >= 2 && lead.status === 'Contacted') {
        lead.status = 'Follow-up';
        summary.followUps++;
      }
      scheduleFollowUps(lead);
      if (JSON.stringify([lead.status, lead.emailsSent, lead.lastMessageId, lead.dateContacted, lead.followUp1]) !== before) changed.add(lead);
    }

    // ---- Inbox: replies, auto-replies, bounces ----
    const lock = await c.getMailboxLock('INBOX');
    const bounceSeqs: { seq: number; id: string; date: Date }[] = [];
    try {
      for await (const m of c.fetch({ since }, { envelope: true, headers: ['auto-submitted', 'x-autoreply', 'x-autorespond', 'precedence'] })) {
        const env = m.envelope;
        if (!env) continue;
        const from = String(env.from?.[0]?.address || '').toLowerCase();
        const subject = env.subject || '';
        const id = cleanId(env.messageId) || `${from}|${String(env.date || '')}`;
        if (BOUNCE_FROM.test(from) || BOUNCE_SUBJECT.test(subject)) {
          bounceSeqs.push({ seq: m.seq, id, date: new Date(env.date || Date.now()) });
          continue;
        }
        let lead = byEmail.get(from);
        if (!lead && from.includes('@') && !FREEMAIL.test(from)) {
          // Someone else at the same firm answered (e.g. the coach replied to an info@ email).
          const dom = from.split('@')[1];
          lead = leads.find((l) => l.email && l.email.toLowerCase().endsWith(`@${dom}`) && (LIVE.includes(l.status) || l.status === 'Replied'));
        }
        if (!lead || (lead.seenMessageIds || []).includes(id)) continue;
        lead.seenMessageIds = [...(lead.seenMessageIds || []), id].slice(-40);
        changed.add(lead);

        const headers = (m.headers || Buffer.alloc(0)).toString('utf8');
        const autoHeader = /auto-submitted:\s*(?!no\b)\S+|x-autoreply:|x-autorespond:|precedence:\s*(auto_reply|bulk|junk)/i.test(headers);
        const auto = autoHeader || AUTO_SUBJECT.test(subject) || HELPDESK_FROM.test(from) || /^\[?[A-Z]{2,8}-\d+\]?\s/.test(subject);
        const when = day(env.date);
        if (auto) {
          note(lead, `Auto-reply ${when} from ${from}: "${subject.slice(0, 120)}" (status unchanged).`);
          summary.autoReplies.push(lead.company || lead.email);
        } else {
          if ([...LIVE, ...PRE_CONTACT].includes(lead.status)) lead.status = 'Replied';
          lead.response = 'Yes';
          note(lead, `REPLY ${when} from ${from}: "${subject.slice(0, 120)}". Answer it from rusan@.`);
          summary.replies.push(lead.company || lead.email);
        }
      }
    } finally {
      lock.release();
    }

    // Bounces: read each bounce message to find which address failed.
    if (bounceSeqs.length) {
      const lock2 = await c.getMailboxLock('INBOX');
      try {
        for (const b of bounceSeqs) {
          const msg = await c.fetchOne(String(b.seq), { source: { maxLength: 60_000 } } as any);
          const text = msg && msg.source ? msg.source.toString('utf8').toLowerCase() : '';
          for (const [addr, lead] of byEmail) {
            if (!text.includes(addr) || (lead.seenMessageIds || []).includes(b.id)) continue;
            if (!LIVE.includes(lead.status) && !PRE_CONTACT.includes(lead.status)) continue;
            lead.seenMessageIds = [...(lead.seenMessageIds || []), b.id].slice(-40);
            lead.status = 'Lost';
            lead.closed = 'Lost';
            lead.emailVerificationStatus = 'invalid';
            note(lead, `Bounced ${day(b.date)}: ${addr} does not exist. Marked Lost.`);
            summary.bounces.push(lead.company || addr);
            changed.add(lead);
          }
        }
      } finally {
        lock2.release();
      }
    }
  } finally {
    await c.logout().catch(() => undefined);
  }
  return { changed: [...changed], summary };
}

// ---------------- follow-up emails ----------------

function pick<T>(list: T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

const FOLLOW_UP_1 = [
  "Just bringing this back to the top of your inbox in case it got buried. Happy to record that 2-minute video if it would help.",
  "Quick nudge in case this slipped past. If a short video showing how it would work on your site sounds useful, just reply yes.",
  "Following up in case this got lost under everything else. The offer of a 2-minute video still stands whenever it suits you.",
];
const FOLLOW_UP_2 = [
  "I'll leave it here so I'm not cluttering your inbox. If quicker replies to new inquiries ever moves up the list, reply to this and I'll send the video.",
  "Last note from me on this. If it's ever useful, reply any time and I'll record the video for you.",
];

/** Which follow-up is next for this lead (1 or 2), or why there is none. */
export function nextFollowUp(lead: ProspectMasterRecord): { step: 1 | 2; due: string } | { step: 0; why: string } {
  if (!lead.email) return { step: 0, why: 'No email address.' };
  if (!isPersonalEmail(lead.email)) return { step: 0, why: 'Shared inbox (info@, team@...): no follow-ups, by your rule.' };
  if (!LIVE.includes(lead.status)) return { step: 0, why: `Status is ${lead.status}.` };
  const sent = lead.emailsSent || 0;
  if (!sent || !lead.lastMessageId) return { step: 0, why: 'Not seen in the Sent folder yet. Press "Check inbox".' };
  if (sent >= 3) return { step: 0, why: 'Both follow-ups sent. Leave it here.' };
  return sent === 1 ? { step: 1, due: lead.followUp1 } : { step: 2, due: lead.followUp2 };
}

/** Writes the follow-up text, reusing the greeting of the first email ("Hi Brittany,"). */
export function followUpText(lead: ProspectMasterRecord, step: 1 | 2): { subject: string; body: string } {
  const first = String(lead.draftEmail || '').split('\n').find((l) => /^(hi|hello|hey|dear)\b[^,\n]{0,60},\s*$/i.test(l.trim()));
  const greeting = first ? first.trim() : `Hi ${lead.firstName || 'there'},`;
  const line = pick(step === 1 ? FOLLOW_UP_1 : FOLLOW_UP_2, lead.leadId);
  const subject = `Re: ${lead.lastSubject || 'my last email'}`;
  return { subject, body: `${greeting}\n\n${line}\n\nRusan` };
}
