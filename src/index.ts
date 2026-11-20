import { RawLeadInput, ProspectMasterRecord } from './types';
import { dbClient } from './db/sheets-client';
import { DeduplicationEngine } from './dedup/dedup-engine';
import { openRouterService } from './ai/openrouter';
import { PersonalizationEngine } from './outreach/personalization';
import { telegramApprovalService } from './outreach/telegram-approval';
import { gmailDispatcher } from './outreach/gmail-dispatcher';
import { AnalyticsEngine } from './analytics/analytics-engine';
import { SEED_PROSPECTS } from './db/seed-data';
import { googleSerperDiscovery } from './discovery/google-serper';
import { apifyDiscovery } from './discovery/apify-discovery';

export class LeadGenOrchestrator {
  /**
   * Phase 1: Ingests and Deduplicates raw leads from any source
   */
  public async ingestProspects(rawInputs: RawLeadInput[]): Promise<{ ingested: number; duplicatesMerged: number }> {
    console.log(`[Orchestrator] Starting ingestion of ${rawInputs.length} raw prospects...`);
    const existing = dbClient.getAll();
    let ingestedCount = 0;
    let mergedCount = 0;

    for (const raw of rawInputs) {
      const { isDuplicate, matchedRecord, tier } = DeduplicationEngine.findDuplicate(raw, existing);

      if (isDuplicate && matchedRecord) {
        console.log(`[Orchestrator] Duplicate detected (${tier}): ${raw.fullName || raw.company}. Merging into ${matchedRecord.leadId}`);
        const merged = DeduplicationEngine.mergeIntoCanonical(matchedRecord, raw);
        dbClient.upsert(merged);
        mergedCount++;
      } else {
        const leadId = `LEAD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 899 + 100)}`;
        const fullName = raw.fullName || `${raw.firstName || ''} ${raw.lastName || ''}`.trim() || 'Unknown';
        const parts = fullName.split(' ');
        const firstName = raw.firstName || parts[0] || '';
        const lastName = raw.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : '');

        const newRecord: ProspectMasterRecord = {
          leadId,
          firstName,
          lastName,
          fullName,
          company: raw.company || '',
          jobTitle: raw.jobTitle || 'Executive Advisory',
          website: raw.website || '',
          linkedInUrl: raw.linkedInUrl || '',
          instagramUrl: raw.instagramUrl || '',
          xUrl: raw.xUrl || '',
          country: raw.country || 'United States',
          niche: raw.niche || 'Executive Coach',
          corporateFocus: 'Unknown',
          offer: 'Corporate Executive Leadership Program',
          estimatedOfferValue: '$10k-$30k',
          leadCaptureMethod: 'Inbound Contact / Application',
          recentBusinessSignal: 'Active corporate positioning',
          potentialPain: 'Manual lead intake & triage drag',
          email: raw.email || '',
          emailVerificationStatus: raw.email ? 'verified' : 'unknown',
          source: raw.source,
          icpScore: 0,
          economicScore: 0,
          corporateScore: 0,
          inboundScore: 0,
          founderLedScore: 0,
          painScore: 0,
          buyingSignalScore: 0,
          verifiedEvidence: '',
          inference: '',
          unknowns: '',
          qualificationReason: '',
          whyNow: '',
          personalizationAngle: '',
          recommendedChannel: raw.email ? 'email' : (raw.linkedInUrl ? 'linkedin' : ''),
          draftEmail: '',
          draftLinkedInMessage: '',
          draftInstagramMessage: '',
          draftXMessage: '',
          status: 'Raw',
          dateAdded: new Date().toISOString().split('T')[0],
          dateContacted: '',
          followUp1: '',
          followUp2: '',
          response: '',
          positiveResponse: '',
          callBooked: '',
          proposal: '',
          closed: '',
          notes: raw.snippet || '',
        };

        dbClient.upsert(newRecord);
        existing.push(newRecord);
        ingestedCount++;
      }
    }

    console.log(`[Orchestrator] Ingestion complete: ${ingestedCount} new records created, ${mergedCount} duplicates merged.`);
    return { ingested: ingestedCount, duplicatesMerged: mergedCount };
  }

  /**
   * Phase 2: Qualifies all Raw prospects using OpenRouter Stage 1 Fast Model
   */
  public async qualifyRawProspects(): Promise<{ qualifiedCount: number; rejectedCount: number }> {
    const rawLeads = dbClient.getRawLeads();
    console.log(`[Orchestrator] Found ${rawLeads.length} Raw leads awaiting qualification...`);
    let qualifiedCount = 0;
    let rejectedCount = 0;

    for (const lead of rawLeads) {
      console.log(`[Orchestrator] Evaluating ${lead.fullName} (${lead.company})...`);
      const qualOutput = await openRouterService.evaluateStage1Fast(lead);

      lead.icpScore = qualOutput.score;
      lead.economicScore = qualOutput.economic_score;
      lead.corporateScore = qualOutput.corporate_score;
      lead.inboundScore = qualOutput.inbound_score;
      lead.founderLedScore = qualOutput.founder_led_score;
      lead.painScore = qualOutput.pain_score;
      lead.buyingSignalScore = qualOutput.buying_signal_score;
      lead.verifiedEvidence = qualOutput.verified_facts.join('; ');
      lead.inference = qualOutput.inferences.join('; ');
      lead.unknowns = qualOutput.unknowns.join('; ');
      lead.qualificationReason = qualOutput.qualification_reason;
      lead.whyNow = qualOutput.why_now;
      lead.personalizationAngle = qualOutput.personalization_angle;
      lead.recommendedChannel = qualOutput.recommended_channel;

      if (qualOutput.score >= 80) {
        lead.status = 'A+';
        qualifiedCount++;
      } else if (qualOutput.score >= 65) {
        lead.status = 'A';
        qualifiedCount++;
      } else if (qualOutput.score >= 50) {
        lead.status = 'B';
        qualifiedCount++;
      } else {
        lead.status = 'Rejected';
        rejectedCount++;
      }

      dbClient.upsert(lead);
      console.log(`[Orchestrator] ${lead.fullName} -> Score: ${lead.icpScore}/100, Tier: ${lead.status}`);
    }

    return { qualifiedCount, rejectedCount };
  }

  /**
   * Phase 3: Conducts Deep Research & Generates Personalization for A/A+ prospects
   */
  public async researchAndPersonalize(): Promise<number> {
    const candidateLeads = dbClient.getAll().filter((r) => r.status === 'A+' || r.status === 'A');
    console.log(`[Orchestrator] Conducting deep research and message generation for ${candidateLeads.length} A/A+ leads...`);
    let reviewReadyCount = 0;

    for (const lead of candidateLeads) {
      console.log(`[Orchestrator] Deep researching: ${lead.fullName} (${lead.company})...`);
      const deepOutput = await openRouterService.conductStage2DeepResearch(lead);

      // Generate bespoke multi-channel drafts
      if (deepOutput.multi_channel_outreach) {
        const formatted = PersonalizationEngine.formatOutreachForSheet(deepOutput.multi_channel_outreach);
        lead.draftEmail = formatted.draftEmail;
        lead.draftLinkedInMessage = formatted.draftLinkedInMessage;
        lead.draftInstagramMessage = formatted.draftInstagramMessage;
        lead.draftXMessage = formatted.draftXMessage;
      } else {
        const drafts = await PersonalizationEngine.generateBespokeDrafts(lead);
        lead.draftEmail = drafts.email?.body || '';
        lead.draftLinkedInMessage = drafts.linkedin?.message || '';
        lead.draftInstagramMessage = drafts.instagram?.dm || '';
        lead.draftXMessage = drafts.x?.dm || '';
      }

      lead.status = 'Ready for Review';
      dbClient.upsert(lead);
      reviewReadyCount++;

      // Trigger Telegram notification
      await telegramApprovalService.sendForReview(lead);
    }

    return reviewReadyCount;
  }
}

export const orchestrator = new LeadGenOrchestrator();

export async function runQualificationPipeline(): Promise<void> {
  console.log('\n======================================================');
  console.log('🚀 EXECUTING LEAD GENERATION & TRIAGE PIPELINE');
  console.log('======================================================\n');

  // 1. Ingest initial seed prospects
  await orchestrator.ingestProspects(SEED_PROSPECTS);

  // 2. Discover from Serper / Apify
  const serperLeads = await googleSerperDiscovery.discoverProspects();
  await orchestrator.ingestProspects(serperLeads);

  const linkedInLeads = await apifyDiscovery.discoverLinkedIn();
  await orchestrator.ingestProspects(linkedInLeads);

  // 3. Qualify Raw leads
  await orchestrator.qualifyRawProspects();

  // 4. Research & Personalize A/A+
  await orchestrator.researchAndPersonalize();

  // 5. Print Analytics
  console.log('\n' + AnalyticsEngine.formatDashboard(AnalyticsEngine.computeMetrics()));
}
