/**
 * Saves a draft straight into the rusan@axiomsdigital.com mailbox (Hostinger) over IMAP.
 * The draft then shows up in that mailbox's Drafts folder: Hostinger Webmail, and any mail app
 * connected to rusan@. Nothing is sent.
 * Env: MAILBOX_IMAP_PASSWORD (set by `npm run connect-mailbox`), optional MAILBOX_USER,
 *      MAILBOX_IMAP_HOST (default imap.hostinger.com), MAILBOX_FROM.
 */
import { ImapFlow } from 'imapflow';
import * as crypto from 'crypto';
import { buildMime } from './gmail-api';

export function mailboxUser(): string {
  return process.env.MAILBOX_USER || 'rusan@axiomsdigital.com';
}

export function mailboxConfigured(): boolean {
  return Boolean(process.env.MAILBOX_IMAP_PASSWORD);
}

export function client(password = process.env.MAILBOX_IMAP_PASSWORD || ''): ImapFlow {
  return new ImapFlow({
    host: process.env.MAILBOX_IMAP_HOST || 'imap.hostinger.com',
    port: 993,
    secure: true,
    auth: { user: mailboxUser(), pass: password },
    logger: false,
    socketTimeout: 30000,
  });
}

/** Finds the mailbox's Drafts folder (by its special-use flag, then by name). */
async function draftsPath(c: ImapFlow): Promise<string> {
  const list = await c.list();
  const special = list.find((f) => f.specialUse === '\\Drafts');
  if (special) return special.path;
  const named = list.find((f) => /(^|[./])drafts$/i.test(f.path));
  if (named) return named.path;
  throw new Error('Could not find a Drafts folder in the mailbox');
}

/** Logs in and returns the Drafts folder name. Used to check a password before saving it. */
export async function checkMailbox(password: string): Promise<string> {
  const c = client(password);
  await c.connect();
  try {
    return await draftsPath(c);
  } finally {
    await c.logout().catch(() => undefined);
  }
}

/** Saves the email as a draft in the rusan@ mailbox. Returns the folder it was saved in. */
/** Builds the full raw message (with Date, Message-ID and, for a follow-up, thread headers). */
export function buildRawEmail(opts: { to: string; subject: string; body: string; inReplyTo?: string }): { raw: string; messageId: string } {
  const from = process.env.MAILBOX_FROM || `Rusan <${mailboxUser()}>`;
  const domain = mailboxUser().split('@')[1] || 'axiomsdigital.com';
  const messageId = `${crypto.randomUUID()}@${domain}`;
  const lines = [`Date: ${new Date().toUTCString()}`, `Message-ID: <${messageId}>`];
  // A follow-up points at the earlier email so it lands in the same thread for them.
  const ref = (opts.inReplyTo || '').replace(/[\r\n<>]/g, '').trim();
  if (ref) lines.push(`In-Reply-To: <${ref}>`, `References: <${ref}>`);
  return { raw: `${lines.join('\r\n')}\r\n${buildMime({ from, to: opts.to, subject: opts.subject, body: opts.body })}`, messageId };
}

export async function createMailboxDraft(opts: { to: string; subject: string; body: string; inReplyTo?: string }): Promise<string> {
  const { raw } = buildRawEmail(opts);
  const c = client();
  await c.connect();
  try {
    const folder = await draftsPath(c);
    await c.append(folder, raw, ['\\Draft', '\\Seen']);
    return folder;
  } finally {
    await c.logout().catch(() => undefined);
  }
}
