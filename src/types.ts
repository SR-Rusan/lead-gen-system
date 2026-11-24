/**
 * Executive Lead Intake & Triage System
 * Core Type Definitions
 */

export type PipelineStatus =
  | 'Raw'
  | 'Researching'
  | 'Qualified'
  | 'A+'
  | 'A'
  | 'B'
  | 'Rejected'
  | 'Ready for Review'
  | 'Approved'
  | 'Contacted'
  | 'Follow-up'
  | 'Replied'
  | 'Positive'
  | 'Call Booked'
  | 'Proposal'
  | 'Won'
  | 'Lost'
  | 'Nurture';

export type LeadSource = 'google' | 'serper' | 'apify' | 'linkedin' | 'instagram' | 'x' | 'manual';

export type RecommendedChannel =
  | 'email'
  | 'linkedin'
  | 'instagram'
  | 'x'
  | 'multi-channel'
  | 'EMAIL'
  | 'LINKEDIN'
  | 'INSTAGRAM'
  | 'X'
  | 'MULTI-CHANNEL';

export type EvidenceCategory = 'VERIFIED FACT' | 'INFERENCE' | 'UNKNOWN';

export interface EvidenceItem {
  category: EvidenceCategory;
  claim: string;
  sourceUrl?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScoreBreakdown {
  totalScore: number;          // 0 - 100
  economicScore: number;       // 0 - 25
  corporateScore: number;      // 0 - 20
  inboundScore: number;        // 0 - 10
  founderLedScore: number;     // 0 - 10
  painScore: number;           // 0 - 15
  buyingSignalScore: number;   // 0 - 20
  tier: 'A+' | 'A' | 'B' | 'Reject';
  evidence: {
    economic: string;
    corporate: string;
    inbound: string;
    founderLed: string;
    pain: string;
    buyingSignals: string;
  };
}

export interface MultiChannelEmail {
  subject?: string;
  message?: string;
  status?: string;
}

export interface MultiChannelLinkedIn {
  connection_note?: string;
  first_message?: string;
  follow_up?: string;
  status?: string;
}

export interface MultiChannelInstagram {
  first_message?: string;
  follow_up?: string;
  status?: string;
}

export interface MultiChannelX {
  reply_or_opener?: string;
  dm?: string;
  follow_up?: string;
  status?: string;
}

export interface MultiChannelPersonalizationOutput {
  personalization_summary: string;
  pain_hypothesis: string;
  recommended_channel: 'EMAIL' | 'LINKEDIN' | 'INSTAGRAM' | 'X' | 'MULTI-CHANNEL' | string;
  email: MultiChannelEmail;
  linkedin: MultiChannelLinkedIn;
  instagram: MultiChannelInstagram;
  x: MultiChannelX;
  cta_variant: 'CTA A' | 'CTA B' | string;
  validation_passed: boolean;
  validation_notes: string[];
}

export interface OutreachDrafts {
  email?: {
    subject: string;
    body: string;
    status?: string;
  };
  linkedin?: {
    message?: string;
    connection_note?: string;
    first_message?: string;
    follow_up?: string;
    status?: string;
  };
  instagram?: {
    dm?: string;
    first_message?: string;
    follow_up?: string;
    status?: string;
  };
  x?: {
    dm?: string;
    reply_or_opener?: string;
    follow_up?: string;
    status?: string;
  };
  multiChannelOutput?: MultiChannelPersonalizationOutput;
}

export interface AIQualificationOutput {
  qualified: boolean;
  score: number;
  economic_score: number;
  corporate_score: number;
  inbound_score: number;
  founder_led_score: number;
  pain_score: number;
  buying_signal_score: number;
  verified_facts: string[];
  inferences: string[];
  unknowns: string[];
  qualification_reason: string;
  why_now: string;
  pain_hypothesis: string;
  personalization_angle: string;
  recommended_channel: RecommendedChannel;
  drafts?: {
    email_subject?: string;
    email_body?: string;
    linkedin_message?: string;
    instagram_dm?: string;
    x_dm?: string;
  };
  multi_channel_outreach?: MultiChannelPersonalizationOutput;
}

export interface ProspectMasterRecord {
  leadId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  jobTitle: string;
  website: string;
  linkedInUrl: string;
  instagramUrl: string;
  xUrl: string;
  country: string;
  niche: string;
  corporateFocus: string;
  offer: string;
  estimatedOfferValue: string;
  leadCaptureMethod: string;
  recentBusinessSignal: string;
  potentialPain: string;
  email: string;
  emailVerificationStatus: 'verified' | 'unverified' | 'catch-all' | 'unknown' | 'invalid';
  source: LeadSource;
  icpScore: number;
  economicScore: number;
  corporateScore: number;
  inboundScore: number;
  founderLedScore: number;
  painScore: number;
  buyingSignalScore: number;
  verifiedEvidence: string;
  inference: string;
  unknowns: string;
  qualificationReason: string;
  whyNow: string;
  personalizationAngle: string;
  recommendedChannel: RecommendedChannel | '';
  draftEmail: string;
  draftLinkedInMessage: string;
  draftInstagramMessage: string;
  draftXMessage: string;
  status: PipelineStatus;
  dateAdded: string;
  dateContacted: string;
  followUp1: string;
  followUp2: string;
  response: 'Yes' | 'No' | '';
  positiveResponse: 'Yes' | 'No' | '';
  callBooked: 'Yes' | 'No' | '';
  proposal: 'Yes' | 'No' | '';
  closed: 'Won' | 'Lost' | '';
  notes: string;
  /** Filled by the mailbox sync (rusan@ Sent folder): how many emails went to this lead, and the last one. */
  emailsSent?: number;
  lastSentAt?: string;
  lastMessageId?: string;
  lastSubject?: string;
  /** Message-IDs of inbox mail already matched to this lead, so a reply is only counted once. */
  seenMessageIds?: string[];
  /** Why the email needs a human look before sending (failed automatic checks). Empty = passed. */
  needsLook?: string;
}

export interface RawLeadInput {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  website?: string;
  email?: string;
  linkedInUrl?: string;
  instagramUrl?: string;
  xUrl?: string;
  country?: string;
  niche?: string;
  offer?: string;
  snippet?: string;
  notes?: string;
  leadCaptureMethod?: string;
  recentBusinessSignal?: string;
  potentialPain?: string;
  source: LeadSource;
  rawPayload?: Record<string, any>;
}

export interface AnalyticsSummary {
  totalRaw: number;
  totalQualified: number;
  totalAPlus: number;
  totalA: number;
  totalB: number;
  totalRejected: number;
  totalReadyForReview: number;
  totalApproved: number;
  totalContacted: number;
  totalReplies: number;
  totalPositiveReplies: number;
  totalCallsBooked: number;
  totalProposals: number;
  totalWon: number;
  totalLost: number;
  qualificationRatePct: number;
  replyRatePct: number;
  positiveReplyRatePct: number;
  callRatePct: number;
  proposalRatePct: number;
  closeRatePct: number;
  overallLeadToClientPct: number;
  channelBreakdown: Record<string, { count: number; qualified: number; calls: number; won: number }>;
  sourceBreakdown: Record<string, { count: number; qualified: number; calls: number; won: number }>;
}
