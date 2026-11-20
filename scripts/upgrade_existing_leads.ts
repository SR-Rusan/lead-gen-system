import { DatabaseClient } from '../src/db/sheets-client';
import { PersonalizationEngine } from '../src/outreach/personalization';

async function upgradeExistingLeads() {
  const db = new DatabaseClient();
  const leads = db.getAll();

  console.log(`Upgrading ${leads.length} existing leads with the new multi-channel personalization engine...`);

  for (const lead of leads) {
    console.log(`\nProcessing: ${lead.fullName} (${lead.company}) [Score: ${lead.icpScore}]`);
    const multi = await PersonalizationEngine.generateMultiChannelOutreach(lead);
    const formatted = PersonalizationEngine.formatOutreachForSheet(multi);

    lead.draftEmail = formatted.draftEmail;
    lead.draftLinkedInMessage = formatted.draftLinkedInMessage;
    lead.draftInstagramMessage = formatted.draftInstagramMessage;
    lead.draftXMessage = formatted.draftXMessage;
    lead.recommendedChannel = multi.recommended_channel as any;

    db.upsert(lead);
    console.log(`  ✓ Recommended Channel: ${multi.recommended_channel}`);
    console.log(`  ✓ Email status: ${multi.email.status || 'Generated (' + (multi.email.message?.split(/\s+/).length || 0) + ' words)'}`);
    console.log(`  ✓ LinkedIn status: ${multi.linkedin.status || 'Generated (3 touches)'}`);
    console.log(`  ✓ Instagram status: ${multi.instagram.status || 'Generated (2 touches)'}`);
    console.log(`  ✓ X status: ${multi.x.status || 'Generated (3 touches)'}`);
    console.log(`  ✓ Validation Passed: ${multi.validation_passed}`);
  }

  console.log('\nAll existing leads in the local database and CSV have been upgraded!');
}

upgradeExistingLeads().catch(console.error);
