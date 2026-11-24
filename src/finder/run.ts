/**
 * Shared lead-finder steps, used by both the terminal command (npm run find-leads) and the
 * "Find leads" button on the dashboard.
 *
 * The button can't do everything in one request (serverless time limits), so work is split:
 *   1. searchIntoQueue(): Google search -> new candidate sites go into the finder_queue table
 *   2. processNext(): reads + scores a few queued sites per call and saves good ones as leads
 * The browser keeps calling step 2 until the queue is empty.
 */
import { verifyEmail, verifierConfigured } from '../outreach/verify-email';
import { isPersonalEmail } from '../outreach/email-rules';
export { isPersonalEmail };
import { CONFIG } from '../config';
import { ProspectMasterRecord, PipelineStatus } from '../types';
import { ensureSchema, getSql } from '../db/pg';
import { readSite, domainOf, domainAcceptsMail } from './site';
import { analyzeSite, composeEmail } from './analyze';

export const QUERY_POOL = [
  '"executive coach" "book a consultation"',
  '"leadership coach" "work with me"',
  '"executive coaching" "discovery call" founders',
  '"leadership coach" "free consultation" senior leaders',
  '"executive coach" "corporate clients" "contact"',
  '"leadership development" coach "book a call"',
  '"executive coach" "ICF" "PCC" "book"',
  '"career coach" executives "book a consultation"',
  '"team coaching" "leadership coach" "get in touch"',
  '"business coach" consultants "book a discovery call"',
  '"executive coach" "New York" OR "Chicago" OR "Austin" "consultation"',
  '"leadership coach" "California" OR "Texas" OR "Florida" "book a call"',
  '"executive coach" "Denver" OR "Seattle" OR "Atlanta" OR "Boston" "work with me"',
];

const SKIP_HOSTS = ['linkedin.', 'indeed.', 'glassdoor.', 'ziprecruiter.', 'forbes.', 'hbr.org', 'youtube.', 'facebook.', 'instagram.',
  'wikipedia.', 'coursera.', 'udemy.', 'psychologytoday.', 'coachingfederation.', 'ccl.org', 'mckinsey.', 'bcg.', 'deloitte.',
  'kornferry.', 'gartner.', 'reddit.', 'quora.', 'medium.', 'amazon.', 'betterup.', 'clutch.co', 'upwork.', 'fiverr.', 'noomii.',
  'thumbtack.', 'yelp.', 'tiktok.', 'x.com', 'twitter.', 'pinterest.', 'eventbrite.', 'substack.', 'apple.com', 'spotify.',
  '.gov', '.edu', 'ac.uk', 'harvard.', 'ezra.', 'torch.io', 'coach.me', 'bark.com', 'trustpilot.', 'nytimes.', 'inc.com',
  'entrepreneur.com', 'fastcompany.', 'shrm.org', 'themuse.', 'verywellmind.', 'mentorcliq.', 'sharpheels.', 'indiamart.', 'justdial.', 'sulekha.', 'mentorcruise.', 'yellowpages.', 'gumtree.', 'olx.', 'naukri.', 'jobstreet.', 'seek.com'];

// Target markets: rich, mostly Western countries (easier to sell to). Weight = how often a click searches it,
// so the US, UK, Canada and Australia come up most. Leads based anywhere else are moved to "Not a fit".
export const MARKETS: Record<string, { name: string; weight: number; aliases: RegExp }> = {
  us: { name: 'United States', weight: 6, aliases: /^(us|usa|u\.s\.a?\.?|united states( of america)?|america)$/i },
  gb: { name: 'United Kingdom', weight: 4, aliases: /^(uk|u\.k\.|gb|great britain|united kingdom|britain|england|scotland|wales|northern ireland)$/i },
  ca: { name: 'Canada', weight: 3, aliases: /^canada$/i },
  au: { name: 'Australia', weight: 3, aliases: /^australia$/i },
  nz: { name: 'New Zealand', weight: 1, aliases: /^new zealand$/i },
  ie: { name: 'Ireland', weight: 1, aliases: /^(ireland|republic of ireland)$/i },
  de: { name: 'Germany', weight: 1, aliases: /^(germany|deutschland)$/i },
  nl: { name: 'Netherlands', weight: 1, aliases: /^(netherlands|the netherlands|holland)$/i },
  ch: { name: 'Switzerland', weight: 1, aliases: /^switzerland$/i },
  se: { name: 'Sweden', weight: 1, aliases: /^sweden$/i },
  no: { name: 'Norway', weight: 1, aliases: /^norway$/i },
  dk: { name: 'Denmark', weight: 1, aliases: /^denmark$/i },
  fi: { name: 'Finland', weight: 1, aliases: /^finland$/i },
  be: { name: 'Belgium', weight: 1, aliases: /^belgium$/i },
  at: { name: 'Austria', weight: 1, aliases: /^austria$/i },
  fr: { name: 'France', weight: 1, aliases: /^france$/i },
  lu: { name: 'Luxembourg', weight: 1, aliases: /^luxembourg$/i },
  sg: { name: 'Singapore', weight: 1, aliases: /^singapore$/i },
  ae: { name: 'United Arab Emirates', weight: 1, aliases: /^(uae|u\.a\.e\.|united arab emirates|dubai|abu dhabi)$/i },
  hk: { name: 'Hong Kong', weight: 1, aliases: /^hong kong$/i },
  il: { name: 'Israel', weight: 1, aliases: /^israel$/i },
};
export const COUNTRY_NAME: Record<string, string> = Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, v.name]));
export const ALL_COUNTRIES = Object.keys(MARKETS);

/** Picks `n` different markets at random, favouring the heavier-weighted ones. */
export function pickMarkets(n = 3): string[] {
  const pool = Object.entries(MARKETS).flatMap(([code, m]) => Array(m.weight).fill(code) as string[]);
  const out: string[] = [];
  while (out.length < n && out.length < ALL_COUNTRIES.length) {
    const c = pool[Math.floor(Math.random() * pool.length)];
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** True when a stated location is one of the target markets (unknown location counts as in). */
export function inTargetMarket(country: string): boolean {
  const c = country.trim().replace(/\.$/, '');
  if (!c) return true;
  return Object.values(MARKETS).some((m) => m.aliases.test(c) || m.name.toLowerCase() === c.toLowerCase());
}

export function shuffle<T>(a: T[]): T[] {
  return a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
}

export function skipHost(host: string): boolean {
  return !host || SKIP_HOSTS.some((s) => host.includes(s));
}

export async function googleSearch(queries: string[], country: string): Promise<{ url: string; title: string }[]> {
  const token = CONFIG.apify.token;
  if (!token) throw new Error('APIFY_TOKEN is missing');
  const res = await fetch(`https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries: queries.join('\n'), resultsPerPage: 10, maxPagesPerQuery: 2, countryCode: country, mobileResults: false }),
  });
  if (!res.ok) throw new Error(`Google search (Apify) failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const pages = (await res.json()) as any[];
  return pages.flatMap((p) => (p.organicResults || []).map((r: any) => ({ url: String(r.url || ''), title: String(r.title || '') })));
}

function statusFor(score: number): PipelineStatus {
  if (score >= CONFIG.thresholds.aPlus) return 'A+';
  if (score >= CONFIG.thresholds.a) return 'A';
  if (score >= CONFIG.thresholds.b) return 'B';
  return 'Rejected';
}

function newId(): string {
  return `LEAD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
}

function baseRecord(url: string, country: string): ProspectMasterRecord {
  const today = new Date().toISOString().split('T')[0];
  return {
    leadId: newId(), firstName: '', lastName: '', fullName: '', company: '', jobTitle: '', website: url, linkedInUrl: '',
    instagramUrl: '', xUrl: '', country, niche: 'Coach', corporateFocus: '', offer: '', estimatedOfferValue: '',
    leadCaptureMethod: '', recentBusinessSignal: '', potentialPain: '', email: '', emailVerificationStatus: 'unknown',
    source: 'google', icpScore: 0, economicScore: 0, corporateScore: 0, inboundScore: 0, founderLedScore: 0, painScore: 0,
    buyingSignalScore: 0, verifiedEvidence: '', inference: '', unknowns: '', qualificationReason: '', whyNow: '',
    personalizationAngle: '', recommendedChannel: '', draftEmail: '', draftLinkedInMessage: '', draftInstagramMessage: '',
    draftXMessage: '', status: 'Raw', dateAdded: today, dateContacted: '', followUp1: '', followUp2: '', response: '',
    positiveResponse: '', callBooked: '', proposal: '', closed: '', notes: '',
  };
}

/** Reads one site, scores it and returns a lead record (good or "not a fit"), or a reason it was skipped. */
export async function processSite(url: string, country: string): Promise<{ record?: ProspectMasterRecord; skipped?: string }> {
  const site = await readSite(url);
  if (!site.reachable) return { skipped: 'site did not load' };
  // Only firms with a personal address (Rusan's rule, 23 Nov). Checked before the AI call so no AI quota is spent.
  site.emails = site.emails.filter((e) => isPersonalEmail(e.address));
  if (!site.emails.length) return { skipped: 'no personal email (only a shared inbox like info@ or none)' };
  const a = await analyzeSite(site);
  const today = new Date().toISOString().split('T')[0];
  const rec = baseRecord(`https://${site.domain}`, a.country || COUNTRY_NAME[country] || '');

  rec.company = a.company || site.title.split(/[|–—-]/)[0].trim() || site.domain;
  rec.fullName = a.personName || rec.company;
  rec.firstName = a.firstName || '';
  rec.lastName = a.personName && a.firstName ? a.personName.replace(a.firstName, '').trim() : '';
  rec.jobTitle = a.kind === 'firm' ? 'Coaching firm' : 'Coach';
  rec.offer = a.services.join(', ');
  rec.corporateFocus = a.audience;
  rec.linkedInUrl = site.linkedInUrl;
  rec.instagramUrl = site.instagramUrl;
  rec.leadCaptureMethod = [site.bookingTool && `Booking (${site.bookingTool})`, site.hasForm && 'Contact form', site.emails.length && 'Email'].filter(Boolean).join(', ');
  // Buying signals lift the score a little (max +12) so these leads are worked first.
  rec.recentBusinessSignal = site.signals.join('; ');
  rec.icpScore = a.isTarget ? Math.min(100, a.score + Math.min(12, site.signals.length * 6)) : a.score;
  rec.qualificationReason = a.isTarget ? a.fitReason : `Not a fit: ${a.reasonIfNot}`;
  rec.verifiedEvidence = a.facts.join('; ');
  rec.status = a.isTarget ? statusFor(rec.icpScore) : 'Rejected';


  for (const e of site.emails) {
    const d = e.address.split('@')[1];
    if (!d.endsWith(site.domain) && site.emails.some((x) => x.address.endsWith(site.domain))) continue;
    if (!(await domainAcceptsMail(d))) continue;
    // With a verifier key, skip addresses that would bounce and try the next one.
    let check: { result: string; detail: string } = { result: 'unverified', detail: 'mail server OK' };
    if (verifierConfigured()) {
      try { check = await verifyEmail(e.address); } catch (err) { check = { result: 'unknown', detail: (err as Error).message }; }
      if (check.result === 'invalid') continue;
    }
    rec.email = e.address;
    rec.emailVerificationStatus = check.result as ProspectMasterRecord['emailVerificationStatus'];
    rec.notes = `Email from ${e.page} on their site; ${check.detail}.`;
    break;
  }
  if (rec.status !== 'Rejected' && !inTargetMarket(a.country)) {
    rec.status = 'Rejected';
    rec.qualificationReason = `Not a fit: based in ${a.country}, outside your target markets.`;
  }
  rec.recommendedChannel = rec.email ? 'email' : rec.linkedInUrl ? 'linkedin' : '';
  if (rec.status !== 'Rejected') rec.draftEmail = composeEmail(a, site.domain);
  rec.needsLook = rec.status !== 'Rejected' && a.problems.length ? a.problems.join('; ') : '';
  rec.notes = [rec.notes, `Found ${today} by lead finder (pages read: ${site.pagesRead.join(', ')}; AI: ${a.model}).`].filter(Boolean).join(' ');
  return { record: rec };
}

// ---------------- queue for the dashboard button ----------------

async function ensureQueue() {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`
    create table if not exists finder_queue (
      domain     text primary key,
      country    text not null,
      status     text not null default 'pending',
      note       text not null default '',
      updated_at timestamptz not null default now()
    )`;
  return sql;
}

export async function queueCounts(): Promise<{ pending: number }> {
  const sql = await ensureQueue();
  // Sites stuck "working" for 10+ minutes (closed tab, timeout) go back in the queue.
  await sql`update finder_queue set status = 'pending' where status = 'working' and updated_at < now() - interval '10 minutes'`;
  const rows = await sql<{ n: number }[]>`select count(*)::int as n from finder_queue where status = 'pending'`;
  return { pending: rows[0].n };
}

/** Runs a Google search and adds new, unseen sites to the queue. */
export async function searchIntoQueue(countries: string[] = pickMarkets(3)): Promise<{ found: number; added: number; countries: string[] }> {
  const sql = await ensureQueue();
  const known = new Set((await sql<{ w: string }[]>`select data->>'website' as w from prospects`).map((r) => domainOf(r.w || '')));
  const queued = new Set((await sql<{ domain: string }[]>`select domain from finder_queue`).map((r) => r.domain));
  // One Google search per country, run in parallel; a country that fails is skipped, the rest still count.
  const runs = await Promise.allSettled(countries.map((c) => googleSearch(shuffle(QUERY_POOL).slice(0, 3), c).then((r) => ({ c, r }))));
  let added = 0, found = 0;
  const seen = new Set<string>();
  for (const run of runs) {
    if (run.status !== 'fulfilled') continue;
    found += run.value.r.length;
    for (const r of run.value.r) {
      const host = domainOf(r.url);
      if (skipHost(host) || seen.has(host) || known.has(host) || queued.has(host)) continue;
      seen.add(host);
      await sql`insert into finder_queue (domain, country) values (${host}, ${run.value.c}) on conflict (domain) do nothing`;
      added++;
    }
  }
  if (runs.every((r) => r.status === 'rejected')) throw (runs[0] as PromiseRejectedResult).reason;
  return { found, added, countries };
}

export interface StepResult {
  checked: { domain: string; company?: string; status?: string; score?: number; email?: string; skipped?: string }[];
  pending: number;
}

/** Processes up to `count` queued sites in parallel and saves the results as leads. */
export async function processNext(
  save: (rec: ProspectMasterRecord) => Promise<void>,
  count = 3
): Promise<StepResult> {
  const sql = await ensureQueue();
  const batch = await sql<{ domain: string; country: string }[]>`
    update finder_queue set status = 'working', updated_at = now()
    where domain in (select domain from finder_queue where status = 'pending' order by updated_at limit ${count} for update skip locked)
    returning domain, country`;

  const checked = await Promise.all(
    batch.map(async ({ domain, country }) => {
      try {
        const { record, skipped } = await Promise.race([
          processSite(`https://${domain}`, country),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('took too long (over 170 s)')), 170_000)),
        ]);
        if (!record) {
          await sql`update finder_queue set status = 'skipped', note = ${skipped || ''}, updated_at = now() where domain = ${domain}`;
          return { domain, skipped };
        }
        await save(record);
        await sql`update finder_queue set status = 'done', updated_at = now() where domain = ${domain}`;
        return { domain, company: record.company, status: record.status, score: record.icpScore, email: record.email };
      } catch (err) {
        const msg = (err as Error).message.slice(0, 200);
        await sql`update finder_queue set status = 'skipped', note = ${msg}, updated_at = now() where domain = ${domain}`;
        return { domain, skipped: msg };
      }
    })
  );
  const { pending } = await queueCounts();
  return { checked, pending };
}
