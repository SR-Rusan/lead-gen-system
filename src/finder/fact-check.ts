/**
 * Fact checks on an AI-written email, against the lead's own website text.
 * They catch the mistakes that matter most before Rusan ever sees the email:
 *   - greeting name that doesn't match the address (the "Hi Helen" sent to susan@ case)
 *   - greeting name that isn't on their site at all
 *   - quotes that aren't really on their site
 *   - numbers that aren't on their site
 *   - names of people or companies that aren't on their site
 *   - placeholder text
 * Empty list = passed.
 */

const norm = (s: string) =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/&/g, ' and ').replace(/[^a-z0-9'%$ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Capitalised words that are fine without being on their site.
const COMMON = new Set(
  ('i im id ive ill hi hey hello dear rusan axioms digital want would worth could my the a an and or but if it its this that these those your you ' +
    'probably maybe wonder guess hunch suspect imagine set system coaches coach ceo ceos cfo cto coo vp hr ai linkedin email monday tuesday wednesday ' +
    'thursday friday saturday sunday january february march april may june july august september october november december ' +
    'it’s that’s there’s here’s what’s who’s they’re we’re you’re he she they we when where which who how why one two').split(' ')
);

/** True when most of the quote's 3-word runs appear in the site text (allows tiny wording changes). */
function quoteOnSite(quote: string, site: string): boolean {
  const q = norm(quote);
  if (!q) return true;
  if (site.includes(q)) return true;
  const w = q.split(' ');
  if (w.length < 4) return site.includes(q);
  let hit = 0, total = 0;
  for (let i = 0; i + 3 <= w.length; i++) {
    total++;
    if (site.includes(w.slice(i, i + 3).join(' '))) hit++;
  }
  return hit / total >= 0.7;
}

export function factProblems(opts: { subject: string; body: string; email: string; siteText: string }): string[] {
  const p: string[] = [];
  const site = norm(opts.siteText);
  const body = opts.body || '';
  const all = `${opts.subject}\n${body}`;

  // Placeholders or template leftovers.
  if (/[[\]{}<>]|lorem|\btodo\b|\bxx+\b|\bundefined\b|\bnull\b|first name|company name|\{\{/i.test(all)) p.push('has placeholder text');

  // Greeting name.
  const g = body.trim().match(/^(?:hi|hello|hey|dear)\s+([^,\n]+),/i);
  if (!g) p.push('no "Hi Name," greeting');
  else {
    const who = g[1].trim();
    if (!/\bteam$/i.test(who) && !/^there$/i.test(who)) {
      const first = norm(who).split(' ')[0];
      if (first && !new RegExp(`\\b${first}\\b`).test(site)) p.push(`greeting name "${who}" is not on their site`);
      const [local = '', domain = ''] = (opts.email || '').toLowerCase().split('@');
      const loc = local.replace(/[^a-z]/g, '');
      const roleLike = /^(coach|me|hi|hello|mail|contact|info|team|office|admin)$/.test(loc);
      if (loc && !roleLike && first && !loc.includes(first) && !domain.includes(first) && loc[0] !== first[0]) {
        p.push(`greeting says "${who}" but the address is ${opts.email}`);
      }
    }
  }

  // Quotes must be on their site.
  const quotes = [...body.matchAll(/["“]([^"”\n]{12,200})["”]/g)].map((m) => m[1]);
  for (const q of quotes) if (!quoteOnSite(q, site)) p.push(`quote not found on their site: "${q.slice(0, 60)}"`);

  // Numbers must be on their site (except our own "2-minute" / "a couple of minutes").
  const text = body.replace(/\b2[- ]minute\b/gi, '').replace(/\b90 seconds\b/gi, '');
  for (const m of text.matchAll(/\$?\d[\d,.]*\s?%?/g)) {
    const raw = m[0].trim().replace(/[.,]$/, '');
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits || digits.length === 1) continue; // single digits ("3 kids") are too loose to check
    const siteDigits = opts.siteText.replace(/[,\s]/g, '');
    if (!siteDigits.includes(digits) && !siteDigits.includes(raw.replace(/[,\s]/g, ''))) p.push(`number "${raw}" is not on their site`);
  }

  // Names in the compliment (capitalised words mid-sentence) must be on their site.
  const compliment = body.split(/\n\s*\n/)[1] || '';
  const missing = new Set<string>();
  for (const sentence of compliment.split(/(?<=[.?!])\s+/)) {
    const words = sentence.split(/\s+/).slice(1); // first word of a sentence is always capitalised
    for (const raw of words) {
      const w = raw.replace(/^[^A-Za-z]+|[^A-Za-z'’-]+$/g, '').replace(/['’]s$/, '').replace(/['’-]+$/, '');
      if (!/^[A-Z][a-zA-Z'’-]{2,}$/.test(w) || COMMON.has(w.toLowerCase())) continue;
      if (!site.includes(norm(w))) missing.add(w);
    }
  }
  if (missing.size) p.push(`mentions ${[...missing].slice(0, 3).join(', ')}, not found on their site`);
  return p;
}
