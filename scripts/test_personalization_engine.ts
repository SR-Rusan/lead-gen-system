import { PersonalizationEngine } from '../src/outreach/personalization';
import { ProspectMasterRecord } from '../src/types';

async function runTest() {
  console.log('='.repeat(70));
  console.log('🧪 TESTING MULTI-CHANNEL OUTBOUND PERSONALIZATION ENGINE');
  console.log('='.repeat(70));

  // Case 1: High-ticket executive advisory lead with all 4 channels
  const prospectAllChannels: ProspectMasterRecord = {
    leadId: 'LEAD-TEST-001',
    firstName: 'Sarah',
    lastName: 'Jenkins',
    fullName: 'Sarah Jenkins',
    company: 'Apex Leadership Advisory',
    jobTitle: 'Founder & Senior Executive Leadership Advisor',
    website: 'https://apexleadershipadvisory.com',
    linkedInUrl: 'https://linkedin.com/in/sarahjenkins-apex',
    instagramUrl: 'https://instagram.com/sarahjenkinslead',
    xUrl: 'https://x.com/sjenkins_lead',
    country: 'United States',
    niche: 'Executive Coaching / Corporate Advisory',
    corporateFocus: 'Fortune 500 VP & C-Suite Executives',
    offer: 'Executive Leadership Advisory & Corporate Cohorts',
    estimatedOfferValue: '$25,000 - $50,000',
    leadCaptureMethod: 'General Contact Form / Inbound Email',
    recentBusinessSignal: 'Recently keynoted at Global Executive Summit and launched Q4 Senior Cohort',
    potentialPain: 'Intensive client delivery causes inbound inquiries to sit unreviewed for days',
    email: 'lead6@example.com',
    emailVerificationStatus: 'verified',
    source: 'apify',
    icpScore: 92,
    economicScore: 25,
    corporateScore: 20,
    inboundScore: 10,
    founderLedScore: 10,
    painScore: 12,
    buyingSignalScore: 15,
    verifiedEvidence: 'Company: Apex Leadership Advisory; Focus: Fortune 500 VP & C-Suite; Verified domain & active speaking',
    inference: 'Sarah handles high-ticket corporate inbounds personally between intense coaching workshops',
    unknowns: 'Exact weekly inbound inquiry volume; current intake conversion rate',
    qualificationReason: 'Priority A+ lead: High-ticket corporate retainers ($25k-$50k) with high inbound triage friction',
    whyNow: 'Active keynote speaking and Q4 cohort launch causing calendar bottlenecks',
    personalizationAngle: 'Addressing inbound lead triage latency between Fortune 500 coaching sessions',
    recommendedChannel: 'MULTI-CHANNEL',
    draftEmail: '',
    draftLinkedInMessage: '',
    draftInstagramMessage: '',
    draftXMessage: '',
    status: 'Ready for Review',
    dateAdded: '2026-10-06',
    dateContacted: '',
    followUp1: '',
    followUp2: '',
    response: '',
    positiveResponse: '',
    callBooked: '',
    proposal: '',
    closed: '',
    notes: 'Active LinkedIn poster on C-suite leadership development'
  };

  console.log('\n[TEST 1] Prospect with All 4 Channels (Email, LinkedIn, Instagram, X) - CTA A');
  const result1 = await PersonalizationEngine.generateMultiChannelOutreach(prospectAllChannels, 'CTA A');

  console.log('\n📋 Output JSON Schema:');
  console.log(JSON.stringify(result1, null, 2));

  console.log('\n🔍 Pre-Flight Validation Results:');
  console.log('Passed:', result1.validation_passed);
  console.log('Notes:', result1.validation_notes);

  const formatted1 = PersonalizationEngine.formatOutreachForSheet(result1);
  console.log('\n📊 Formatted for Sheet Columns:');
  console.log('--- Draft Email ---');
  console.log(formatted1.draftEmail);
  console.log('\n--- Draft LinkedIn Message ---');
  console.log(formatted1.draftLinkedInMessage);
  console.log('\n--- Draft Instagram Message ---');
  console.log(formatted1.draftInstagramMessage);
  console.log('\n--- Draft X Message ---');
  console.log(formatted1.draftXMessage);

  const sequence1 = PersonalizationEngine.recommendSequence(result1);
  console.log('\n🗓 Multi-Channel Sequencing Cadence:');
  sequence1.forEach((step) => console.log('  •', step));

  // Case 2: Prospect with ONLY Email (No LinkedIn, No Instagram, No X) - Testing "not_recommended" handling & CTA B
  const prospectEmailOnly: ProspectMasterRecord = {
    ...prospectAllChannels,
    leadId: 'LEAD-TEST-002',
    firstName: 'Marcus',
    lastName: 'Vance',
    fullName: 'Marcus Vance',
    company: 'Vance Executive Advisory',
    linkedInUrl: '',
    instagramUrl: '',
    xUrl: '',
    email: 'marcus@vanceadvisory.com',
  };

  console.log('\n' + '='.repeat(70));
  console.log('[TEST 2] Prospect with ONLY Email (Testing status: "not_recommended" on social) - CTA B');
  const result2 = await PersonalizationEngine.generateMultiChannelOutreach(prospectEmailOnly, 'CTA B');

  console.log('\n📋 Output JSON Schema:');
  console.log(JSON.stringify(result2, null, 2));

  console.log('\n🔍 Pre-Flight Validation Results:');
  console.log('Passed:', result2.validation_passed);
  console.log('Notes:', result2.validation_notes);
  console.log('LinkedIn Status:', result2.linkedin.status);
  console.log('Instagram Status:', result2.instagram.status);
  console.log('X Status:', result2.x.status);

  const formatted2 = PersonalizationEngine.formatOutreachForSheet(result2);
  console.log('\n📊 Formatted for Sheet Columns:');
  console.log('--- Draft Email ---');
  console.log(formatted2.draftEmail);
  console.log('--- Draft LinkedIn ---');
  console.log(formatted2.draftLinkedInMessage);
  console.log('--- Draft Instagram ---');
  console.log(formatted2.draftInstagramMessage);
  console.log('--- Draft X ---');
  console.log(formatted2.draftXMessage);

  console.log('\n' + '='.repeat(70));
  console.log('✅ ALL PERSONALIZATION ENGINE TESTS COMPLETED SUCCESSFULLY');
  console.log('='.repeat(70));
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
