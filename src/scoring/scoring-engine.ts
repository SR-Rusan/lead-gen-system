import { ScoreBreakdown, ProspectMasterRecord, RawLeadInput } from '../types';
import { CONFIG } from '../config';

export class ScoringEngine {
  /**
   * Deterministically calculates qualification score components based on verified evidence
   */
  public static calculateDeterministicScore(lead: Partial<ProspectMasterRecord> | RawLeadInput): ScoreBreakdown {
    const textCorpus = [
      lead.company || '',
      lead.jobTitle || '',
      lead.niche || '',
      lead.offer || '',
      (lead as any).snippet || '',
      lead.leadCaptureMethod || '',
      lead.recentBusinessSignal || '',
      lead.potentialPain || '',
      lead.notes || '',
    ]
      .join(' ')
      .toLowerCase();

    // 1. Economic Value (0 - 25)
    let economicScore = 0;
    let economicEvidence = 'No pricing verified';

    if (/\$([2-9]\d|\d{3})k|\$25,000|\$30,000|\$35,000|\$40,000|\$50,000|c-suite|fortune\s?500|enterprise\sretainer/i.test(textCorpus)) {
      economicScore = 25;
      economicEvidence = 'Verified evidence of $25k+ high-ticket corporate retainer or C-Suite engagement.';
    } else if (/\$1[0-9]k|\$10,000|\$15,000|\$20,000|executive\sretainer|enterprise/i.test(textCorpus)) {
      economicScore = 20;
      economicEvidence = 'Strong indicators of $10k-$25k engagement fee based on executive target audience.';
    } else if (/\$5k|\$5,000|\$7,500|leadership\sprogram/i.test(textCorpus)) {
      economicScore = 10;
      economicEvidence = 'Estimated $5k-$10k engagement tier.';
    } else if (/life\scoach|inner\speace|\$150|\$497|\$500|\$1,000|hobby/i.test(textCorpus)) {
      economicScore = 2;
      economicEvidence = 'Low-ticket indicators ($150-$1,000 / consumer life coach). Low economic fit.';
    } else {
      // Default baseline for confirmed executive/leadership advisory
      if (/executive\scoach|leadership\sconsultant|corporate\strainer/i.test(textCorpus)) {
        economicScore = 15;
        economicEvidence = 'Inferred high-ticket capability based on verified B2B leadership consulting positioning.';
      } else {
        economicScore = 5;
        economicEvidence = 'Unknown exact pricing; insufficient corporate evidence.';
      }
    }

    // 2. Corporate Focus (0 - 20)
    let corporateScore = 0;
    let corporateEvidence = 'Consumer / individual focus';

    if (/fortune\s?500|ftse|enterprise|board\sof\sdirectors|c-suite|vice\spresident|executives\sat/i.test(textCorpus)) {
      corporateScore = 20;
      corporateEvidence = 'Strict enterprise and corporate executive buyer positioning verified.';
    } else if (/corporate|organizations|leadership\steams|b2b/i.test(textCorpus)) {
      corporateScore = 15;
      corporateEvidence = 'Corporate organizational training and leadership development client focus.';
    } else if (/career\scoaching|professional/i.test(textCorpus)) {
      corporateScore = 8;
      corporateEvidence = 'Mixed corporate and individual career focus.';
    } else {
      corporateScore = 0;
      corporateEvidence = 'No corporate buyer focus identified (consumer/personal focus).';
    }

    // 3. Inbound Potential (0 - 10)
    let inboundScore = 0;
    let inboundEvidence = 'Minimal inbound infrastructure observed';

    const hasCapture = /application|consultation\sform|contact\sform|typeform|inquiry|booking/i.test(textCorpus);
    const hasContent = /linkedin|podcast|keynote|actively\sposting|cohort/i.test(textCorpus);

    if (hasCapture && hasContent) {
      inboundScore = 10;
      inboundEvidence = 'Active thought-leadership distribution + live inbound inquiry/application mechanism.';
    } else if (hasCapture || hasContent) {
      inboundScore = 6;
      inboundEvidence = hasCapture ? 'Live inbound intake mechanism found.' : 'Active content creation but informal intake.';
    } else {
      inboundScore = 2;
      inboundEvidence = 'Static web presence with standard basic contact mechanism.';
    }

    // 4. Founder-Led Sales (0 - 10)
    let founderLedScore = 0;
    let founderLedEvidence = 'Sales team structure unknown';

    if (/solo|founder\spersonally|principal\spartner|managing\sdirector\s&\sfounder|solo\spartner/i.test(textCorpus)) {
      founderLedScore = 10;
      founderLedEvidence = 'Founder/Principal personally evaluates inbounds and leads sales engagements.';
    } else if (/founder|president|principal|owner/i.test(textCorpus)) {
      founderLedScore = 8;
      founderLedEvidence = 'Boutique firm where founder is active in primary client intake.';
    } else {
      founderLedScore = 4;
      founderLedEvidence = 'Unknown sales team size; standard boutique consultant profile.';
    }

    // 5. Operational Pain (0 - 15)
    let painScore = 0;
    let painEvidence = 'No obvious operational friction detected';

    const hasIntakeFriction = /free-text|contact\sform|typeform|inbox\sintake|paragraph\sresponses|general\scontact/i.test(textCorpus);
    const hasLatency = /between\straining|latency|during\stravel|travel|high\svolume|responding\sas\squickly/i.test(textCorpus);

    if (hasIntakeFriction && hasLatency) {
      painScore = 15;
      painEvidence = 'High acute pain: Unstructured inbox/free-form intake + visible triage latency between client commitments.';
    } else if (hasIntakeFriction) {
      painScore = 10;
      painEvidence = 'Operational friction: General contact/free-text form creates manual reading and qualification drag.';
    } else if (hasLatency) {
      painScore = 7;
      painEvidence = 'Time friction: Active travel or training delivery creates delay in responding to inquiries.';
    } else {
      painScore = 3;
      painEvidence = 'Standard intake format with typical boutique administrative overhead.';
    }

    // 6. Buying / Growth Signals (0 - 20)
    let buyingSignalScore = 0;
    let buyingEvidence = 'No active growth signals detected';

    if (/applications\sopen|new\scohort|high\svolume\sof\sinquiries|q4\sexecutive\scohort|scaling/i.test(textCorpus)) {
      buyingSignalScore = 20;
      buyingEvidence = 'Major buying signal: Currently launching program/cohort and publicly reporting high inquiry volume.';
    } else if (/new\sprogram|keynote\sspeaker|actively\sposting|expansion/i.test(textCorpus)) {
      buyingSignalScore = 12;
      buyingEvidence = 'Active business expansion and public visibility.';
    } else {
      buyingSignalScore = 4;
      buyingEvidence = 'Baseline operational presence without specific immediate launch signal.';
    }

    // Calculate total deterministic score
    const totalScore = Math.min(
      100,
      Math.max(0, economicScore + corporateScore + inboundScore + founderLedScore + painScore + buyingSignalScore)
    );

    let tier: 'A+' | 'A' | 'B' | 'Reject' = 'Reject';
    if (totalScore >= CONFIG.thresholds.aPlus) {
      tier = 'A+';
    } else if (totalScore >= CONFIG.thresholds.a) {
      tier = 'A';
    } else if (totalScore >= CONFIG.thresholds.b) {
      tier = 'B';
    } else {
      tier = 'Reject';
    }

    return {
      totalScore,
      economicScore,
      corporateScore,
      inboundScore,
      founderLedScore,
      painScore,
      buyingSignalScore,
      tier,
      evidence: {
        economic: economicEvidence,
        corporate: corporateEvidence,
        inbound: inboundEvidence,
        founderLed: founderLedEvidence,
        pain: painEvidence,
        buyingSignals: buyingEvidence,
      },
    };
  }
}
