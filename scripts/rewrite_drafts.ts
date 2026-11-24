/**
 * Rewrites the email for every lead still waiting in "To review" using the current email writer.
 * Keeps score, status and notes; only the email text changes.  npm run rewrite-drafts [-- --dry]
 */
import { execFileSync } from 'child_process';
if (!process.env.DATABASE_URL) {
  try { process.env.DATABASE_URL = execFileSync('security', ['find-generic-password', '-s', 'axioms-leads-db', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* checked below */ }
}
const { dbClient } = require('../src/db/sheets-client') as typeof import('../src/db/sheets-client');
const { closeSql } = require('../src/db/pg') as typeof import('../src/db/pg');
const { readSite } = require('../src/finder/site') as typeof import('../src/finder/site');
const { analyzeSite, composeEmail } = require('../src/finder/analyze') as typeof import('../src/finder/analyze');

const DRY = process.argv.includes('--dry');
const REVIEW = ['A+', 'A', 'B', 'Ready for Review'];

(async () => {
  await dbClient.ready();
  const todo = dbClient.getAll().filter((l) => REVIEW.includes(l.status));
  console.log(`Rewriting ${todo.length} emails...\n`);
  let next = 0, ok = 0;
  const failed: string[] = [];
  const worker = async () => {
    while (next < todo.length) {
      const lead = todo[next++];
      try {
        const site = await readSite(lead.website);
        if (!site.reachable) throw new Error('site did not load');
        const a = await analyzeSite(site);
        if (!a.isTarget || !a.emailBody) throw new Error('AI says not a fit now; left unchanged');
        lead.draftEmail = composeEmail(a, site.domain);
        ok++;
        console.log(`--- ${lead.fullName} (${lead.email || 'no email'})\n${lead.draftEmail}\n`);
        if (!DRY) dbClient.upsert(lead);
      } catch (err) {
        failed.push(`${lead.fullName}: ${(err as Error).message}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (!DRY) await dbClient.flush();
  console.log(`Done: ${ok} rewritten${failed.length ? `, ${failed.length} unchanged:\n  ` + failed.join('\n  ') : '.'}`);
  await closeSql();
})().catch(async (e) => { console.error(e.message); await closeSql().catch(() => undefined); process.exit(1); });
