/**
 * Sends one email from rusan@axiomsdigital.com through Hostinger SMTP, then saves a copy in the
 * mailbox's Sent folder (Hostinger does not do that for SMTP sends), so Webmail shows it.
 * Only called when Rusan (or Claude on his behalf) presses Send on the dashboard. Never on a timer.
 * Env: MAILBOX_IMAP_PASSWORD (same password as IMAP), optional MAILBOX_SMTP_HOST.
 */
import nodemailer from 'nodemailer';
import { buildRawEmail, client, mailboxUser } from './imap-draft';

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export async function sendEmail(opts: { to: string; subject: string; body: string; inReplyTo?: string }): Promise<{ messageId: string }> {
  const to = opts.to.trim();
  if (!EMAIL_RE.test(to)) throw new Error(`Not a valid address: ${to}`);
  const { raw, messageId } = buildRawEmail({ ...opts, to });
  const transport = nodemailer.createTransport({
    host: process.env.MAILBOX_SMTP_HOST || 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: { user: mailboxUser(), pass: process.env.MAILBOX_IMAP_PASSWORD || '' },
    connectionTimeout: 20_000,
    socketTimeout: 30_000,
  });
  try {
    await transport.sendMail({ envelope: { from: mailboxUser(), to: [to] }, raw });
  } finally {
    transport.close();
  }
  // Copy to Sent. If this fails the email has still gone out, so it is reported, not thrown.
  try {
    const c = client();
    await c.connect();
    try {
      const list = await c.list();
      const sent = list.find((f) => f.specialUse === '\\Sent') || list.find((f) => /(^|[./])sent$/i.test(f.path));
      if (sent) await c.append(sent.path, raw, ['\\Seen']);
    } finally {
      await c.logout().catch(() => undefined);
    }
  } catch (err) {
    console.error('[smtp-send] sent, but could not copy to Sent:', (err as Error).message);
  }
  return { messageId };
}
