/**
 * Finds new coaching leads from the terminal and puts them straight into the online dashboard.
 * (The dashboard's "Find US leads" button does the same thing.)
 *   npm run find-leads                       -> ~25 new websites from 3 random countries
 *   npm run find-leads -- --max 40 --countries us,ca
 *   npm run find-leads -- --dry              -> show results, save nothing
 * Nothing is ever sent. No fake or fallback leads: a site that fails is skipped and reported.
 */
import { execFileSync } from 'child_process';

if (!process.env.DATABASE_URL) {
  try {
    process.env.DATABASE_URL = execFileSync('security', ['find-generic-password', '-s', 'axioms-leads-db', '-w'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { /* checked below */ }
}

/* Loaded after DATABASE_URL is set so the store opens in cloud mode. */
const { dbClient } = require('../src/db/sheets-client') as typeof import('../src/db/sheets-client');
const { closeSql } = require('../src/db/pg') as typeof import('../src/db/pg');
const { domainOf } = require('../src/finder/site') as typeof import('../src/finder/site');
const { googleSearch, processSite, shuffle, skipHost, QUERY_POOL, pickMarkets } = require('../src/finder/run') as typeof import('../src/finder/run');
import type { ProspectMasterRecord } from '../src/types';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const MAX = Math.max(1, Math.min(80, Number(arg('max', '25'))));
const COUNTRIES = arg('countries', pickMarkets(3).join(',')).split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
const DRY = args.includes('--dry');

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('No database connection (Keychain item "axioms-leads-db" missing).');
  await dbClient.ready();
  const known = new Set(dbClient.getAll().map((r) => domainOf(r.website)).filter(Boolean));
  console.log(`Dashboard has ${known.size} sites already. Searching ${COUNTRIES.join(', ').toUpperCase()}...`);

  const queries = shuffle(QUERY_POOL).slice(0, 4);
  const candidates: { url: string; country: string }[] = [];
  const seen = new Set<string>();
  for (const cc of COUNTRIES) {
    for (const r of await googleSearch(queries, cc)) {
      const host = domainOf(r.url);
      if (skipHost(host) || seen.has(host) || known.has(host)) continue;
      seen.add(host);
      candidates.push({ url: `https://${host}`, country: cc });
    }
  }
  const batch = candidates.slice(0, MAX);
  console.log(`${candidates.length} new sites found; checking ${batch.length}.\n`);

  const saved: ProspectMasterRecord[] = [];
  const skipped: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < batch.length) {
      const { url, country } = batch[next++];
      try {
        const { record, skipped: why } = await processSite(url, country);
        if (!record) { skipped.push(`${url}: ${why}`); continue; }
        saved.push(record);
        const tag = record.status === 'Rejected' ? 'skip' : record.status;
        console.log(`${tag.padEnd(5)} ${String(record.icpScore).padStart(3)}  ${(record.email || '-').padEnd(34)} ${record.company}`);
        if (!DRY) dbClient.upsert(record);
      } catch (err) {
        skipped.push(`${url}: ${(err as Error).message}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (!DRY) await dbClient.flush();

  const good = saved.filter((r) => r.status !== 'Rejected');
  console.log(`\nDone. ${good.length} good leads (${good.filter((r) => r.email).length} with email), ${saved.length - good.length} not a fit, ${skipped.length} skipped.`);
  if (skipped.length) console.log('Skipped:\n  ' + skipped.join('\n  '));
  console.log(DRY ? '\nDry run: nothing saved.' : '\nSaved to the dashboard: https://leads.axiomsdigital.com');
  await closeSql();
})().catch(async (err) => {
  console.error('Lead finder stopped:', err.message);
  await closeSql().catch(() => undefined);
  process.exit(1);
});
