import {
  ProspectMasterRecord,
  OutreachDrafts,
  MultiChannelPersonalizationOutput,
  MultiChannelEmail,
  MultiChannelLinkedIn,
  MultiChannelInstagram,
  MultiChannelX,
} from '../types';
import { CONFIG } from '../config';
import { SYSTEM_PROMPT_OMNI_PERSONALIZATION, buildOmniChannelPersonalizationPrompt } from '../ai/prompts';
import { SchemaValidator } from '../ai/schema-validator';

export class PersonalizationEngine {
  private static readonly BANNED_BUZZWORDS = [
    'hope this email finds you well',
    'synergy',
    'cutting-edge',
    'game-changer',
    'game changer',
    'streamline',
    'leverage',
    'delve',
    'testament',
    'tapestry',
    'supercharge',
    'unleash',
    'revolutionary',
    'seamlessly',
    'dive into',
    'ai crm',
    'ai sales automation',
    'ai lead generation',
    "i'm sure you're extremely busy",
    "you're probably losing leads",
    'most coaches struggle with',
    'hundreds of inquiries',
  ];

  /**
   * Main entry point for generating personalized outreach across all 4 channels:
   * 1. Email (80-120 words, CTA A or CTA B)
   * 2. LinkedIn (Connection note, first message, follow-up)
   * 3. Instagram (First DM, follow-up)
   * 4. X / Twitter (Public opener, DM, follow-up)
   *
   * Powered by one personalization layer and validated pre-flight.
   */
  public static async generateMultiChannelOutreach(
    lead: ProspectMasterRecord,
    ctaVariant?: 'CTA A' | 'CTA B'
  ): Promise<MultiChannelPersonalizationOutput> {
    // Alternate or use specified CTA variant
    const variant: 'CTA A' | 'CTA B' =
      ctaVariant || (Math.random() > 0.5 ? 'CTA A' : 'CTA B');

    // Attempt AI-driven multi-channel generation if API key is present
    if (CONFIG.openRouter.apiKey) {
      try {
        const prompt = buildOmniChannelPersonalizationPrompt(lead, variant);
        const rawJson = await this.callOpenRouterWithFallback(
          CONFIG.openRouter.modelResearch,
          SYSTEM_PROMPT_OMNI_PERSONALIZATION,
          prompt
        );
        const parsed = SchemaValidator.parseJsonSafely(rawJson);
        const normalized = this.normalizeMultiChannelOutput(parsed, lead, variant);
        const validated = this.validateOutreach(normalized);
        normalized.validation_passed = validated.passed;
        normalized.validation_notes = validated.notes;
        return normalized;
      } catch (err) {
        console.warn(
          `[PersonalizationEngine] OpenRouter call failed: ${(err as Error).message}. Using deterministic generation.`
        );
      }
    }

    // Deterministic high-precision generation
    const deterministic = this.generateDeterministicMultiChannel(lead, variant);
    const validated = this.validateOutreach(deterministic);
    deterministic.validation_passed = validated.passed;
    deterministic.validation_notes = validated.notes;
    return deterministic;
  }

  /**
   * Generates bespoke drafts formatted for legacy and pipeline workflows.
   */
  public static async generateBespokeDrafts(
    lead: ProspectMasterRecord
  ): Promise<OutreachDrafts> {
    const multi = await this.generateMultiChannelOutreach(lead);
    const drafts: OutreachDrafts = {
      multiChannelOutput: multi,
    };

    if (multi.email && multi.email.status !== 'not_recommended') {
      drafts.email = {
        subject: multi.email.subject || 'Executive Inbound Triage',
        body: multi.email.message || '',
        status: multi.email.status,
      };
    }

    if (multi.linkedin && multi.linkedin.status !== 'not_recommended') {
      const msg = [
        multi.linkedin.connection_note ? `[Connection Note]\n${multi.linkedin.connection_note}` : '',
        multi.linkedin.first_message ? `\n[First Message]\n${multi.linkedin.first_message}` : '',
        multi.linkedin.follow_up ? `\n[Follow-up]\n${multi.linkedin.follow_up}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      drafts.linkedin = {
        message: msg,
        connection_note: multi.linkedin.connection_note,
        first_message: multi.linkedin.first_message,
        follow_up: multi.linkedin.follow_up,
        status: multi.linkedin.status,
      };
    }

    if (multi.instagram && multi.instagram.status !== 'not_recommended') {
      const dm = [
        multi.instagram.first_message ? `[First DM]\n${multi.instagram.first_message}` : '',
        multi.instagram.follow_up ? `\n[Follow-up]\n${multi.instagram.follow_up}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      drafts.instagram = {
        dm,
        first_message: multi.instagram.first_message,
        follow_up: multi.instagram.follow_up,
        status: multi.instagram.status,
      };
    }

    if (multi.x && multi.x.status !== 'not_recommended') {
      drafts.x = {
        reply_or_opener: multi.x.reply_or_opener,
        dm: multi.x.dm,
        follow_up: multi.x.follow_up,
        status: multi.x.status,
      };
    }

    return drafts;
  }

  /**
   * Pre-flight Validation Engine
   * Validates:
   * - Word count on email (80-120 words)
   * - Banned AI buzzwords / clichés
   * - Claims / unverified facts
   */
  public static validateOutreach(
    output: MultiChannelPersonalizationOutput
  ): { passed: boolean; notes: string[] } {
    const notes: string[] = [];
    let passed = true;

    // 1. Email Word Count Validation (80 - 120 words target)
    if (output.email && output.email.status !== 'not_recommended' && output.email.message) {
      const words = output.email.message
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
      const count = words.length;

      if (count < 75) {
        notes.push(`Email word count is low (${count} words, target 80-120 words).`);
      } else if (count > 130) {
        notes.push(`Email word count is high (${count} words, target 80-120 words).`);
      } else {
        notes.push(`Email length optimal (${count} words).`);
      }
    }

    // 2. Cliché and Buzzword Audit across all generated texts
    const allTexts: string[] = [];
    if (output.email?.message) allTexts.push(output.email.message);
    if (output.email?.subject) allTexts.push(output.email.subject);
    if (output.linkedin?.connection_note) allTexts.push(output.linkedin.connection_note);
    if (output.linkedin?.first_message) allTexts.push(output.linkedin.first_message);
    if (output.linkedin?.follow_up) allTexts.push(output.linkedin.follow_up);
    if (output.instagram?.first_message) allTexts.push(output.instagram.first_message);
    if (output.instagram?.follow_up) allTexts.push(output.instagram.follow_up);
    if (output.x?.reply_or_opener) allTexts.push(output.x.reply_or_opener);
    if (output.x?.dm) allTexts.push(output.x.dm);
    if (output.x?.follow_up) allTexts.push(output.x.follow_up);

    const combinedText = allTexts.join(' ').toLowerCase();

    for (const buzzword of this.BANNED_BUZZWORDS) {
      if (combinedText.includes(buzzword)) {
        notes.push(`Found banned cliché: "${buzzword}"`);
        passed = false;
      }
    }

    // 3. Fabricated Numbers / Claims Check
    if (/\b\d{2,3}%\s+roi\b/i.test(combinedText) || /\bguarantee\b/i.test(combinedText)) {
      notes.push('Disallowed: Fabricated ROI or guarantee claims detected.');
      passed = false;
    }

    // 4. CTA Variant check
    if (!output.cta_variant) {
      notes.push('Missing CTA variant specification.');
    } else {
      notes.push(`CTA variant verified: ${output.cta_variant}`);
    }

    // 5. Channel status verification
    notes.push(`Recommended Channel: ${output.recommended_channel}`);

    return { passed, notes };
  }

  /**
   * Deterministic multi-channel generator adhering to all 15 specification sections.
   */
  public static generateDeterministicMultiChannel(
    lead: ProspectMasterRecord,
    ctaVariant: 'CTA A' | 'CTA B' = 'CTA A'
  ): MultiChannelPersonalizationOutput {
    const firstName = lead.firstName || lead.fullName.split(' ')[0] || 'there';
    const company = lead.company || 'your advisory practice';
    const offer = lead.offer || 'executive leadership programs';
    const hasLinkedIn = Boolean(lead.linkedInUrl && lead.linkedInUrl.trim());
    const hasInstagram = Boolean(lead.instagramUrl && lead.instagramUrl.trim());
    const hasX = Boolean(lead.xUrl && lead.xUrl.trim());

    // Specific observation anchor
    const observation = lead.recentBusinessSignal && lead.recentBusinessSignal.length > 5
      ? `I came across ${company} and noticed your work with ${lead.corporateFocus || 'enterprise leadership teams'}, specifically around ${lead.recentBusinessSignal}.`
      : `I came across ${company} and noticed you work with ${lead.corporateFocus || 'corporate executives'} providing ${offer}.`;

    const ctaSentence =
      ctaVariant === 'CTA A'
        ? 'Worth sending over a 2-minute breakdown?'
        : 'Would it be useful if I sent you a 2-minute example?';

    // 1. Email (Word count strictly 80-110 words)
    const emailSubject = `Quick question about ${company}'s inbound inquiries`;
    const emailMessage = `Hi ${firstName},

${observation}

Most senior advisors find that between client sessions, evaluating incoming inquiries, identifying serious corporate opportunities, and drafting response replies takes significant manual attention.

I'm building an executive lead-intake system that turns incoming inquiries into a qualification brief, prioritizes stronger opportunities, and prepares a response draft for review before you open your inbox.

The goal is simple: less time sorting through inquiries, faster responses to serious prospects, and no autonomous AI messaging.

${ctaSentence}

Best,
Rusan
Executive Lead Intake`;

    // 2. LinkedIn (Native style)
    const linkedin: MultiChannelLinkedIn = hasLinkedIn
      ? {
          connection_note: `Hi ${firstName} — saw your work with leadership teams at ${company}. Noticed your inquiry pathway handles both corporate inquiries and general inbounds. Would love to connect.`,
          first_message: `Hi ${firstName} — thanks for connecting. Appreciate the work you're doing with ${offer} at ${company}. Curious: during intensive client delivery weeks, how do you typically triage incoming corporate inquiries?`,
          follow_up: `Hi ${firstName} — following up on our chat. We set up an executive intake & triage layer for leadership practices: every inquiry gets turned into a qualification brief with response drafts prepared for human review before your inbox. Would it be useful if I showed you how it works?`,
        }
      : { status: 'not_recommended' };

    // 3. Instagram (Professional DM)
    const instagram: MultiChannelInstagram = hasInstagram
      ? {
          first_message: `Hey ${firstName}, came across your leadership updates for ${company}. Quick question regarding your advisory practice: do you personally filter through your incoming inquiries, or do you have a triage workflow in place?`,
          follow_up: `Hey ${firstName}, reason I asked: we built an executive lead-intake system that qualifies corporate inquiries and pre-drafts replies for your review so your calendar stays protected. Open to seeing a quick 2-minute example?`,
        }
      : { status: 'not_recommended' };

    // 4. X / Twitter (Conversational & concise)
    const x: MultiChannelX = hasX
      ? {
          reply_or_opener: `Solid perspective on executive advisory delivery. The operational challenge is always defending focus while inbounds keep landing.`,
          dm: `Hi ${firstName}, saw your posts on corporate leadership consulting. We built an intake triage layer that prioritizes qualified corporate inquiries and prepares response drafts for review. Open to seeing a quick example?`,
          follow_up: `Hi ${firstName}, just checking if you had a chance to see my note above regarding intake triage for ${company}. Happy to share a quick 2-minute walkthrough.`,
        }
      : { status: 'not_recommended' };

    // Recommended Channel Selection
    let recommendedChannel: 'EMAIL' | 'LINKEDIN' | 'INSTAGRAM' | 'X' | 'MULTI-CHANNEL' = 'EMAIL';
    if (lead.email && hasLinkedIn) {
      recommendedChannel = 'MULTI-CHANNEL';
    } else if (hasLinkedIn && !lead.email) {
      recommendedChannel = 'LINKEDIN';
    } else if (lead.email) {
      recommendedChannel = 'EMAIL';
    } else if (hasInstagram) {
      recommendedChannel = 'INSTAGRAM';
    } else if (hasX) {
      recommendedChannel = 'X';
    }

    return {
      personalization_summary: `Targeted outreach for ${firstName} at ${company} focused on inbound inquiry triage and calendar defense during client engagements.`,
      pain_hypothesis: `Inbound corporate inquiries arrive via public contact form while ${firstName} is delivering high-touch advisory programs, causing triage latency.`,
      recommended_channel: recommendedChannel,
      email: {
        subject: emailSubject,
        message: emailMessage,
      },
      linkedin,
      instagram,
      x,
      cta_variant: ctaVariant,
      validation_passed: true,
      validation_notes: [],
    };
  }

  /**
   * Normalizes AI model output into the strict schema.
   */
  private static normalizeMultiChannelOutput(
    raw: any,
    lead: ProspectMasterRecord,
    ctaVariant: 'CTA A' | 'CTA B'
  ): MultiChannelPersonalizationOutput {
    const hasLinkedIn = Boolean(lead.linkedInUrl && lead.linkedInUrl.trim());
    const hasInstagram = Boolean(lead.instagramUrl && lead.instagramUrl.trim());
    const hasX = Boolean(lead.xUrl && lead.xUrl.trim());

    // Normalize email
    let email: MultiChannelEmail = { status: 'not_recommended' };
    if (raw.email && typeof raw.email === 'object' && raw.email.status !== 'not_recommended') {
      email = {
        subject: String(raw.email.subject || `Inbound inquiry triage for ${lead.company}`),
        message: String(raw.email.message || raw.email.body || ''),
      };
    } else if (lead.email) {
      const fallback = this.generateDeterministicMultiChannel(lead, ctaVariant);
      email = fallback.email;
    }

    // Normalize linkedin
    let linkedin: MultiChannelLinkedIn = { status: 'not_recommended' };
    if (hasLinkedIn && raw.linkedin && raw.linkedin.status !== 'not_recommended') {
      linkedin = {
        connection_note: String(raw.linkedin.connection_note || ''),
        first_message: String(raw.linkedin.first_message || ''),
        follow_up: String(raw.linkedin.follow_up || ''),
      };
    } else if (hasLinkedIn) {
      const fallback = this.generateDeterministicMultiChannel(lead, ctaVariant);
      linkedin = fallback.linkedin;
    }

    // Normalize instagram
    let instagram: MultiChannelInstagram = { status: 'not_recommended' };
    if (hasInstagram && raw.instagram && raw.instagram.status !== 'not_recommended') {
      instagram = {
        first_message: String(raw.instagram.first_message || ''),
        follow_up: String(raw.instagram.follow_up || ''),
      };
    }

    // Normalize X
    let x: MultiChannelX = { status: 'not_recommended' };
    if (hasX && raw.x && raw.x.status !== 'not_recommended') {
      x = {
        reply_or_opener: String(raw.x.reply_or_opener || ''),
        dm: String(raw.x.dm || ''),
        follow_up: String(raw.x.follow_up || ''),
      };
    }

    // Channel Recommendation
    let rec = String(raw.recommended_channel || 'EMAIL').toUpperCase();
    if (!['EMAIL', 'LINKEDIN', 'INSTAGRAM', 'X', 'MULTI-CHANNEL'].includes(rec)) {
      rec = lead.email && hasLinkedIn ? 'MULTI-CHANNEL' : (lead.email ? 'EMAIL' : 'LINKEDIN');
    }

    return {
      personalization_summary: String(raw.personalization_summary || `Outreach for ${lead.company}`),
      pain_hypothesis: String(raw.pain_hypothesis || 'Inbound triage bottleneck between sessions'),
      recommended_channel: rec as any,
      email,
      linkedin,
      instagram,
      x,
      cta_variant: ctaVariant,
      validation_passed: true,
      validation_notes: [],
    };
  }

  /**
   * Generates a recommended multi-channel cadence for high-value prospects.
   */
  public static recommendSequence(
    output: MultiChannelPersonalizationOutput
  ): string[] {
    if (output.recommended_channel !== 'MULTI-CHANNEL') {
      return [
        `Primary Channel: ${output.recommended_channel}`,
        'Day 1: Send initial personalized outreach.',
        'Day 4: Send concise value follow-up.',
        'Day 8: Send final check-in.',
        'RULE: If prospect replies on any channel, STOP all automated outreach immediately and allow human handling.',
      ];
    }

    return [
      'Day 1: Email (Specific observation, inquiry triage positioning, CTA)',
      'Day 3: LinkedIn connection request (Short, context-relevant note)',
      'Day 6: LinkedIn first message / follow-up (Introduces Executive Lead Intake system)',
      'Day 9: Email follow-up (Reiterates qualification brief & human review guarantee)',
      'Day 12: Optional Instagram or X touchpoint if relevant signal exists',
      'CRITICAL GUARDRAIL: If prospect replies on ANY channel, STOP automated follow-ups immediately and mark as REPLIED.',
    ];
  }

  /**
   * Formats the multi-channel output for 4 dedicated Google Sheet / CRM columns.
   */
  public static formatOutreachForSheet(
    output: MultiChannelPersonalizationOutput
  ): {
    draftEmail: string;
    draftLinkedInMessage: string;
    draftInstagramMessage: string;
    draftXMessage: string;
  } {
    // 1. Email Column
    let draftEmail = '';
    if (output.email && output.email.status !== 'not_recommended' && output.email.message) {
      draftEmail = `Subject: ${output.email.subject || 'Executive Inbound Triage'}\n\n${output.email.message}`;
    } else {
      draftEmail = '[NOT RECOMMENDED - No verified email available]';
    }

    // 2. LinkedIn Column
    let draftLinkedInMessage = '';
    if (output.linkedin && output.linkedin.status !== 'not_recommended') {
      const parts: string[] = [];
      if (output.linkedin.connection_note) {
        parts.push(`[CONNECTION NOTE]\n${output.linkedin.connection_note}`);
      }
      if (output.linkedin.first_message) {
        parts.push(`[FIRST MESSAGE]\n${output.linkedin.first_message}`);
      }
      if (output.linkedin.follow_up) {
        parts.push(`[FOLLOW-UP]\n${output.linkedin.follow_up}`);
      }
      draftLinkedInMessage = parts.join('\n\n');
    } else {
      draftLinkedInMessage = '[NOT RECOMMENDED - No LinkedIn profile available]';
    }

    // 3. Instagram Column
    let draftInstagramMessage = '';
    if (output.instagram && output.instagram.status !== 'not_recommended') {
      const parts: string[] = [];
      if (output.instagram.first_message) {
        parts.push(`[FIRST DM]\n${output.instagram.first_message}`);
      }
      if (output.instagram.follow_up) {
        parts.push(`[FOLLOW-UP]\n${output.instagram.follow_up}`);
      }
      draftInstagramMessage = parts.join('\n\n');
    } else {
      draftInstagramMessage = '[NOT RECOMMENDED - No Instagram profile available]';
    }

    // 4. X Column
    let draftXMessage = '';
    if (output.x && output.x.status !== 'not_recommended') {
      const parts: string[] = [];
      if (output.x.reply_or_opener) {
        parts.push(`[PUBLIC REPLY / OPENER]\n${output.x.reply_or_opener}`);
      }
      if (output.x.dm) {
        parts.push(`[DIRECT MESSAGE]\n${output.x.dm}`);
      }
      if (output.x.follow_up) {
        parts.push(`[FOLLOW-UP]\n${output.x.follow_up}`);
      }
      draftXMessage = parts.join('\n\n');
    } else {
      draftXMessage = '[NOT RECOMMENDED - No X profile available]';
    }

    return {
      draftEmail,
      draftLinkedInMessage,
      draftInstagramMessage,
      draftXMessage,
    };
  }

  /**
   * Helper to call OpenRouter with model fallback
   */
  private static async callOpenRouterWithFallback(
    primaryModel: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    const modelsToTry = [
      primaryModel,
      CONFIG.openRouter.modelFallback,
      'nvidia/nemotron-3-super-120b-a12b:free',
      'openrouter/free',
    ].filter(Boolean);

    for (const model of modelsToTry) {
      try {
        const res = await fetch(`${CONFIG.openRouter.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${CONFIG.openRouter.apiKey}`,
            'HTTP-Referer': 'https://github.com/executive-lead-intake',
            'X-Title': 'Executive Lead Intake & Triage System',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.25,
            response_format: { type: 'json_object' },
          }),
        });

        if (res.ok) {
          const data: any = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) return content;
        } else {
          console.warn(`[PersonalizationEngine] Model ${model} returned ${res.status}. Trying next...`);
        }
      } catch (err) {
        console.warn(`[PersonalizationEngine] Failed calling ${model}: ${(err as Error).message}`);
      }
    }

    throw new Error('All OpenRouter models failed');
  }
}
