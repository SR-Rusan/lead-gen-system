import { CONFIG } from '../config';
import { AIQualificationOutput, ProspectMasterRecord, RawLeadInput } from '../types';
import { SYSTEM_PROMPT_QUALIFICATION, buildStage1FastPrompt, buildStage2DeepResearchPrompt } from './prompts';
import { SchemaValidator } from './schema-validator';
import { ScoringEngine } from '../scoring/scoring-engine';

import { PersonalizationEngine } from '../outreach/personalization';

export class OpenRouterService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = CONFIG.openRouter.apiKey;
    this.baseUrl = CONFIG.openRouter.baseUrl;
  }

  /**
   * Evaluates prospect via Stage 1 Fast Qualification Model
   */
  public async evaluateStage1Fast(lead: RawLeadInput | Partial<ProspectMasterRecord>): Promise<AIQualificationOutput> {
    if (!this.apiKey) {
      return this.deterministicFallbackQualification(lead);
    }

    const userPrompt = buildStage1FastPrompt(lead);
    try {
      const responseText = await this.callOpenRouter(
        CONFIG.openRouter.modelFast,
        SYSTEM_PROMPT_QUALIFICATION,
        userPrompt
      );
      const parsed = SchemaValidator.parseJsonSafely(responseText);
      return SchemaValidator.validateQualificationOutput(parsed);
    } catch (err) {
      console.warn(`[OpenRouter] Stage 1 API call failed, using deterministic fallback: ${(err as Error).message}`);
      return this.deterministicFallbackQualification(lead);
    }
  }

  /**
   * Deep research & personalized outreach generation for A/A+ prospects
   * Generates bespoke multi-channel outreach across Email, LinkedIn, Instagram, and X.
   */
  public async conductStage2DeepResearch(lead: ProspectMasterRecord): Promise<AIQualificationOutput> {
    const multiChannel = await PersonalizationEngine.generateMultiChannelOutreach(lead);
    const baseQual = this.deterministicFallbackQualification(lead);

    const emailSubject = multiChannel.email.subject || `Quick question about ${lead.company}'s inbound inquiries`;
    const emailBody = multiChannel.email.message || '';
    const linkedinMsg = [
      multiChannel.linkedin.connection_note ? `[Connection Note]\n${multiChannel.linkedin.connection_note}` : '',
      multiChannel.linkedin.first_message ? `\n[First Message]\n${multiChannel.linkedin.first_message}` : '',
      multiChannel.linkedin.follow_up ? `\n[Follow-up]\n${multiChannel.linkedin.follow_up}` : '',
    ].filter(Boolean).join('\n');

    const instagramDm = [
      multiChannel.instagram.first_message ? `[First DM]\n${multiChannel.instagram.first_message}` : '',
      multiChannel.instagram.follow_up ? `\n[Follow-up]\n${multiChannel.instagram.follow_up}` : '',
    ].filter(Boolean).join('\n');

    const xDm = [
      multiChannel.x.reply_or_opener ? `[Opener]\n${multiChannel.x.reply_or_opener}` : '',
      multiChannel.x.dm ? `\n[DM]\n${multiChannel.x.dm}` : '',
      multiChannel.x.follow_up ? `\n[Follow-up]\n${multiChannel.x.follow_up}` : '',
    ].filter(Boolean).join('\n');

    let recChannel: any = multiChannel.recommended_channel.toLowerCase();
    if (!['email', 'linkedin', 'instagram', 'x'].includes(recChannel)) {
      recChannel = lead.email ? 'email' : 'linkedin';
    }

    return {
      ...baseQual,
      pain_hypothesis: multiChannel.pain_hypothesis,
      personalization_angle: multiChannel.personalization_summary,
      recommended_channel: recChannel,
      multi_channel_outreach: multiChannel,
      drafts: {
        email_subject: emailSubject,
        email_body: emailBody,
        linkedin_message: linkedinMsg,
        instagram_dm: instagramDm,
        x_dm: xDm,
      },
    };
  }

  public async generateMultiChannelOutreach(lead: ProspectMasterRecord, ctaVariant?: 'CTA A' | 'CTA B') {
    return PersonalizationEngine.generateMultiChannelOutreach(lead, ctaVariant);
  }

  /**
   * Low-level OpenRouter chat completion call with exponential backoff retries
   */
  private async callOpenRouter(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    let attempts = 0;
    const maxAttempts = CONFIG.openRouter.maxRetries;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com/executive-lead-intake',
            'X-Title': 'Executive Lead Intake & Triage System',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2, // Low temperature for factual consistency
            response_format: { type: 'json_object' },
          }),
        });

        if (!res.ok) {
          const errorBody = await res.text();
          if (res.status === 429 || res.status >= 500) {
            console.warn(`[OpenRouter] Attempt ${attempts} hit ${res.status}: ${errorBody}. Retrying...`);
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempts)));
            continue;
          }
          throw new Error(`OpenRouter HTTP ${res.status}: ${errorBody}`);
        }

        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('Empty response from OpenRouter');
        }
        return content;
      } catch (err) {
        if (attempts >= maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempts));
      }
    }

    throw new Error('OpenRouter max retries exceeded');
  }

  /**
   * Deterministic fallback when API key is missing or offline
   */
  private deterministicFallbackQualification(lead: RawLeadInput | Partial<ProspectMasterRecord>): AIQualificationOutput {
    const scoreBreakdown = ScoringEngine.calculateDeterministicScore(lead);
    const fullName = lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Advisor';
    const isQual = scoreBreakdown.totalScore >= CONFIG.thresholds.b;

    return {
      qualified: isQual,
      score: scoreBreakdown.totalScore,
      economic_score: scoreBreakdown.economicScore,
      corporate_score: scoreBreakdown.corporateScore,
      inbound_score: scoreBreakdown.inboundScore,
      founder_led_score: scoreBreakdown.founderLedScore,
      pain_score: scoreBreakdown.painScore,
      buying_signal_score: scoreBreakdown.buyingSignalScore,
      verified_facts: [
        `Company: ${lead.company || 'Private Practice'}`,
        `Role: ${lead.jobTitle || 'Executive Advisory'}`,
        `Observed channel: ${lead.source || 'Public Search'}`,
      ],
      inferences: [
        scoreBreakdown.evidence.economic,
        scoreBreakdown.evidence.corporate,
      ],
      unknowns: [
        'Exact weekly inbound inquiry count',
        'Specific contract cancellation rates',
      ],
      qualification_reason: `Deterministic score of ${scoreBreakdown.totalScore}/100 (${scoreBreakdown.tier}). ${scoreBreakdown.evidence.economic}`,
      why_now: scoreBreakdown.evidence.buyingSignals,
      pain_hypothesis: scoreBreakdown.evidence.pain,
      personalization_angle: `Addressing inbound lead triage drag between ${lead.company || 'client'} engagements`,
      recommended_channel: lead.email ? 'email' : (lead.linkedInUrl ? 'linkedin' : 'email'),
    };
  }

  /**
   * Deterministic fallback for Deep Research & Personalization
   */
  private deterministicFallbackDeepResearch(lead: ProspectMasterRecord): AIQualificationOutput {
    const baseQual = this.deterministicFallbackQualification(lead);

    const firstName = lead.firstName || 'there';
    const company = lead.company || 'your practice';

    // Tailored messaging adhering strictly to Section 20 & 21
    const emailSubject = `Inbound triage between ${company} advisory sessions`;
    const emailBody = `Hi ${firstName},

I noticed your executive advisory focus at ${company}, specifically how inbounds arrive via your contact channel while you're actively delivering client engagements.

Most senior leadership advisors we speak with find that after intensive full-day sessions, evaluating which inquiries are serious corporate opportunities vs. exploratory calls is the last thing they have energy for.

We set up an executive intake and triage layer that understands incoming inquiries, prioritizes qualified corporate leaders, and prepares response drafts before you open your inbox—so you never become your own admin clerk.

Open to seeing a 2-minute breakdown of how this protects your calendar?

Best,
Executive Lead Intake`;

    const linkedInMsg = `Hi ${firstName} — saw your work with leadership teams at ${company}. Noticed your inquiry pathway handles both corporate inquiries and general inbounds. We built a lightweight intake layer for executive coaches so serious corporate inquiries are scored and response-ready before you open your inbox. Worth a quick 2-minute look?`;

    return {
      ...baseQual,
      drafts: {
        email_subject: emailSubject,
        email_body: emailBody,
        linkedin_message: linkedInMsg,
        instagram_dm: lead.instagramUrl ? `Hi ${firstName}, noticed your leadership cohort updates. Sent a quick note regarding your inquiry intake path—hope it's helpful!` : undefined,
        x_dm: lead.xUrl ? `Hi ${firstName}, saw your post on executive consulting growth. We built an intake layer for leadership advisors so inquiries get triaged automatically before your inbox.` : undefined,
      },
    };
  }
}

export const openRouterService = new OpenRouterService();
