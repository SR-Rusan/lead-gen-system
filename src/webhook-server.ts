import * as http from 'http';
import { orchestrator } from './index';
import { dbClient } from './db/sheets-client';
import { telegramApprovalService } from './outreach/telegram-approval';
import { gmailDispatcher } from './outreach/gmail-dispatcher';
import { AnalyticsEngine } from './analytics/analytics-engine';
import { RawLeadInput } from './types';
import { CONFIG } from './config';
import { renderDashboard } from './ui/dashboard';
import { processNext, queueCounts, searchIntoQueue } from './finder/run';

const finderReady = () => Boolean(CONFIG.apify.token && CONFIG.openRouter.apiKey && dbClient.cloud);
import { gmailApiConfigured } from './outreach/gmail-api';
import { createMailboxDraft, mailboxConfigured, mailboxUser } from './outreach/imap-draft';
import { followUpText, nextFollowUp, scheduleFollowUps, syncMailbox } from './outreach/mailbox-sync';
import { verifierConfigured, verifyEmail } from './outreach/verify-email';
import { isPersonalEmail } from './outreach/email-rules';
import { FIRST_CAP, TOTAL_CAP, sendFirstEmail, sendFollowUpEmail, sentToday } from './outreach/send-service';
import { BACKUP_KEY, followUpsDue, runDigest, runFinder, runFollowUpBackup } from './automation/daily';
import { getSetting, setSetting } from './db/settings';
import { timingSafeEqual } from 'crypto';

/** Vercel Cron calls with "Authorization: Bearer <CRON_SECRET>". */
function isCron(req: http.IncomingMessage): boolean {
  const secret = process.env.CRON_SECRET || '';
  const got = String(req.headers.authorization || '');
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
import {
  authConfigured,
  authRequired,
  clearFailures,
  clearSessionCookie,
  clientIp,
  createSessionCookie,
  hasValidIngestToken,
  hasValidSession,
  isLockedOut,
  recordFailure,
  verifyPassword,
} from './auth';

const PORT = parseInt(process.env.WEBHOOK_PORT || '3001', 10);
const MAX_BODY_BYTES = 1_000_000;
const EDITABLE_STATUSES = ['Ready for Review', 'Approved', 'Contacted', 'Follow-up', 'Replied', 'Positive', 'Call Booked', 'Proposal', 'Won', 'Lost', 'Rejected'];

// Every response: never indexed, never framed, never cached.
const BASE_HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

function readRawBody(req: http.IncomingMessage): Promise<string> {
  // On Vercel the platform may already have parsed the body.
  const preParsed = (req as any).body;
  if (preParsed !== undefined) {
    if (typeof preParsed === 'string') return Promise.resolve(preParsed);
    if (Buffer.isBuffer(preParsed)) return Promise.resolve(preParsed.toString('utf8'));
    return Promise.resolve(JSON.stringify(preParsed));
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  const preParsed = (req as any).body;
  if (preParsed && typeof preParsed === 'object' && !Buffer.isBuffer(preParsed)) return preParsed;
  const body = await readRawBody(req);
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error(`Invalid JSON body: ${(err as Error).message}`);
  }
}

async function parseFormBody(req: http.IncomingMessage): Promise<Record<string, string>> {
  const preParsed = (req as any).body;
  if (preParsed && typeof preParsed === 'object' && !Buffer.isBuffer(preParsed)) return preParsed;
  const body = await readRawBody(req);
  return Object.fromEntries(new URLSearchParams(body));
}

function sendJson(res: http.ServerResponse, statusCode: number, data: any, extra: Record<string, string> = {}) {
  res.writeHead(statusCode, { ...BASE_HEADERS, 'Content-Type': 'application/json', ...extra });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res: http.ServerResponse, statusCode: number, html: string, extra: Record<string, string | string[]> = {}) {
  res.writeHead(statusCode, { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8', ...extra });
  res.end(html);
}

function redirect(res: http.ServerResponse, location: string, extra: Record<string, string> = {}) {
  res.writeHead(303, { ...BASE_HEADERS, Location: location, ...extra });
  res.end();
}

/** Blocks cross-site form posts: a browser POST must come from this same host. */
function sameOrigin(req: http.IncomingMessage): boolean {
  // Modern browsers say directly where a request came from.
  const site = String(req.headers['sec-fetch-site'] || '');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (n8n, curl) send no Origin
  try {
    // Behind Vercel's proxy the public hostname arrives in x-forwarded-host.
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname || '/';
  const method = req.method?.toUpperCase();
  const online = Boolean(process.env.VERCEL);

  try {
    if (method === 'GET' && pathname === '/robots.txt') {
      res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': 'text/plain' });
      res.end('User-agent: *\nDisallow: /\n');
      return;
    }

    // ---- Scheduled jobs (no session; secret header from Vercel Cron). They never email leads. ----
    if (method === 'GET' && ['/api/cron/finder', '/api/cron/digest', '/api/cron/backup'].includes(pathname)) {
      if (!isCron(req)) {
        sendJson(res, 401, { error: 'Not allowed' });
        return;
      }
      await dbClient.ready();
      const result = pathname.endsWith('finder')
        ? (finderReady() ? await runFinder() : { skipped: 'finder keys missing' })
        : pathname.endsWith('backup') ? await runFollowUpBackup() : await runDigest();
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (method === 'POST' && !sameOrigin(req)) {
      sendJson(res, 403, { error: 'Cross-site request blocked' });
      return;
    }

    // ---- Login / logout (the only pages reachable without a session) ----
    if (authRequired()) {
      if (!authConfigured()) {
        sendHtml(res, 503, renderLoginHtml('Login is not set up yet. Run npm run set-password.'));
        return;
      }

      if (pathname === '/login' && (method === 'GET' || method === 'HEAD')) {
        if (hasValidSession(req)) return redirect(res, '/dashboard');
        sendHtml(res, 200, renderLoginHtml());
        return;
      }

      if (pathname === '/login' && method === 'POST') {
        const ip = clientIp(req);
        if (await isLockedOut(ip)) {
          sendHtml(res, 429, renderLoginHtml('Too many attempts. Try again in 15 minutes.'));
          return;
        }
        const form = await parseFormBody(req);
        const ok = verifyPassword(String(form.password || ''), process.env.DASHBOARD_PASSWORD_HASH || '');
        if (!ok) {
          await recordFailure(ip);
          await sleep(800);
          sendHtml(res, 401, renderLoginHtml('Wrong password.'));
          return;
        }
        await clearFailures(ip);
        return redirect(res, '/dashboard', { 'Set-Cookie': createSessionCookie() });
      }

      if (pathname === '/logout' && method === 'POST') {
        return redirect(res, '/login', { 'Set-Cookie': clearSessionCookie() });
      }

      const isIngest = method === 'POST' && pathname === '/webhook/ingest';
      if (!hasValidSession(req) && !(isIngest && hasValidIngestToken(req))) {
        if (method === 'GET' && !pathname.startsWith('/api/')) return redirect(res, '/login');
        sendJson(res, 401, { error: 'Not signed in' });
        return;
      }
    }

    if (online && !dbClient.cloud) {
      sendJson(res, 503, { error: 'Database not connected yet (DATABASE_URL missing).' });
      return;
    }
    await dbClient.ready();

    // 1. Live Visual Web Dashboard
    if ((method === 'GET' || method === 'HEAD') && (pathname === '/' || pathname === '/dashboard')) {
      sendHtml(res, 200, renderDashboard({ canLogout: authRequired(), gmailConnected: mailboxConfigured() || gmailApiConfigured() || !online, draftsTo: mailboxConfigured() ? `the Drafts folder of ${mailboxUser()}` : 'your Gmail Drafts, from rusan@axiomsdigital.com' }));
      return;
    }

    // 2. Lead Ingestion Webhook (Receives from Make.com, Apify, Serper, or forms)
    if (method === 'POST' && pathname === '/webhook/ingest') {
      const payload = await parseJsonBody(req);
      const rawLeads: RawLeadInput[] = Array.isArray(payload) ? payload : [payload];

      console.log(`[WebhookServer] Ingesting ${rawLeads.length} leads from webhook...`);
      const ingestResult = await orchestrator.ingestProspects(rawLeads);

      // Automatically run qualification & research on the ingested batch
      await orchestrator.qualifyRawProspects();
      await orchestrator.researchAndPersonalize();
      await dbClient.flush();

      sendJson(res, 200, {
        success: true,
        message: 'Leads processed and triaged successfully',
        ...ingestResult,
      });
      return;
    }

    // 3. Human Approval Webhook (Telegram callback or 1-Click UI button)
    if (method === 'POST' && pathname.startsWith('/webhook/approve/')) {
      const leadId = decodeURIComponent(pathname.replace('/webhook/approve/', ''));
      console.log(`[WebhookServer] Human Approval triggered for: ${leadId}`);
      const updated = telegramApprovalService.handleApprovalAction(leadId, 'approve');
      if (updated) {
        // Automatically dispatch to Gmail draft / social task
        let message = 'Approved.';
        try {
          message = (await gmailDispatcher.dispatchApprovedOutreach(leadId)).message;
        } catch (err) {
          message = `Approved, but the Gmail draft failed: ${(err as Error).message}`;
        }
        await dbClient.flush();
        sendJson(res, 200, { success: true, message, lead: updated });
      } else {
        sendJson(res, 404, { success: false, error: 'Lead not found' });
      }
      return;
    }

    if (method === 'POST' && pathname.startsWith('/webhook/reject/')) {
      const leadId = decodeURIComponent(pathname.replace('/webhook/reject/', ''));
      console.log(`[WebhookServer] Human Rejection triggered for: ${leadId}`);
      const updated = telegramApprovalService.handleApprovalAction(leadId, 'reject');
      if (!updated) {
        sendJson(res, 404, { success: false, error: 'Lead not found' });
        return;
      }
      await dbClient.flush();
      sendJson(res, 200, { success: true, message: `Lead ${leadId} marked as rejected`, lead: updated });
      return;
    }

    // 3a. "Find leads" button: status, search, then process the queue a few sites at a time
    if (pathname === '/api/finder/status' && method === 'GET') {
      sendJson(res, 200, { ...(await queueCounts()), ready: finderReady() });
      return;
    }
    if (pathname === '/api/finder/search' && method === 'POST') {
      if (!finderReady()) {
        sendJson(res, 503, { error: 'Lead finder keys are not set on the server.' });
        return;
      }
      const result = await searchIntoQueue();
      sendJson(res, 200, { ...result, ...(await queueCounts()) });
      return;
    }
    if (pathname === '/api/finder/next' && method === 'POST') {
      if (!finderReady()) {
        sendJson(res, 503, { error: 'Lead finder keys are not set on the server.' });
        return;
      }
      const step = await processNext(async (rec) => {
        dbClient.upsert(rec);
        await dbClient.flush();
      }, 3);
      sendJson(res, 200, step);
      return;
    }

    // 3b-1. Read the rusan@ mailbox: sent emails, replies, bounces (read-only). {dry:true} changes nothing.
    if (method === 'POST' && pathname === '/api/mailbox/sync') {
      if (!mailboxConfigured()) {
        sendJson(res, 503, { error: 'The mailbox is not connected on the server.' });
        return;
      }
      const body = await parseJsonBody(req).catch(() => ({}));
      const all = dbClient.getAll();
      const target = body.dry ? all.map((l) => JSON.parse(JSON.stringify(l))) : all;
      const { changed, summary } = await syncMailbox(target);
      if (!body.dry) {
        for (const l of changed) dbClient.upsert(l);
        await dbClient.flush();
      }
      sendJson(res, 200, { dry: Boolean(body.dry), changed: changed.length, ...summary });
      return;
    }

    // 3b-2. Follow-up draft, threaded under the last email sent to this lead.
    if (method === 'POST' && /^\/api\/leads\/[^/]+\/followup$/.test(pathname)) {
      const lead = dbClient.getById(decodeURIComponent(pathname.split('/')[3]));
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });
      const next = nextFollowUp(lead);
      if (next.step === 0) return sendJson(res, 400, { error: next.why });
      if (!mailboxConfigured()) return sendJson(res, 503, { error: 'The mailbox is not connected on the server.' });
      const { subject, body } = followUpText(lead, next.step);
      await createMailboxDraft({ to: lead.email, subject, body, inReplyTo: lead.lastMessageId });
      lead.notes = `${lead.notes ? lead.notes + '\n' : ''}Follow-up ${next.step} draft saved ${new Date().toISOString().split('T')[0]} in ${mailboxUser()} Drafts.`;
      dbClient.upsert(lead);
      await dbClient.flush();
      sendJson(res, 200, { success: true, message: `Follow-up ${next.step} to ${lead.email} is in the Drafts folder, threaded under your first email.`, lead });
      return;
    }

    // 3b-4. SEND (only from a click on the dashboard). First email, or the next due follow-up.
    if (method === 'POST' && pathname === '/api/digest/run') {
      if (!mailboxConfigured()) return sendJson(res, 503, { error: 'The mailbox is not connected on the server.' });
      sendJson(res, 200, { success: true, ...(await runDigest()) });
      return;
    }
    if (method === 'POST' && pathname === '/api/settings/backup') {
      const body = await parseJsonBody(req);
      if (typeof body.on !== 'boolean') return sendJson(res, 400, { error: 'on must be true or false' });
      await setSetting(BACKUP_KEY, body.on);
      sendJson(res, 200, { success: true, backup: body.on });
      return;
    }
    if (method === 'GET' && pathname === '/api/send/status') {
      sendJson(res, 200, { ...(await sentToday()), firstCap: FIRST_CAP, totalCap: TOTAL_CAP, backup: await getSetting(BACKUP_KEY, true) });
      return;
    }
    if (method === 'POST' && /^\/api\/leads\/[^/]+\/(send|send-followup)$/.test(pathname)) {
      const parts = pathname.split('/');
      const lead = dbClient.getById(decodeURIComponent(parts[3]));
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });
      if (!mailboxConfigured()) return sendJson(res, 503, { error: 'The mailbox is not connected on the server.' });
      try {
        const body = await parseJsonBody(req).catch(() => ({}));
        const message = parts[4] === 'send' ? await sendFirstEmail(lead, body.override === true) : await sendFollowUpEmail(lead);
        dbClient.upsert(lead);
        await dbClient.flush();
        sendJson(res, 200, { success: true, message, lead });
      } catch (err) {
        sendJson(res, 400, { error: (err as Error).message });
      }
      return;
    }
    if (method === 'POST' && pathname === '/api/followups/send-due') {
      if (!mailboxConfigured()) return sendJson(res, 503, { error: 'The mailbox is not connected on the server.' });
      const stop = Date.now() + 240_000;
      const sent: string[] = [];
      const failed: string[] = [];
      for (const lead of followUpsDue(dbClient.getAll())) {
        if (Date.now() > stop) break;
        try {
          await sendFollowUpEmail(lead);
          dbClient.upsert(lead);
          await dbClient.flush();
          sent.push(lead.company || lead.email);
          await sleep(8000); // spaced out, not a burst
        } catch (err) {
          failed.push(`${lead.company || lead.email}: ${(err as Error).message}`);
        }
      }
      const left = followUpsDue(dbClient.getAll()).length;
      sendJson(res, 200, { success: true, sent, failed, left, message: `${sent.length} follow-up(s) sent${failed.length ? `, ${failed.length} not sent` : ''}${left ? `, ${left} still due (press again)` : ''}.` });
      return;
    }

    // 3b-3. Check one address with the email verifier.
    if (method === 'POST' && /^\/api\/leads\/[^/]+\/verify$/.test(pathname)) {
      const lead = dbClient.getById(decodeURIComponent(pathname.split('/')[3]));
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });
      if (!lead.email) return sendJson(res, 400, { error: 'No email address to check.' });
      const r = await verifyEmail(lead.email);
      lead.emailVerificationStatus = r.result;
      dbClient.upsert(lead);
      await dbClient.flush();
      sendJson(res, 200, { success: true, message: `${lead.email}: ${r.result} (${r.detail}).`, lead });
      return;
    }

    // 3b. Edit a lead from the dashboard (email address, email text, status, notes)
    if (method === 'POST' && pathname.startsWith('/api/leads/')) {
      const leadId = decodeURIComponent(pathname.slice('/api/leads/'.length));
      const lead = dbClient.getById(leadId);
      if (!lead) {
        sendJson(res, 404, { error: 'Lead not found' });
        return;
      }
      const body = await parseJsonBody(req);
      if (typeof body.email === 'string') {
        const email = body.email.trim().toLowerCase();
        if (email && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
          sendJson(res, 400, { error: 'That email address does not look right.' });
          return;
        }
        if (email !== lead.email) lead.emailVerificationStatus = email ? 'unverified' : 'unknown';
        lead.email = email;
        if (email) lead.recommendedChannel = 'email';
      }
      if (typeof body.draftEmail === 'string') {
        // Rusan edited or approved the text himself, so the automatic flag no longer applies.
        if (body.draftEmail.trim() !== String(lead.draftEmail || '').trim() || body.clearLook === true) lead.needsLook = '';
        lead.draftEmail = body.draftEmail.slice(0, 8000);
      }
      if (typeof body.notes === 'string') lead.notes = body.notes.slice(0, 8000);
      if (typeof body.status === 'string') {
        if (!EDITABLE_STATUSES.includes(body.status)) {
          sendJson(res, 400, { error: 'Unknown status' });
          return;
        }
        lead.status = body.status;
        if (body.status === 'Contacted' && !lead.dateContacted) lead.dateContacted = new Date().toISOString().split('T')[0];
        if (body.status === 'Contacted' && !lead.followUp1) scheduleFollowUps(lead);
      }
      dbClient.upsert(lead);
      await dbClient.flush();
      sendJson(res, 200, { success: true, lead });
      return;
    }

    // 4. API: Get all leads
    if (method === 'GET' && pathname === '/api/leads') {
      const statusFilter = parsedUrl.searchParams.get('status') || '';
      let leads = dbClient.getAll();
      if (statusFilter) {
        leads = leads.filter((l) => l.status.toLowerCase() === statusFilter.toLowerCase());
      }
      // Extra fields for the dashboard (not stored): shared-inbox flag and the next follow-up.
      const view = leads.map((l) => ({ ...l, sharedInbox: Boolean(l.email) && !isPersonalEmail(l.email), next: nextFollowUp(l) }));
      sendJson(res, 200, { total: view.length, leads: view, verifier: verifierConfigured() });
      return;
    }

    // 5. API: Get live analytics metrics
    if (method === 'GET' && pathname === '/api/analytics') {
      const metrics = AnalyticsEngine.computeMetrics(dbClient.getAll());
      sendJson(res, 200, metrics);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[WebhookServer] Error processing request:', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong. Check the server logs.' });
  }
}

export const server = http.createServer((req, res) => {
  void handleRequest(req, res);
});

function renderLoginHtml(message = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Sign in · Leads</title>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=3">
<link rel="icon" type="image/png" sizes="512x512" href="/favicon.png?v=3">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3">
  <script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #fff; --ink: #252B31; --grey: #707879; --line: #E6E3EC; --p: #8B6CB8; --p-dark: #74579F; --on-p: #fff; --warn: #A4513F; color-scheme: light; }
    :root[data-theme="dark"] { --bg: #121418; --ink: #E9E7EE; --grey: #959A9E; --line: #2B2F36; --p: #A88DD3; --p-dark: #BBA4DE; --on-p: #16181C; --warn: #E09A86; color-scheme: dark; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #121418; --ink: #E9E7EE; --grey: #959A9E; --line: #2B2F36; --p: #A88DD3; --p-dark: #BBA4DE; --on-p: #16181C; --warn: #E09A86; color-scheme: dark; } }
    * { box-sizing: border-box; margin: 0; }
    body { min-height: 100dvh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--ink);
      font: 15px/1.5 Inter, system-ui, sans-serif; }
    form { width: 100%; max-width: 340px; display: grid; gap: 14px; }
    .brand { font-family: "JetBrains Mono", monospace; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--p); }
    h1 { font-family: "Instrument Serif", Georgia, serif; font-weight: 400; font-size: 44px; line-height: 1; }
    label { font-size: 13px; color: var(--grey); }
    input { width: 100%; padding: 11px 13px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font: inherit; }
    input:focus { outline: 2px solid var(--p); outline-offset: 1px; }
    button { padding: 11px 14px; border-radius: 8px; border: 0; background: var(--p); color: var(--on-p); font: inherit; font-weight: 500; cursor: pointer; }
    button:hover { background: var(--p-dark); }
    button:active { transform: translateY(1px); }
    .msg { color: var(--warn); font-size: 14px; }
  </style>
</head>
<body>
  <form method="POST" action="/login">
    <div class="brand">Axioms Digital</div>
    <h1>Leads</h1>
    ${message ? `<p class="msg" role="alert">${escapeHtml(message)}</p>` : ''}
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
    <button type="submit">Sign in</button>
  </form>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 EXECUTIVE LEAD INTAKE & TRIAGE WEBHOOK SERVER RUNNING`);
    console.log(`======================================================`);
    console.log(`• Webhook Endpoint:  http://localhost:${PORT}/webhook/ingest`);
    console.log(`• Live Dashboard:    http://localhost:${PORT}/dashboard`);
    console.log(`• Leads API:         http://localhost:${PORT}/api/leads`);
    console.log(`• Analytics API:     http://localhost:${PORT}/api/analytics`);
    console.log(`======================================================\n`);
  });
}
