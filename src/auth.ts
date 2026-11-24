import * as crypto from 'crypto';
import * as http from 'http';
import { databaseUrl, ensureSchema, getSql } from './db/pg';

/**
 * Single-owner login for the hosted dashboard.
 * - DASHBOARD_PASSWORD_HASH: made by `npm run set-password` (scrypt; the password itself is never stored).
 * - SESSION_SECRET: random string used to sign the session cookie.
 * Online (on Vercel) login is always required. Locally it is required only when a hash is set.
 */

export const SESSION_COOKIE = 'leads_session';
const SESSION_DAYS = 30;
const MAX_FAILURES = 8;
const FAILURE_WINDOW_MIN = 15;

export function authRequired(): boolean {
  return Boolean(process.env.VERCEL) || Boolean(process.env.DASHBOARD_PASSWORD_HASH);
}

export function authConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD_HASH) && (process.env.SESSION_SECRET || '').length >= 32;
}

// ---------- password hashing ----------

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ---------- session cookie ----------

function sign(value: string): string {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(value).digest('base64url');
}

export function createSessionCookie(): string {
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  const value = `v1.${expires}`;
  const token = `${value}.${sign(value)}`;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secureFlag()}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag()}`;
}

function secureFlag(): string {
  return process.env.VERCEL ? '; Secure' : '';
}

function readCookie(req: http.IncomingMessage, name: string): string {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return '';
}

export function hasValidSession(req: http.IncomingMessage): boolean {
  if (!authConfigured()) return false;
  const token = readCookie(req, SESSION_COOKIE);
  const lastDot = token.lastIndexOf('.');
  if (lastDot < 0) return false;
  const value = token.slice(0, lastDot);
  const given = Buffer.from(token.slice(lastDot + 1));
  const expected = Buffer.from(sign(value));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  const [version, expires] = value.split('.');
  return version === 'v1' && Number(expires) > Date.now();
}

export function hasValidIngestToken(req: http.IncomingMessage): boolean {
  const token = process.env.INGEST_TOKEN || '';
  const header = String(req.headers.authorization || '');
  if (token.length < 24 || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// ---------- brute-force throttle (per IP) ----------

const memoryFailures = new Map<string, number[]>();

export function clientIp(req: http.IncomingMessage): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || '') || req.socket.remoteAddress || 'unknown';
}

export async function isLockedOut(ip: string): Promise<boolean> {
  if (databaseUrl()) {
    const sql = getSql();
    await ensureSchema(sql);
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from login_failures
      where ip = ${ip} and at > now() - (${FAILURE_WINDOW_MIN} || ' minutes')::interval`;
    return rows[0].n >= MAX_FAILURES;
  }
  const cutoff = Date.now() - FAILURE_WINDOW_MIN * 60_000;
  return (memoryFailures.get(ip) || []).filter((t) => t > cutoff).length >= MAX_FAILURES;
}

export async function recordFailure(ip: string): Promise<void> {
  if (databaseUrl()) {
    const sql = getSql();
    await sql`insert into login_failures (ip) values (${ip})`;
    await sql`delete from login_failures where at < now() - interval '1 day'`;
    return;
  }
  memoryFailures.set(ip, [...(memoryFailures.get(ip) || []), Date.now()]);
}

export async function clearFailures(ip: string): Promise<void> {
  if (databaseUrl()) {
    await getSql()`delete from login_failures where ip = ${ip}`;
    return;
  }
  memoryFailures.delete(ip);
}
