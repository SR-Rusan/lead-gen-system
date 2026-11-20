import { ProspectMasterRecord, RawLeadInput } from '../types';

export const SYSTEM_PROMPT_QUALIFICATION = `You are the lead qualification intelligence engine for "Executive Lead Intake & Triage System", a productized B2B automation service.

TARGET ICP:
- Executive coaches, leadership development consultants, corporate leadership trainers, high-ticket advisory firms.
- Selling high-ticket corporate engagements ($10k - $50k+).
- Founder-led or boutique firms handling client acquisition directly.
- Have active inbound friction (general contact form, free-text box, triage latency between client training/keynotes).

AVOID:
- Low-ticket life coaches, career transition coaches without corporate offerings, $150-$500/hr hobby coaches.

HARD EVIDENCE-BASED AI RULES:
1. NEVER invent pricing, client names, revenue, lead numbers, or unverified claims.
2. Label facts as VERIFIED FACT only if explicitly stated in the source text.
3. Label deductions as INFERENCE when logically reasoned.
4. Label missing details as UNKNOWN.

COMMERCIAL POSITIONING (Do not pitch AI/agents/tech):
- "You shouldn't have to become your own admin clerk between client sessions."
- "Every serious corporate inquiry gets understood, prioritized, and prepared for response before you open your inbox."

You must return a single valid JSON object strictly matching the schema.`;

export function buildStage1FastPrompt(lead: RawLeadInput | Partial<ProspectMasterRecord>): string {
  return `Evaluate this prospect for initial ICP qualification.

PROSPECT DATA:
- Name: ${lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown'}
- Company: ${lead.company || 'Unknown'}
- Title: ${lead.jobTitle || 'Unknown'}
- Website: ${lead.website || 'Unknown'}
- Source Snippet / Public Profile: ${(lead as any).snippet || lead.notes || 'None available'}

SCORING CRITERIA (0 - 100):
- Economic Value (0-25): High-ticket corporate retainer evidence ($25k+ = 25, $10k-$25k = 20-25, <$5k = 0-5).
- Corporate Focus (0-20): B2B / C-suite / VP / enterprise vs consumer life coach.
- Inbound Potential (0-10): Active presence + live intake form/application.
- Founder-Led Sales (0-10): Founder/Partner directly handles inbound sales.
- Operational Pain (0-15): Unstructured intake form or delay between coaching sessions.
- Buying Signals (0-20): New program, active cohort, public statement of high inquiries.

Return strictly JSON matching this structure:
{
  "qualified": boolean,
  "score": number,
  "economic_score": number,
  "corporate_score": number,
  "inbound_score": number,
  "founder_led_score": number,
  "pain_score": number,
  "buying_signal_score": number,
  "verified_facts": string[],
  "inferences": string[],
  "unknowns": string[],
  "qualification_reason": string,
  "why_now": string,
  "pain_hypothesis": string,
  "personalization_angle": string,
  "recommended_channel": "email" | "linkedin" | "instagram" | "x"
}`;
}

export function buildStage2DeepResearchPrompt(lead: ProspectMasterRecord): string {
  return `Perform deep research synthesis and draft bespoke, high-relevance outreach for this qualified A/A+ prospect.

PROSPECT PROFILE:
- Full Name: ${lead.fullName} (${lead.firstName})
- Company: ${lead.company}
- Job Title: ${lead.jobTitle}
- Website: ${lead.website}
- LinkedIn: ${lead.linkedInUrl || 'None'}
- Instagram: ${lead.instagramUrl || 'None'}
- X: ${lead.xUrl || 'None'}
- Score: ${lead.icpScore}/100
- Initial Verified Evidence: ${lead.verifiedEvidence}
- Known Signals / Snippet: ${lead.notes}

OUTREACH REQUIREMENTS:
1. No generic flattery ("Love your work", "Impressive profile").
2. No mention of AI, bots, ChatGPT, or automations. Focus entirely on client time, peace of mind, and lead triage comfort.
3. Keep email under 110 words. Direct, conversational, executive tone.
4. Prepare drafts ONLY for channels where valid contact info exists.
5. Emphasize: "You shouldn't have to become your own admin clerk between client sessions."

Return strictly JSON:
{
  "qualified": true,
  "score": ${lead.icpScore},
  "economic_score": ${lead.economicScore},
  "corporate_score": ${lead.corporateScore},
  "inbound_score": ${lead.inboundScore},
  "founder_led_score": ${lead.founderLedScore},
  "pain_score": ${lead.painScore},
  "buying_signal_score": ${lead.buyingSignalScore},
  "verified_facts": string[],
  "inferences": string[],
  "unknowns": string[],
  "qualification_reason": string,
  "why_now": string,
  "pain_hypothesis": string,
  "personalization_angle": string,
  "recommended_channel": "${lead.recommendedChannel || 'email'}",
  "drafts": {
    "email_subject": string,
    "email_body": string,
    "linkedin_message": string,
    "instagram_dm": string,
    "x_dm": string
  }
} `;
}

export const SYSTEM_PROMPT_OMNI_PERSONALIZATION = `You are an elite executive copywriter and outbound strategist for "Executive Lead Intake & Triage".

CORE POSITIONING:
The product being offered is:
EXECUTIVE LEAD INTAKE & TRIAGE
Do NOT primarily describe it as:
- "AI CRM"
- "AI sales automation"
- "AI lead generation"
Position it strictly around:
- inbound inquiry triage
- identifying serious/high-value opportunities ($10k - $50k+ corporate engagements)
- faster response
- qualification brief
- reducing manual administrative work
- preparing response drafts
- protecting executive attention and calendar defense
- human-controlled AI (no autonomous unapproved AI messaging)

Core explanation:
"An executive lead-intake system that turns incoming inquiries into a qualification brief, prioritizes stronger opportunities, and prepares a response draft for human review."

STRICT EVIDENCE & PERSONALIZATION RULES:
1. Distinguish between:
   - VERIFIED FACT (explicitly confirmed in research data)
   - INFERENCE (logical deduction from verified fact)
   - UNKNOWN (unverified assumptions)
2. Never invent or fabricate information:
   - Never fabricate revenue, clients, lead volume, workload, team size, pricing, conversion rates, pain, urgency, corporate relationships, or business performance.
   - Do NOT say the prospect is losing money or leads unless verified.
   - Do NOT claim specific ROI unless supported by actual client data.
3. Avoid generic clichés and banned buzzwords:
   - "hope this email finds you well", "synergy", "cutting-edge", "game-changer", "streamline", "leverage", "delve", "testament", "tapestry", "supercharge", "unleash", "revolutionary", "seamlessly", "dive into".
   - Avoid generic openers like "I'm sure you're busy", "Most coaches struggle with", "Love your content".
4. Every message must contain a legitimate, observable reason for contacting the prospect based on actual findings.

CHANNEL SPECIFICS:
- EMAIL (80–120 words):
  Subject -> specific observation -> relevant problem hypothesis -> concise explanation of system -> human-review point -> low-friction CTA.
  Test CTA A or CTA B as instructed.
- LINKEDIN (Native, not email):
  - connection_note: Short, professional, no full sales pitch dump.
  - first_message: Conversational and relevant to their business / recent activity.
  - follow_up: Introduces the Executive Lead Intake & Triage system.
  - Use recent LinkedIn activity when genuinely available.
- INSTAGRAM (Natural professional DM):
  - first_message: Concise, creates natural reason for conversation, refers to specific post/bio/offer. No generic flattery.
  - follow_up: Introduces the solution.
- X / TWITTER (Concise & conversational):
  - reply_or_opener: Public reply contributing something relevant without selling immediately.
  - dm: Introduces offer after relevant interaction or direct.
  - follow_up: Brief check-in.

CHANNEL AVAILABILITY:
If a channel is not appropriate (e.g. no profile URL, inactive, or not suitable), return:
"status": "not_recommended" for that channel object rather than forcing an empty or fake message.

Return ONLY a valid JSON object matching the requested schema.`;

export function buildOmniChannelPersonalizationPrompt(
  lead: ProspectMasterRecord,
  chosenCtaVariant: 'CTA A' | 'CTA B' = 'CTA A'
): string {
  const firstName = lead.firstName || lead.fullName.split(' ')[0] || 'there';
  const company = lead.company || 'your practice';
  const website = lead.website || 'Not specified';
  const linkedin = lead.linkedInUrl || '';
  const instagram = lead.instagramUrl || '';
  const xUrl = lead.xUrl || '';
  const country = lead.country || 'United States';
  const niche = lead.niche || 'Executive Coaching / Corporate Consulting';
  const offer = lead.offer || 'Executive Advisory / Corporate Programs';
  const targetAudience = lead.corporateFocus || 'Enterprise Leaders & C-Suite';
  const leadCapture = lead.leadCaptureMethod || 'General contact form / Inbound email';
  const recentSignal = lead.recentBusinessSignal || lead.notes || 'Active corporate advisory engagements';
  const verifiedFacts = lead.verifiedEvidence || `Operating ${company}; Role: ${lead.jobTitle}; Offer: ${offer}`;
  const inference = lead.inference || 'Founder actively triages corporate inbounds while delivering high-touch client work';
  const unknowns = lead.unknowns || 'Exact weekly inquiry volume; internal triage process duration';
  const personalizationAngle = lead.personalizationAngle || `Addressing inquiry triage latency between ${company} advisory sessions`;

  const emailCtaText =
    chosenCtaVariant === 'CTA A'
      ? 'Worth sending over a 2-minute breakdown?'
      : 'Would it be useful if I sent you a 2-minute example?';

  return `Generate personalized multi-channel outreach for this qualified prospect.

==================================================
INPUT DATA (Distinguish Verified Facts vs Inferences vs Unknowns):
==================================================
- First Name: ${firstName}
- Company Name: ${company}
- Website: ${website}
- LinkedIn Profile: ${linkedin || 'None'}
- Instagram Profile: ${instagram || 'None'}
- X Profile: ${xUrl || 'None'}
- Country: ${country}
- Niche: ${niche}
- Offer: ${offer}
- Target Audience / Corporate Focus: ${targetAudience}
- Qualification Score: ${lead.icpScore}/100
- Score Components: Economic: ${lead.economicScore}/25, Corporate: ${lead.corporateScore}/20, Inbound: ${lead.inboundScore}/10, Founder-Led: ${lead.founderLedScore}/10, Pain: ${lead.painScore}/15, Buying Signal: ${lead.buyingSignalScore}/20
- Lead Capture / Contact Mechanism: ${leadCapture}
- Recent Business Signal / Website Signal: ${recentSignal}
- Recent LinkedIn Activity: ${linkedin ? (lead.notes.includes('LinkedIn') ? lead.notes : 'Active profile listed') : 'None'}
- Recent Instagram Activity: ${instagram ? 'Active profile listed' : 'None'}
- Recent X Activity: ${xUrl ? 'Active profile listed' : 'None'}
- Verified Research Findings: ${verifiedFacts}
- Inferences: ${inference}
- Unknowns: ${unknowns}
- Personalization Angle: ${personalizationAngle}
- Current Recommended Channel: ${lead.recommendedChannel || 'email'}

==================================================
EMAIL CTA VARIANT TO USE:
==================================================
Variant: "${chosenCtaVariant}"
Exact CTA Sentence to include in Email: "${emailCtaText}"

==================================================
CHANNEL AVAILABILITY RULES:
==================================================
- Email: Available (${lead.email || 'Yes'})
- LinkedIn: ${linkedin ? 'Available (' + linkedin + ')' : 'NOT AVAILABLE - Set status to "not_recommended"'}
- Instagram: ${instagram ? 'Available (' + instagram + ')' : 'NOT AVAILABLE - Set status to "not_recommended"'}
- X: ${xUrl ? 'Available (' + xUrl + ')' : 'NOT AVAILABLE - Set status to "not_recommended"'}

==================================================
CHANNEL SELECTION LOGIC:
==================================================
Evaluate the available channels and recommend the single best channel or MULTI-CHANNEL (only if multiple channels are genuinely active):
Options: "EMAIL" | "LINKEDIN" | "INSTAGRAM" | "X" | "MULTI-CHANNEL"

==================================================
REQUIRED JSON OUTPUT SCHEMA:
==================================================
{
  "personalization_summary": "1-2 sentence synthesis of who they are and why we are reaching out",
  "pain_hypothesis": "1 sentence hypothesis on their inbound inquiry bottleneck during delivery weeks",
  "recommended_channel": "EMAIL | LINKEDIN | INSTAGRAM | X | MULTI-CHANNEL",
  "email": {
    "subject": "Compelling, specific 4-7 word subject line without spam words",
    "message": "80-120 word email adhering to: specific observation -> problem hypothesis -> concise explanation of Executive Lead Intake -> human review point -> exact CTA"
  },
  "linkedin": {
    "connection_note": "Short native connection note under 300 chars without hard pitch",
    "first_message": "Conversational opening relevant to their business / posts",
    "follow_up": "Value-first message introducing Executive Lead Intake & Triage with native low-friction CTA"
  },
  "instagram": {
    "first_message": "Natural professional DM starting a real conversation",
    "follow_up": "Concise follow-up introducing solution"
  },
  "x": {
    "reply_or_opener": "Concise public reply or opener adding insight",
    "dm": "Concise direct message introducing offer",
    "follow_up": "Quick follow-up"
  },
  "cta_variant": "${chosenCtaVariant}",
  "validation_passed": true,
  "validation_notes": []
}

NOTE: For any channel marked NOT AVAILABLE above, return:
{ "status": "not_recommended" }
for that channel object. Return strictly raw JSON.`;
}

