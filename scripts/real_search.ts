// Real discovery run (no seed/mock prospects, no Telegram pings). Run: npx ts-node scripts/real_search.ts
import { orchestrator } from '../src/index';
import { CONFIG } from '../src/config';
import { telegramApprovalService } from '../src/outreach/telegram-approval';
import { dbClient } from '../src/db/sheets-client';

// Directories, job boards, media and big institutions: not founder-led coaches.
const SKIP = ['linkedin.', 'indeed.', 'glassdoor.', 'ziprecruiter.', 'forbes.', 'hbr.org', 'youtube.', 'facebook.', 'instagram.',
  'wikipedia.', 'coursera.', 'udemy.', 'psychologytoday.', 'coachingfederation.', 'ccl.org', 'mckinsey.', 'bcg.', 'deloitte.',
  'kornferry.', 'gartner.', 'reddit.', 'quora.', 'medium.', 'amazon.', 'glassdoor', 'betterup.', 'clutch.co', 'upwork.', 'fiverr.'];

(async () => {
  (telegramApprovalService as any).sendForReview = async () => ({ success: true, simulated: true });
  const queries = [
    '"executive coach" "book a consultation" leadership',
    '"leadership coach" "work with me" managers',
    '"leadership consultant" "corporate clients" coaching',
  ];
  // Google search through Apify's google-search-scraper actor. No mock fallback: if it fails, stop.
  const token = CONFIG.apify.token;
  if (!token) throw new Error('APIFY_TOKEN is empty');
  const found = [] as any[];
  for (const cc of ['us', 'gb']) {
    const run = await fetch(`https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${token}&timeout=240`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: queries.join('\n'), resultsPerPage: 10, maxPagesPerQuery: 1, countryCode: cc, mobileResults: false }),
    });
    if (!run.ok) throw new Error(`Apify search failed: HTTP ${run.status} ${(await run.text()).slice(0, 300)}`);
    const pages = (await run.json()) as any[];
    for (const pg of pages) for (const item of (pg.organicResults || [])) {
      const parts = String(item.title || '').split(/[-|–—:]/);
      found.push({ fullName: parts[0]?.trim() || '', company: parts[0]?.trim() || '', jobTitle: parts[1]?.trim() || 'Leadership coach',
        website: item.url, country: cc === 'gb' ? 'United Kingdom' : 'United States', niche: 'Executive Coach',
        snippet: item.description || '', source: 'google', rawPayload: item });
    }
  }
  const seen = new Set<string>();
  const filtered = found.filter((l) => {
    const host = (() => { try { return new URL(l.website).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    if (!host || SKIP.some((s) => host.includes(s)) || seen.has(host)) return false;
    seen.add(host); l.website = `https://${host}`; return true;
  });
  console.log(`[real_search] ${found.length} search results -> ${filtered.length} unique candidate websites`);
  await orchestrator.ingestProspects(filtered);
  await orchestrator.qualifyRawProspects();
  await orchestrator.researchAndPersonalize();
  const all = dbClient.getAll();
  console.log('\n[real_search] RESULT');
  for (const p of all) console.log(`${p.status.padEnd(17)} ${String(p.icpScore).padStart(3)}  ${p.company}  ${p.website}`);
})();
