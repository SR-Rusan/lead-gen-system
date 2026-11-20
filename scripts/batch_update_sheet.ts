import * as fs from 'fs';
import * as path from 'path';
import { PersonalizationEngine } from '../src/outreach/personalization';
import { ProspectMasterRecord } from '../src/types';

const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
const CREDS_PATH = '/Users/rusan/.config/gdrive/.gdrive-server-credentials.json';

async function getAccessToken(): Promise<string> {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  return creds.access_token;
}

async function run() {
  const token = await getAccessToken();

  // 1. Fetch current rows from Google Sheet
  const readRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Master_Prospects!A2:AM8`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!readRes.ok) {
    const errText = await readRes.text();
    throw new Error(`Failed to read sheet: ${errText}`);
  }

  const readData = (await readRes.json()) as any;
  const rows: string[][] = readData.values || [];

  console.log(`Fetched ${rows.length} rows from Google Sheet.`);

  const updates: { range: string; values: string[][] }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const lead: ProspectMasterRecord = {
      leadId: row[0] || `LEAD-${rowNum}`,
      firstName: row[1] || '',
      lastName: row[2] || '',
      fullName: row[3] || `${row[1] || ''} ${row[2] || ''}`.trim(),
      company: row[4] || '',
      jobTitle: row[5] || '',
      website: row[6] || '',
      linkedInUrl: row[7] || '',
      instagramUrl: row[8] || '',
      xUrl: row[9] || '',
      country: row[10] || 'United States',
      niche: row[11] || 'Executive Coach',
      corporateFocus: row[12] || 'Enterprise C-Suite',
      offer: row[13] || 'Executive Leadership Advisory',
      estimatedOfferValue: row[14] || '$25,000+',
      leadCaptureMethod: row[15] || 'Direct Contact Form',
      recentBusinessSignal: row[16] || '',
      potentialPain: row[17] || 'Manual inquiry triage & calendar fragmentation',
      email: row[18] || '',
      emailVerificationStatus: 'verified',
      source: 'google',
      icpScore: Number(row[21] || 80),
      economicScore: Number(row[22] || 25),
      corporateScore: Number(row[23] || 20),
      inboundScore: Number(row[24] || 10),
      founderLedScore: Number(row[25] || 10),
      painScore: Number(row[26] || 15),
      buyingSignalScore: Number(row[27] || 15),
      verifiedEvidence: row[28] || '',
      inference: row[29] || '',
      unknowns: row[30] || '',
      qualificationReason: row[31] || '',
      whyNow: row[32] || '',
      personalizationAngle: row[33] || '',
      recommendedChannel: (row[34] as any) || 'email',
      draftEmail: '',
      draftLinkedInMessage: '',
      draftInstagramMessage: '',
      draftXMessage: '',
      status: 'Ready for Review',
      dateAdded: '',
      dateContacted: '',
      followUp1: '',
      followUp2: '',
      response: '',
      positiveResponse: '',
      callBooked: '',
      proposal: '',
      closed: '',
      notes: row[39] || '',
    };

    console.log(`Generating multi-channel outreach for Row ${rowNum}: ${lead.fullName} (${lead.company})...`);
    const multi = await PersonalizationEngine.generateMultiChannelOutreach(lead, i % 2 === 0 ? 'CTA A' : 'CTA B');
    const formatted = PersonalizationEngine.formatOutreachForSheet(multi);

    // Columns AI (35): Recommended Channel, AJ (36): Email, AK (37): LinkedIn, AL (38): Instagram, AM (39): X
    updates.push({
      range: `Master_Prospects!AI${rowNum}:AM${rowNum}`,
      values: [
        [
          multi.recommended_channel,
          formatted.draftEmail,
          formatted.draftLinkedInMessage,
          formatted.draftInstagramMessage,
          formatted.draftXMessage,
        ],
      ],
    });
  }

  // 2. Batch update Google Sheet
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updates,
      }),
    }
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Failed to batch update sheet: ${errText}`);
  }

  const result = await updateRes.json();
  console.log('\n✅ Successfully batch updated Google Sheet:');
  console.log(JSON.stringify(result, null, 2));
}

run().catch(console.error);
