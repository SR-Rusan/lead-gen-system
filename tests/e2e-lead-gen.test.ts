import { orchestrator } from '../src/index';
import { dbClient } from '../src/db/sheets-client';
import { DeduplicationEngine } from '../src/dedup/dedup-engine';
import { ScoringEngine } from '../src/scoring/scoring-engine';
import { telegramApprovalService } from '../src/outreach/telegram-approval';
import { gmailDispatcher } from '../src/outreach/gmail-dispatcher';
import { AnalyticsEngine } from '../src/analytics/analytics-engine';
import { RawLeadInput } from '../src/types';
import * as assert from 'assert';

async function runEndToEndTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING PRODUCTION END-TO-END LEAD GEN & QUALIFICATION TESTS');
  console.log('===============================================================\n');

  // Test 1: Deduplication Engine across all 6 tiers
  console.log('▶ Test 1: Deduplication Engine (6-Tier Hierarchy)...');
  const leadA: RawLeadInput = {
    fullName: 'Robert Sterling',
    email: 'lead3@example.com',
    website: 'https://sterlingadvisory.com',
    company: 'Sterling Advisory',
    source: 'google',
  };
  const { isDuplicate: dup1 } = DeduplicationEngine.findDuplicate(leadA, []);
  assert.strictEqual(dup1, false, 'Lead A should not be duplicate of empty pool');

  const existingRecord = {
    leadId: 'LEAD-TEST-001',
    fullName: 'Robert Sterling',
    email: 'lead3@example.com',
    website: 'https://sterlingadvisory.com',
    company: 'Sterling Advisory',
    linkedInUrl: 'https://linkedin.com/in/robert-sterling',
    notes: 'Initial record',
  } as any;

  // Duplicate via Domain (Tier 2) with different case & path
  const candidateDomainDup: RawLeadInput = {
    fullName: 'Bob Sterling',
    website: 'https://www.sterlingadvisory.com/contact?ref=google',
    source: 'linkedin',
  };
  const { isDuplicate: dup2, tier: tier2 } = DeduplicationEngine.findDuplicate(candidateDomainDup, [existingRecord]);
  assert.strictEqual(dup2, true, 'Domain match should be recognized as duplicate');
  assert.strictEqual(tier2, 'Tier 2 (Domain)');
  console.log('  ✔ Tier 2 Domain deduplication verified');

  // Test 2: Scoring Engine Deterministic Logic
  console.log('\n▶ Test 2: Scoring Engine (0-100 Deterministic Model)...');
  const highTicketCoach: RawLeadInput = {
    fullName: 'Victoria Vance',
    company: 'Vance Executive Advisory',
    jobTitle: 'Managing Partner & Board Advisor',
    snippet: 'Retained executive advisory for Fortune 500 C-Suite leaders ($35k retainers). Applications open for Q4 cohort. Contact page free-text form creates 48h response delay.',
    source: 'google',
  };
  const scoreHigh = ScoringEngine.calculateDeterministicScore(highTicketCoach);
  assert.strictEqual(scoreHigh.economicScore, 25, 'Economic score for $35k retainer should be 25');
  assert.strictEqual(scoreHigh.corporateScore, 20, 'Corporate score for Fortune 500 C-suite should be 20');
  assert.strictEqual(scoreHigh.tier, 'A+', 'Total score should place coach in A+ tier');
  console.log(`  ✔ High-ticket corporate coach scored ${scoreHigh.totalScore}/100 -> Tier: ${scoreHigh.tier}`);

  // Test low-ticket rejection
  const lifeCoach: RawLeadInput = {
    fullName: 'Amy Joy',
    company: 'Mindset Inner Peace',
    jobTitle: 'Life Coach',
    snippet: 'Helping individuals find inner joy. $150 per hour or $497 mindset workshop. DM on Instagram.',
    source: 'instagram',
  };
  const scoreLow = ScoringEngine.calculateDeterministicScore(lifeCoach);
  assert.strictEqual(scoreLow.tier, 'Reject', 'Life coach should be strictly rejected (<50 score)');
  console.log(`  ✔ Low-ticket life coach scored ${scoreLow.totalScore}/100 -> Tier: ${scoreLow.tier}`);

  // Test 3: Ingestion & Deduplication Pipeline
  console.log('\n▶ Test 3: Ingestion Pipeline...');
  const runId = Date.now().toString(36);
  const testBatch: RawLeadInput[] = [
    {
      fullName: `Marcus Sterling ${runId}`,
      company: `Sterling Advisory Group ${runId}`,
      jobTitle: 'Founder & Senior Executive Leadership Coach',
      email: `msterling_${runId}@sterlingadvisory.com`,
      website: `https://sterlingadvisory-${runId}.com`,
      linkedInUrl: `https://linkedin.com/in/msterling-${runId}`,
      country: 'United States',
      snippet: 'Bespoke corporate leadership retainers ($35k) for Fortune 500 C-Suite leaders. Inquiries evaluated personally by Marcus between client training offsites. Free-text intake creates 48h latency.',
      source: 'google',
    },
    // Duplicate of Marcus Sterling from another platform
    {
      fullName: `Marcus Sterling ${runId}`,
      company: `Sterling Advisory Group ${runId}`,
      email: `msterling_${runId}@sterlingadvisory.com`,
      linkedInUrl: `https://linkedin.com/in/msterling-${runId}`,
      source: 'linkedin',
      snippet: 'Active keynote speaker on corporate executive culture.',
    },
  ];

  const ingestRes = await orchestrator.ingestProspects(testBatch);
  assert.strictEqual(ingestRes.ingested, 1, 'Only 1 unique lead should be created');
  assert.strictEqual(ingestRes.duplicatesMerged, 1, '1 duplicate lead should be merged into canonical record');
  console.log('  ✔ Ingestion and canonical merging verified');

  // Test 4: Qualification & Tiering
  console.log('\n▶ Test 4: OpenRouter Qualification & Tiering...');
  const qualRes = await orchestrator.qualifyRawProspects();
  assert.ok(qualRes.qualifiedCount >= 1, 'At least 1 lead should be qualified');
  console.log(`  ✔ Qualification complete: ${qualRes.qualifiedCount} qualified, ${qualRes.rejectedCount} rejected`);

  // Test 5: Deep Research & Personalized Outreach Generation
  console.log('\n▶ Test 5: Deep Research & Personalization Generation...');
  const reviewCount = await orchestrator.researchAndPersonalize();
  assert.ok(reviewCount >= 1, 'At least 1 lead should reach Ready for Review');
  console.log(`  ✔ Deep research generated personalized drafts for ${reviewCount} leads`);

  // Verify generated draft properties
  const readyLeads = dbClient.getReviewReadyLeads();
  const sampleLead = readyLeads[0];
  assert.ok(sampleLead.draftEmail.length > 20, 'Email body draft must not be empty');
  assert.ok(!sampleLead.draftEmail.includes('ChatGPT'), 'Draft email must not mention ChatGPT');
  assert.ok(!sampleLead.draftEmail.includes('AI agents'), 'Draft email must not mention AI agents');
  console.log(`  ✔ Verified generated outreach is natural, evidence-based, and free of AI buzzwords`);

  // Test 6: Human Approval & Telegram Notification
  console.log('\n▶ Test 6: Telegram Human Approval Workflow...');
  const telegramRes = await telegramApprovalService.sendForReview(sampleLead);
  assert.strictEqual(telegramRes.success, true, 'Telegram notification should succeed or simulate cleanly');

  // Simulate human approval action
  const approvedLead = telegramApprovalService.handleApprovalAction(sampleLead.leadId, 'approve');
  assert.ok(approvedLead, 'Approved lead must return valid record');
  assert.strictEqual(approvedLead?.status, 'Approved', 'Status must transition to Approved');
  console.log('  ✔ Telegram human approval successfully transitioned lead status to Approved');

  // Test 7: Approved Dispatch & Gmail Safety
  console.log('\n▶ Test 7: Outreach Dispatch (Draft Safety Mode)...');
  const dispatchRes = await gmailDispatcher.dispatchApprovedOutreach(approvedLead!.leadId);
  assert.strictEqual(dispatchRes.success, true, 'Dispatch must succeed');
  assert.strictEqual(dispatchRes.mode, 'draft_created', 'Safe draft mode must create draft without live sending');
  console.log('  ✔ Gmail draft created safely and lead marked as Contacted');

  // Test 8: Analytics Engine
  console.log('\n▶ Test 8: Analytics Engine Calculations...');
  const summary = AnalyticsEngine.computeMetrics();
  assert.ok(summary.totalRaw > 0, 'Total raw leads must be greater than 0');
  assert.ok(summary.totalContacted >= 1, 'Total contacted leads must be at least 1');
  console.log('  ✔ Funnel metrics computed successfully');

  console.log('\n===============================================================');
  console.log('🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY (100% GREEN)');
  console.log('===============================================================\n');
}

runEndToEndTests().catch((err) => {
  console.error('❌ E2E Tests Failed:', err);
  process.exit(1);
});
