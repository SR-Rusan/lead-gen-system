/**
 * Creates Gmail drafts through the Gmail API (scope: gmail.compose — can write drafts, cannot read mail).
 * Env: GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN (set by `npm run connect-gmail`),
 *      GMAIL_FROM (optional, default "Rusan <rusan@axiomsdigital.com>"; must be a verified "Send mail as" address).
 */

export function gmailApiConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET && process.env.GMAIL_OAUTH_REFRESH_TOKEN
  );
}

export function gmailFrom(): string {
  return process.env.GMAIL_FROM || 'Rusan <rusan@axiomsdigital.com>';
}

async function accessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_OAUTH_CLIENT_ID || '',
      client_secret: process.env.GMAIL_OAUTH_CLIENT_SECRET || '',
      refresh_token: process.env.GMAIL_OAUTH_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  const data: any = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Gmail sign-in failed (${data.error || res.status}). Run npm run connect-gmail again.`);
  }
  return data.access_token;
}

function encodeHeader(value: string): string {
  // RFC 2047 so names/subjects with non-ASCII characters survive.
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function buildMime(opts: { from: string; to: string; subject: string; body: string }): string {
  const bodyB64 = Buffer.from(opts.body.replace(/\r?\n/g, '\r\n'), 'utf8')
    .toString('base64')
    .replace(/.{76}/g, '$&\r\n');
  return [
    `From: ${cleanHeader(opts.from)}`,
    `To: ${cleanHeader(opts.to)}`,
    `Subject: ${encodeHeader(cleanHeader(opts.subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
  ].join('\r\n');
}

/** Creates a draft in the connected Gmail account and returns its draft id. Nothing is sent. */
export async function createGmailDraft(opts: { to: string; subject: string; body: string }): Promise<string> {
  const token = await accessToken();
  const raw = Buffer.from(buildMime({ from: gmailFrom(), ...opts }), 'utf8').toString('base64url');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw } }),
  });
  const data: any = await res.json();
  if (!res.ok || !data.id) {
    throw new Error(`Gmail draft failed: ${data.error?.message || res.status}`);
  }
  return data.id;
}

/** Splits a stored draft ("Subject: ...\n\nbody") into subject and body. */
export function splitDraft(text: string, fallbackSubject: string): { subject: string; body: string } {
  const lines = (text || '').split('\n');
  if (lines[0]?.toLowerCase().startsWith('subject:')) {
    return { subject: lines[0].replace(/^subject:\s*/i, '').trim() || fallbackSubject, body: lines.slice(1).join('\n').trim() };
  }
  return { subject: fallbackSubject, body: (text || '').trim() };
}
