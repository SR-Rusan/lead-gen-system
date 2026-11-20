import { googleSerperDiscovery } from '../src/discovery/google-serper';
import { apifyDiscovery } from '../src/discovery/apify-discovery';
import { RawLeadInput } from '../src/types';

const N8N_WEBHOOK_URL = process.env.N8N_INGEST_URL || 'http://localhost:5678/webhook/prospect-ingest';

async function main() {
  console.log('\n======================================================');
  console.log('🔍 INITIATING B2B LEAD SCRAPING & N8N TRIAGE PIPELINE');
  console.log('======================================================');
  console.log(`Targeting: Executive Coaches, Leadership Consultants & Advisory Firms ($10k-$50k retainers)`);
  console.log(`Destination: n8n Webhook at ${N8N_WEBHOOK_URL}\n`);

  const allDiscovered: RawLeadInput[] = [];

  // 1. Google Serper Discovery (Targeting high-ticket executive coaches)
  console.log('📡 [1/2] Scraping executive advisory practices from Google...');
  try {
    const serperLeads = await googleSerperDiscovery.discoverProspects();
    console.log(`✅ Discovered ${serperLeads.length} prospects from Google Serper`);
    allDiscovered.push(...serperLeads);
  } catch (err) {
    console.error('❌ Error during Google search scraping:', (err as Error).message);
  }

  // 2. Apify / LinkedIn Discovery (Targeting corporate leadership consultants)
  console.log('\n📡 [2/2] Scraping corporate leadership consultants from LinkedIn...');
  try {
    const linkedInLeads = await apifyDiscovery.discoverLinkedIn();
    console.log(`✅ Discovered ${linkedInLeads.length} prospects from LinkedIn`);
    allDiscovered.push(...linkedInLeads);
  } catch (err) {
    console.error('❌ Error during LinkedIn scraping:', (err as Error).message);
  }

  console.log(`\n📊 Total raw leads scraped across channels: ${allDiscovered.length}`);
  console.log(`🚀 Dispatching leads to n8n webhook for 6-Tier Dedup, 0-100 ICP Scoring & Personalization...`);

  let successCount = 0;
  for (const lead of allDiscovered) {
    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      });

      if (res.ok) {
        successCount++;
        console.log(`  ✓ Dispatched to n8n: ${lead.fullName || lead.company} (${lead.niche || 'Executive Coach'})`);
      } else {
        console.warn(`  ⚠ n8n returned HTTP ${res.status} for ${lead.fullName || lead.company}`);
      }
      // Spacing to avoid Google Sheets API concurrent append collisions
      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      console.error(`  ❌ Failed to dispatch ${lead.fullName}:`, (err as Error).message);
    }
  }

  console.log('\n======================================================');
  console.log(`🎉 SCRAPING & INGESTION COMPLETE: ${successCount}/${allDiscovered.length} dispatched to n8n!`);
  console.log('Check your n8n execution log and Google Sheet for triaged records.');
  console.log('======================================================\n');
}

main().catch(console.error);
