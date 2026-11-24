/**
 * Checks that an email address really exists before we write to it (bounces hurt the domain).
 * Uses MillionVerifier when MILLIONVERIFIER_API_KEY is set (pay-as-you-go credits, no subscription).
 * Without a key it only checks that the domain has a mail server, and says so.
 */
import { domainAcceptsMail } from '../finder/site';

export type VerifyResult = 'verified' | 'catch-all' | 'invalid' | 'unknown' | 'unverified';

export function verifierConfigured(): boolean {
  return Boolean(process.env.MILLIONVERIFIER_API_KEY);
}

export async function verifyEmail(address: string): Promise<{ result: VerifyResult; detail: string }> {
  const domain = address.split('@')[1] || '';
  if (!(await domainAcceptsMail(domain))) return { result: 'invalid', detail: 'domain has no mail server' };
  const key = process.env.MILLIONVERIFIER_API_KEY;
  if (!key) return { result: 'unverified', detail: 'mail server OK; no verifier key set, so the mailbox itself is not checked' };
  const url = `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(key)}&email=${encodeURIComponent(address)}&timeout=20`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Verifier error: ${data.error || res.status}`);
  const r = String(data.result || '').toLowerCase();
  if (r === 'ok') return { result: 'verified', detail: 'mailbox exists' };
  if (r === 'catch_all') return { result: 'catch-all', detail: 'server accepts every address, so it cannot be confirmed' };
  if (r === 'invalid' || r === 'disposable') return { result: 'invalid', detail: `verifier says ${r}` };
  return { result: 'unknown', detail: `verifier could not tell (${r || 'no answer'})` };
}
