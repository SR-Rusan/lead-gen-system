/**
 * Reads a coach's own website (home + a few key pages) and pulls out what outreach needs:
 * public email addresses, social links, how people get in touch, and plain text for the AI to read.
 * Only facts visible on their site. Nothing is guessed.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36';
const KEY_PAGES = ['contact', 'about', 'work-with-me', 'coaching', 'services', 'privacy', 'terms', 'book', 'get-in-touch', 'connect'];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Inboxes that are never read by the coach for new business.
const ROLE_INBOX = /^(privacy|legal|gdpr|dpo|data|compliance|noreply|no-reply|donotreply|support|billing|accounts|invoices|careers|jobs|hr|press|media|webmaster|admin@wix|abuse|security|unsubscribe)@/i;
const JUNK_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$|sentry|wixpress|example\.|@domain\.|@email\.|yourname|@2x|godaddy|squarespace|wordpress|schema\.org|u003e/i;
const BOOKING = ['calendly', 'acuityscheduling', 'tidycal', 'oncehub', 'youcanbook', 'savvycal', 'zcal', 'hubspot.com/meetings', 'cal.com'];

export interface SiteFacts {
  url: string;
  domain: string;
  reachable: boolean;
  title: string;
  description: string;
  headings: string[];
  emails: { address: string; page: string }[];
  linkedInUrl: string;
  instagramUrl: string;
  bookingTool: string;
  hasForm: boolean;
  pagesRead: string[];
  text: string; // trimmed visible text from the pages read, for the AI
  signals: string[]; // buying signals seen on their pages (see SIGNALS)
  fullText: string; // all visible text read (for fact-checking the email)
}

/**
 * Signs a coach needs faster inquiry handling right now. Each one is a phrase on their own site, so
 * it is a fact, not a guess. Strongest first: they say themselves that inquiries pile up.
 */
const SIGNALS: { label: string; re: RegExp }[] = [
  { label: 'Says inquiries take time to answer', re: /(due to (the )?(high )?(volume|demand)|high volume of (inquiries|enquiries|requests|emails)|(respond|reply|get back to you) within \d+\s*(-\s*\d+\s*)?(business |working )?(days|hours)|allow \d+\s*(-\s*\d+\s*)?(business |working )?days)/i },
  { label: 'Waitlist or booked out', re: /(wait ?list|waiting list|fully booked|booked (out|up) (until|through|for)|limited (spots|spaces|places|availability)|only \d+ (spots|spaces|places|clients)|(spots|spaces|places) (left|remaining))/i },
  { label: 'Enrolling a new cohort or programme', re: /(now enrolling|enrol?lment (is )?(now )?open|doors (are )?(now )?open|applications? (are )?(now )?open|apply now for|next cohort|new cohort|cohort (starts|begins|kicks off)|join the (spring|summer|fall|autumn|winter|january|2026|2027) cohort)/i },
  { label: 'Hiring support staff', re: /((we'?re|we are|now) hiring|join our team)[^.]{0,80}(coordinator|assistant|client (success|care|experience)|operations|admin)|(hiring|looking for) an? (client|program|programme) (coordinator|manager)/i },
  { label: 'New launch (book, programme or course)', re: /(pre-?order (now|the book|my book)|new book|just (launched|released)|now available[^.]{0,40}(book|programme|program|course)|introducing (our|my|the) new)/i },
  { label: 'Upcoming events or workshops', re: /(upcoming (events|workshops|retreats|masterclass(es)?)|register (now|today) for|save your seat|live (workshop|masterclass) on)/i },
];

/** Returns the labels of every buying signal found in the text. */
export function detectSignals(text: string): string[] {
  return SIGNALS.filter((s) => s.re.test(text)).map((s) => s.label);
}

async function fetchPage(url: string): Promise<{ finalUrl: string; html: string }> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return { finalUrl: url, html: '' };
    const html = (await res.text()).slice(0, 1_500_000);
    return { finalUrl: res.url || url, html };
  } catch {
    return { finalUrl: url, html: '' };
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;|&mdash;/g, '-').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function cloudflareEmails(html: string): string[] {
  const out: string[] = [];
  const codes = [...html.matchAll(/data-cfemail="([0-9a-fA-F]+)"/g), ...html.matchAll(/email-protection#([0-9a-fA-F]+)/g)].map((m) => m[1]);
  for (const enc of codes) {
    const key = parseInt(enc.slice(0, 2), 16);
    let s = '';
    for (let i = 2; i < enc.length; i += 2) s += String.fromCharCode(parseInt(enc.slice(i, i + 2), 16) ^ key);
    out.push(s);
  }
  return out;
}

function findEmails(html: string): string[] {
  let decoded = html;
  try { decoded = decodeURIComponent(html.replace(/%(?![0-9a-fA-F]{2})/g, '%25')); } catch { /* keep raw */ }
  decoded = decodeEntities(decoded);
  const found = new Set<string>([
    ...[...decoded.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => m[1]),
    ...(decoded.match(EMAIL_RE) || []),
    ...cloudflareEmails(html),
  ]);
  for (const m of decoded.matchAll(/([A-Za-z0-9._%+-]+)\s*[[(]\s*at\s*[\])]\s*([A-Za-z0-9-]+)\s*[[(]\s*dot\s*[\])]\s*([A-Za-z]{2,})/gi)) {
    found.add(`${m[1]}@${m[2]}.${m[3]}`);
  }
  return [...found]
    .map((e) => e.trim().replace(/^[.]+|[.]+$/g, '').toLowerCase())
    .filter((e) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) && !JUNK_EMAIL.test(e) && !ROLE_INBOX.test(e));
}

export function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

export async function readSite(startUrl: string): Promise<SiteFacts> {
  const domain = domainOf(startUrl);
  const home = await fetchPage(startUrl);
  const facts: SiteFacts = {
    url: home.finalUrl, domain, reachable: Boolean(home.html), title: '', description: '', headings: [], emails: [],
    linkedInUrl: '', instagramUrl: '', bookingTool: '', hasForm: false, pagesRead: [], text: '', signals: [], fullText: '',
  };
  if (!home.html) return facts;

  facts.title = decodeEntities((home.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()).slice(0, 160);
  facts.description = decodeEntities(home.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || '').slice(0, 300);

  // Same-site links that look like contact / about / services pages.
  const links = new Set<string>();
  for (const m of home.html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], home.finalUrl);
      if (domainOf(u.href) === domain && KEY_PAGES.some((k) => u.pathname.toLowerCase().includes(k))) links.add(u.origin + u.pathname);
    } catch { /* ignore */ }
  }
  for (const guess of ['/contact', '/about']) links.add(new URL(guess, home.finalUrl).href);
  // Contact and legal pages are where emails usually are, so read those first.
  const rank = (u: string) => {
    const p = u.toLowerCase();
    const i = ['contact', 'privacy', 'get-in-touch', 'terms', 'about', 'connect', 'book', 'work-with-me'].findIndex((k) => p.includes(k));
    return i < 0 ? 99 : i;
  };
  const ordered = [...links].sort((x, y) => rank(x) - rank(y));

  const pages: { path: string; html: string }[] = [{ path: '/', html: home.html }];
  for (const link of ordered.slice(0, 8)) {
    const p = await fetchPage(link);
    if (p.html && domainOf(p.finalUrl) === domain) pages.push({ path: new URL(p.finalUrl).pathname, html: p.html });
  }

  const seen = new Map<string, string>();
  const texts: string[] = [];
  const fullText: string[] = [];
  for (const { path, html } of pages) {
    facts.pagesRead.push(path);
    for (const e of findEmails(html)) if (!seen.has(e)) seen.set(e, path);
    for (const m of html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)) {
      const h = visibleText(m[1]);
      if (h && h.length < 140 && !facts.headings.includes(h)) facts.headings.push(h);
    }
    if (!facts.linkedInUrl) facts.linkedInUrl = html.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company)\/[A-Za-z0-9_%-]+/i)?.[0] || '';
    if (!facts.instagramUrl) {
      const ig = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)/i);
      if (ig && !['p', 'reel', 'explore', 'accounts'].includes(ig[1])) facts.instagramUrl = `https://instagram.com/${ig[1]}`;
    }
    if (!facts.bookingTool) facts.bookingTool = BOOKING.find((b) => html.toLowerCase().includes(b)) || '';
    if (/<form[\s>]/i.test(html)) facts.hasForm = true;
    const vt = visibleText(html);
    fullText.push(vt);
    texts.push(`[page ${path}] ${vt.slice(0, 2200)}`);
  }

  // Prefer addresses on their own domain; third-party addresses (web designers, privacy vendors) go last.
  facts.emails = [...seen.entries()]
    .map(([address, page]) => ({ address, page }))
    .sort((a, b) => Number(b.address.endsWith(domain)) - Number(a.address.endsWith(domain)));
  facts.headings = facts.headings.slice(0, 14);
  facts.text = texts.join('\n').slice(0, 9000);
  facts.signals = detectSignals(fullText.join(' '));
  facts.fullText = [facts.title, facts.description, ...facts.headings, ...fullText].join(' ').slice(0, 120_000);
  return facts;
}

/** True when the domain has a mail server, so an address on it can receive email. */
export async function domainAcceptsMail(domain: string): Promise<boolean> {
  try {
    const { promises: dns } = await import('dns');
    const mx = await dns.resolveMx(domain);
    return mx.length > 0;
  } catch {
    return false;
  }
}
