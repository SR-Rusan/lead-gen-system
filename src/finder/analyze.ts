/**
 * One AI call per website: is this a real coaching business, how well does it fit, and one true
 * observation to open the email with. The rest of the email is a fixed, human-written template,
 * so the AI can't invent claims, results or a fake tone.
 */
import { CONFIG } from '../config';
import { SiteFacts } from './site';
import { factProblems } from './fact-check';

export interface Analysis {
  isTarget: boolean;
  reasonIfNot: string;
  kind: 'solo' | 'firm';
  personName: string;
  firstName: string;
  company: string;
  country: string;
  services: string[];
  audience: string;
  score: number;
  fitReason: string;
  facts: string[];
  emailSubject: string;
  emailBody: string;
  model: string;
  /** Checks the best attempt still failed (empty = passed). Such emails go to "Needs a look". */
  problems: string[];
}

const SYSTEM = `You help Rusan, who runs Axioms Digital, a one-person studio that builds inquiry automations for coaches and consultants (every new inquiry gets a reply within 90 seconds, a few qualifying questions, and a short summary for the coach).
You read one website and return JSON only. Use ONLY facts that appear in the website text you are given. Never invent names, numbers, clients, awards or claims. If something is not stated, leave it empty.

Return exactly these keys:
{
 "is_target": true|false,            // true only for a coach, coaching firm or leadership consultancy that sells its own coaching/leadership services. false for directories, listicles, articles, marketplaces, job posts, universities, big corporates, therapists-only, software tools
 "reason_if_not": "",
 "kind": "solo"|"firm",              // solo = one named coach runs it; firm = a team of several coaches
 "person_name": "",                  // the coach/founder's full name if clearly stated, else ""
 "first_name": "",
 "company": "",                      // business name as written on the site
 "country": "",                      // only if stated or obvious from address/phone/domain
 "services": [],                     // up to 5, in their own words
 "audience": "",                     // who they serve, their words, max 12 words
 "score": 0,                         // 0-100. 80+: founder-led executive/leadership coach or small firm with clear paid offers, a consultation/booking path and corporate or senior clients. 60-79: clear coaching business with a contact path. 40-59: unclear offer or very small. <40: not a fit
 "fit_reason": "",                   // one plain sentence
 "facts": [],                        // 2-4 short facts copied from the site, each ending with the page path in brackets, e.g. "Offers ADHD executive coaching (/)"
 "email_subject": "",                // see EMAIL RULES
 "email_body": ""                    // the whole email from greeting to the question, see EMAIL RULES. Leave "" if is_target is false
}

EMAIL RULES (written from cold email research; follow all of them):
- You are Rusan writing ONE email by hand to ONE person. It must read like a real person typed it after spending five minutes on their site. Plain, warm, a little informal. Short sentences. Contractions are fine.
- Length: 55-95 words for email_body. No bullet points, no bold, no links, no URLs, no emojis, no em dashes, no exclamation marks.
- Greeting: "Hi {first name}," or, if no person is named, "Hi {company} team,".
- Sentence 1-2, a genuine compliment about the ANGLE given in the user message (their website, a piece of their work, a client story, their own story, their way of thinking...). Name ONE specific thing and say in plain words why it's good, the way a person would say it to a friend. It must be checkable on the site. Never generic ("great website", "impressive work", "love what you're doing").
- NEVER compliment or mention discovery calls, consultations, free calls, call lengths ("30-minute", "45-minute"), booking pages or intake forms. Every coach has those; it reads like a bot.
- Then ONE honest, hedged guess starting with the words given in the user message that links naturally from the compliment to people reaching out to them (more interest, the wrong people writing in, replies piling up while they coach...). Do not claim to know their problems. Don't say "back-and-forth".
- Then one or two sentences on what Rusan does, in plain words, tied to their detail: he sets up a simple system for coaches that replies to every new inquiry within a couple of minutes, asks a few of the questions they'd ask anyway, and sends them a short summary before the first call. Open that sentence with the outcome, e.g. "I set up a simple system for coaches that...". Never call it "small" or "automations". Only these claims. No results, no numbers other than "a couple of minutes" and "2-minute", no client names, no "AI-powered".
- End with a low-pressure interest question offering value, e.g. "Want me to record a 2-minute video showing how it'd work on your site?" or "Worth a quick look?". Never ask for a call or a meeting.
- Do NOT add a sign-off or name at the end; it is added automatically.
- Subject: 2-5 words, lowercase except names and acronyms, no colon, no quotes, no question mark. Make it feel like a note from a person who actually looked at their work: name the specific thing you complimented, or a short reaction to it. Good: "loved the identity line", "your podcast with mark", "the promotability index", "that client story", "the about page". Never mention calls, consultations, inquiries, response time, automation, or their own name/company. Never "quick question".
- Banned words and phrases: I hope, hope you're well, I came across, I stumbled, I noticed, impressed, impressive, resonate, delve, elevate, seamless, streamline, leverage, unlock, empower, game changer, cutting-edge, robust, journey, transform, synergy, touch base, reach out, circle back, in today's, fast-paced, take it to the next level, just wanted, pick your brain, AI-powered, solution, revolutionize, effortless, boost.

- Write it fresh for this person. Do NOT reuse wording from the example below (no "made me smile", "cfo who quit twice", "heartfelt first messages"); vary how you describe the guess, the offer and the closing question.

EXAMPLE of the right style (different coach; copy the shape, never the wording or facts):
Subject: the cfo who quit twice
Hi Dana,

The story on your about page about the CFO who quit twice before finding the right role made me smile. It says more about how you coach than any list of services could.

My hunch is that stories like that bring in a lot of people who write long, heartfelt first messages. I set up a simple system for coaches that replies to every new inquiry within a couple of minutes, asks your usual assessment questions, and sends you a short summary before you talk.

Want me to record a 2-minute video showing how it'd work on your site?}`;

const BANNED = /\b(i hope|hope you're|came across|stumbled|i noticed|impressed|impressive|resonat|delve|elevate|seamless|streamlin|leverag|unlock|empower|game[- ]?chang|cutting[- ]edge|robust|journey|transform|synergy|touch base|reach out|circle back|in today's|fast-paced|next level|just wanted|pick your brain|ai-powered|solution|revolutioni|effortless|boost|supercharge|skyrocket|testament)\w*/i;

/** Problems that make an email read as automated; empty list = OK. */
export function emailProblems(subject: string, body: string): string[] {
  const p: string[] = [];
  const words = (body.match(/\S+/g) || []).length;
  if (words < 45 || words > 110) p.push(`${words} words`);
  const sw = (subject.match(/\S+/g) || []).length;
  if (sw < 1 || sw > 5) p.push(`subject ${sw} words`);
  if (BANNED.test(body) || BANNED.test(subject)) p.push(`buzzword "${(body + ' ' + subject).match(BANNED)?.[0]}"`);
  if (/https?:|www\.|\.com\b/i.test(body)) p.push('link');
  if (/[!—–]/.test(body + subject)) p.push('exclamation or dash');
  if (/[:"?]/.test(subject)) p.push('subject punctuation');
  if (!/^hi\s/i.test(body.trim())) p.push('no greeting');
  if (!/\?\s*$/.test(body.trim())) p.push('does not end with a question');
  if (/back-and-forth|nice touch|fit before money|made me smile|quit twice|heartfelt first messages/i.test(body)) p.push('copied the example');
  const opening = body.split(/\n\s*\n/).slice(1, 2).join(' ');
  if (/discovery call|consultation|free call|\d+[- ]minute (call|session|chat)|booking|intake form/i.test(opening)) p.push('compliment is about calls/consultations');
  if (/call|consult|inquir|response|automat|discovery/i.test(subject)) p.push('subject about calls/inquiries');
  if (/small automation|\bautomations?\b/i.test(body)) p.push('says small/automations');
  if (/\b(meeting|call this week|hop on|schedule a call|book a call with me)\b/i.test(body)) p.push('asks for a meeting');
  return p;
}

function pickJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in reply');
  return JSON.parse(text.slice(start, end + 1));
}

async function callModel(model: string, user: string): Promise<string> {
  const res = await fetch(`${CONFIG.openRouter.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.openRouter.apiKey}`,
      'X-Title': 'Axioms lead finder',
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(CONFIG.openRouter.timeoutMs || 60000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty AI reply');
  return content;
}

function clean(s: unknown, max = 300): string {
  return String(s ?? '').replace(/\s+/g, ' ').replace(/[—–]/g, ', ').replace(/ ,/g, ',').trim().slice(0, max);
}

const HEDGES = ["I'd guess", 'I imagine', 'My hunch is', 'I suspect', 'Probably', 'I wonder if'];

/** Puts the blank lines back when a model returns one long paragraph. */
function paragraphs(body: string): string {
  if (/\n\s*\n[\s\S]*\n\s*\n/.test(body)) return body;
  return body
    .replace(/^(Hi [^,\n]+,)\s*/, '$1\n\n')
    .replace(/\s+((I'd guess|I imagine|My hunch|I suspect|Probably|I wonder if)\b)/, '\n\n$1')
    .replace(/\s+((Want me to|Would a|Worth a)[^\n]*\?)\s*$/, '\n\n$1');
}

// Rotated per lead so compliments don't all sound the same.
const ANGLES = [
  'something about the website itself: its writing, a memorable line, the design, how clearly it explains what they do',
  'a piece of their work: a book, article, podcast episode, talk, course or free resource they made',
  'a client story, case study or testimonial on the site and what it shows about them',
  'their own story or background (career before coaching, why they started)',
  'a framework, method or idea of theirs and why it is a smart way to see the problem',
  'who they serve and how sharply or warmly they describe those people',
];

export async function analyzeSite(site: SiteFacts, opts: { models?: string[]; attempts?: number } = {}): Promise<Analysis> {
  if (!CONFIG.openRouter.apiKey) throw new Error('OPENROUTER_API_KEY is missing');
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const hedge = HEDGES[Math.floor(Math.random() * HEDGES.length)];
  const user = [
    `START THE GUESS SENTENCE WITH: "${hedge}"`,
    `ANGLE FOR THE COMPLIMENT: ${angle} (if the site has nothing for this angle, pick another specific thing from the list: ${ANGLES.join('; ')})`,
    `WEBSITE: ${site.url}`,
    `TITLE: ${site.title}`,
    `DESCRIPTION: ${site.description}`,
    `HEADINGS: ${site.headings.join(' | ')}`,
    `HOW PEOPLE GET IN TOUCH: ${[site.bookingTool && `booking tool (${site.bookingTool})`, site.hasForm && 'contact form', site.emails.length && 'email address'].filter(Boolean).join(', ') || 'unclear'}`,
    `WEBSITE TEXT:\n${site.text}`,
  ].join('\n');

  const models = (opts.models || [CONFIG.openRouter.modelResearch, CONFIG.openRouter.modelFallback]).filter((m, i, a) => m && a.indexOf(m) === i);
  const email = site.emails[0]?.address || '';
  let lastErr: unknown;
  let best: Analysis | null = null; // best attempt that only failed the checks
  let feedback = '';
  // Retries stop after ~2 minutes so a slow site never blocks the daily job; the best attempt is kept.
  const giveUpAt = Date.now() + 120_000;
  for (const model of models) {
    for (let attempt = 1; attempt <= (opts.attempts || 2); attempt++) {
      if (Date.now() > giveUpAt && (best || lastErr)) break;
      try {
        // On a retry, tell the model exactly what was wrong last time.
        const j = pickJson(await callModel(model, feedback ? `${user}\n\nYOUR LAST EMAIL WAS REJECTED. FIX THESE AND WRITE A NEW ONE: ${feedback}` : user));
        const subject = clean(j.email_subject, 60).replace(/[!:"?]/g, '');
        const body = String(j.email_body ?? '')
          .replace(/\r/g, '')
          .replace(/[—–]/g, ', ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/\n\s*(best|cheers|thanks|regards|warmly|rusan)[\s\S]*$/i, '')
          .trim();
        // Small slips some models make ("asks usual questions").
        const bodyFixed = paragraphs(body)
          .replace(/\basks (usual|typical) /g, 'asks your usual ')
          .replace(/\bsends (a |you a )?summary\b/g, 'sends you a short summary')
          // Written to the coach, so "they'd ask / sends them" must be "you'd ask / sends you".
          .replace(/\bquestions they'?d ask\b/g, "questions you'd ask")
          .replace(/\bsends them\b/g, 'sends you')
          // The closing question always gets its own paragraph.
          .replace(/([^\n])\n?(?=(Want|Would|Worth|Could|Should|Shall)\b[^\n]*\?\s*$)/, '$1\n\n');
        const problems = j.is_target
          ? [...emailProblems(subject, bodyFixed), ...factProblems({ subject, body: bodyFixed, email, siteText: site.fullText || site.text })]
          : [];
        const result: Analysis = {
          isTarget: Boolean(j.is_target),
          reasonIfNot: clean(j.reason_if_not),
          kind: j.kind === 'firm' ? 'firm' : 'solo',
          personName: clean(j.person_name, 80),
          firstName: clean(j.first_name, 40),
          company: clean(j.company, 100),
          country: clean(j.country, 60),
          services: (Array.isArray(j.services) ? j.services : []).map((s: unknown) => clean(s, 80)).filter(Boolean).slice(0, 5),
          audience: clean(j.audience, 120),
          score: Math.max(0, Math.min(100, Math.round(Number(j.score) || 0))),
          fitReason: clean(j.fit_reason),
          facts: (Array.isArray(j.facts) ? j.facts : []).map((s: unknown) => clean(s, 200)).filter(Boolean).slice(0, 4),
          emailSubject: subject,
          emailBody: bodyFixed,
          model,
          problems,
        };
        if (!problems.length) return result;
        if (!best || problems.length < best.problems.length) best = result;
        feedback = problems.join('; ');
        throw new Error(`Email rejected: ${feedback}`);
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  // Every attempt failed a check: keep the closest one, flagged, rather than losing the lead.
  if (best) return best;
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Full email: the AI-written subject and body, then a plain sign-off. No links (better inbox placement). */
export function composeEmail(a: Analysis, domain: string): string {
  return [`Subject: ${a.emailSubject || 'your inquiries'}`, a.emailBody, '', 'Rusan', 'Axioms Digital', '', "P.S. If it's not for you, just say so and I won't follow up."].join('\n');
}
