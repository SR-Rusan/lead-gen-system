import { AIQualificationOutput, RecommendedChannel } from '../types';

export class SchemaValidator {
  /**
   * Sanitizes and parses raw model output, stripping markdown code blocks
   */
  public static parseJsonSafely(rawText: string): any {
    try {
      // First try standard JSON parse
      return JSON.parse(rawText);
    } catch {
      // Strip markdown code fences if present
      const cleaned = rawText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonSubstring = cleaned.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonSubstring);
      }
      throw new Error(`Unable to extract JSON from model response: ${rawText.slice(0, 100)}...`);
    }
  }

  /**
   * Validates and normalizes qualification output
   */
  public static validateQualificationOutput(obj: any): AIQualificationOutput {
    if (!obj || typeof obj !== 'object') {
      throw new Error('AI output must be a valid JSON object');
    }

    const clamp = (val: any, min: number, max: number): number => {
      const num = Number(val);
      if (isNaN(num)) return min;
      return Math.min(max, Math.max(min, Math.round(num)));
    };

    const toStringArray = (val: any): string[] => {
      if (Array.isArray(val)) {
        return val.map((item) => String(item).trim()).filter((s) => s.length > 0);
      }
      if (typeof val === 'string' && val.trim().length > 0) {
        return [val.trim()];
      }
      return [];
    };

    const validChannels: RecommendedChannel[] = ['email', 'linkedin', 'instagram', 'x'];
    let channel: RecommendedChannel = 'email';
    if (obj.recommended_channel && validChannels.includes(obj.recommended_channel.toLowerCase())) {
      channel = obj.recommended_channel.toLowerCase();
    }

    return {
      qualified: Boolean(obj.qualified),
      score: clamp(obj.score, 0, 100),
      economic_score: clamp(obj.economic_score, 0, 25),
      corporate_score: clamp(obj.corporate_score, 0, 20),
      inbound_score: clamp(obj.inbound_score, 0, 10),
      founder_led_score: clamp(obj.founder_led_score, 0, 10),
      pain_score: clamp(obj.pain_score, 0, 15),
      buying_signal_score: clamp(obj.buying_signal_score, 0, 20),
      verified_facts: toStringArray(obj.verified_facts),
      inferences: toStringArray(obj.inferences),
      unknowns: toStringArray(obj.unknowns),
      qualification_reason: String(obj.qualification_reason || 'Qualified via standard ICP criteria'),
      why_now: String(obj.why_now || 'Active market presence and inbound friction'),
      pain_hypothesis: String(obj.pain_hypothesis || 'Founder handling triage between coaching delivery'),
      personalization_angle: String(obj.personalization_angle || 'Streamlining corporate inbound triage'),
      recommended_channel: channel,
      drafts: obj.drafts
        ? {
            email_subject: obj.drafts.email_subject ? String(obj.drafts.email_subject) : undefined,
            email_body: obj.drafts.email_body ? String(obj.drafts.email_body) : undefined,
            linkedin_message: obj.drafts.linkedin_message ? String(obj.drafts.linkedin_message) : undefined,
            instagram_dm: obj.drafts.instagram_dm ? String(obj.drafts.instagram_dm) : undefined,
            x_dm: obj.drafts.x_dm ? String(obj.drafts.x_dm) : undefined,
          }
        : undefined,
    };
  }
}
