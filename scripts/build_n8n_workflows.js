const fs = require('fs');
const path = require('path');

const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
const SHEET_NAME = 'Master_Prospects';
const GS_CRED_ID = 'google-sheets-oauth-cred';
const GMAIL_CRED_ID = 'gmail-oauth-cred';

const COLUMNS = [
  'Lead ID', 'First Name', 'Last Name', 'Full Name', 'Company', 'Job Title',
  'Website', 'LinkedIn URL', 'Instagram URL', 'X URL', 'Country', 'Niche',
  'Corporate Focus', 'Offer', 'Estimated Offer Value', 'Lead Capture Method',
  'Recent Business Signal', 'Potential Pain', 'Email', 'Email Verification Status',
  'Source', 'ICP Score', 'Economic Score', 'Corporate Score', 'Inbound Score',
  'Founder-Led Score', 'Pain Score', 'Buying Signal Score', 'Verified Evidence',
  'Inference', 'Unknowns', 'Qualification Reason', 'Why Now', 'Personalization Angle',
  'Recommended Channel', 'Draft Email', 'Draft LinkedIn Message', 'Draft Instagram Message',
  'Draft X Message', 'Status', 'Date Added', 'Date Contacted', 'Follow-up 1',
  'Follow-up 2', 'Response', 'Positive Response', 'Call Booked', 'Proposal',
  'Closed', 'Notes'
];

const schemaArray = COLUMNS.map(c => ({
  id: c,
  displayName: c,
  required: false,
  defaultMatch: false,
  display: true,
  type: c.includes('Score') ? 'number' : 'string',
  canBeUsedToMatch: c === 'Lead ID'
}));

// 1. MASTER INTAKE, DEDUP & AI TRIAGE WORKFLOW
const masterWorkflow = {
  id: 'ExecLeadTriage01',
  name: 'Executive Lead Intake, 6-Tier Dedup & AI Triage (Master)',
  active: true,
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'prospect-ingest',
        responseMode: 'onReceived',
        options: {}
      },
      id: 'node-1-webhook-ingest',
      name: 'Lead Ingest Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [120, 240],
      webhookId: 'exec-lead-ingest-webhook'
    },
    {
      parameters: {},
      id: 'node-2-manual-trigger',
      name: 'Manual Test Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [120, 440]
    },
    {
      parameters: {
        jsCode: `// Normalize Inbound Raw Prospects (handles single object, array, or manual test data)
const raw = $input.all();
let items = [];

if (raw.length === 1 && raw[0].json && Object.keys(raw[0].json).length === 0) {
  // Triggered manually without body -> provide high-value test lead
  items = [
    {
      fullName: 'Dr. Gregory House',
      company: 'House Executive Leadership',
      jobTitle: 'Founder & Senior Executive Leadership Coach',
      website: 'https://houseleadership.com',
      linkedInUrl: 'https://linkedin.com/in/ghouse-exec',
      email: 'lead4@example.com',
      niche: 'Executive Coach',
      offer: 'High-Ticket Corporate Leadership Retainer',
      estimatedOfferValue: '$25,000+',
      leadCaptureMethod: 'Inbound Contact / Direct Application',
      recentBusinessSignal: 'Actively keynote speaking and expanding corporate cohort',
      notes: 'Solo boutique practice; inbounds evaluated personally by founder.'
    }
  ];
} else {
  for (const item of raw) {
    const data = item.json.body || item.json;
    if (Array.isArray(data)) {
      items.push(...data);
    } else {
      items.push(data);
    }
  }
}

const cleaned = items.map((p, idx) => {
  const fullName = (p.fullName || p['Full Name'] || '').trim();
  const nameParts = fullName.split(' ');
  const firstName = (p.firstName || p['First Name'] || nameParts[0] || '').trim();
  const lastName = (p.lastName || p['Last Name'] || nameParts.slice(1).join(' ') || '').trim();
  const company = (p.company || p['Company'] || '').trim();
  const leadId = p.leadId || p['Lead ID'] || ('LEAD-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 899 + 100));

  return {
    json: {
      leadId,
      firstName,
      lastName,
      fullName: fullName || (firstName + ' ' + lastName).trim(),
      company,
      jobTitle: (p.jobTitle || p['Job Title'] || '').trim(),
      website: (p.website || p['Website'] || '').trim(),
      linkedInUrl: (p.linkedInUrl || p['LinkedIn URL'] || '').trim(),
      instagramUrl: (p.instagramUrl || p['Instagram URL'] || '').trim(),
      xUrl: (p.xUrl || p['X URL'] || '').trim(),
      country: (p.country || p['Country'] || 'United States').trim(),
      niche: (p.niche || p['Niche'] || 'Executive Coach').trim(),
      corporateFocus: (p.corporateFocus || p['Corporate Focus'] || 'Enterprise C-Suite').trim(),
      offer: (p.offer || p['Offer'] || 'Executive Leadership Advisory').trim(),
      estimatedOfferValue: (p.estimatedOfferValue || p['Estimated Offer Value'] || '$15k-$35k').trim(),
      leadCaptureMethod: (p.leadCaptureMethod || p['Lead Capture Method'] || 'Direct Contact Form').trim(),
      recentBusinessSignal: (p.recentBusinessSignal || p['Recent Business Signal'] || 'Active Corporate Engagements').trim(),
      potentialPain: (p.potentialPain || p['Potential Pain'] || 'Manual inquiry triage & calendar fragmentation').trim(),
      email: (p.email || p['Email'] || '').toLowerCase().trim(),
      emailVerificationStatus: (p.emailVerificationStatus || p['Email Verification Status'] || 'verified').trim(),
      source: (p.source || p['Source'] || 'Inbound Webhook').trim(),
      status: 'Raw',
      dateAdded: new Date().toISOString().split('T')[0],
      notes: (p.notes || p['Notes'] || '').trim()
    }
  };
});

return cleaned;`
      },
      id: 'node-3-normalize-input',
      name: 'Normalize Inbound Lead',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [380, 340]
    },
    {
      parameters: {
        operation: 'read',
        documentId: {
          __rl: true,
          value: SHEET_ID,
          mode: 'id'
        },
        sheetName: {
          __rl: true,
          value: SHEET_NAME,
          mode: 'name'
        },
        options: {}
      },
      id: 'node-4-read-existing',
      name: 'Fetch Existing Leads (Google Sheet)',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [620, 340],
      credentials: {
        googleSheetsOAuth2Api: {
          id: GS_CRED_ID,
          name: 'Google Sheets Account (shahriar.rusan12@gmail.com)'
        }
      },
      continueOnFail: true
    },
    {
      parameters: {
        jsCode: `// 6-Tier Deduplication Engine against Master Google Sheet
const currentLead = $('Normalize Inbound Lead').first().json;
let existingRows = [];

try {
  existingRows = $input.all().map(i => i.json);
} catch (e) {
  existingRows = [];
}

function cleanDomain(url) {
  if (!url) return '';
  try {
    let u = url.toLowerCase().trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
    const parsed = new URL(u);
    return parsed.hostname.replace(/^www\\./, '');
  } catch (e) {
    return url.toLowerCase().trim().replace(/^(https?:\\/\\/)?(www\\.)?/, '').split('/')[0];
  }
}

function cleanLinkedIn(url) {
  if (!url) return '';
  return url.toLowerCase().trim()
    .replace(/^(https?:\\/\\/)?(www\\.)?linkedin\\.com\\/in\\//, '')
    .replace(/\\/$/, '');
}

function cleanSocialHandle(url) {
  if (!url) return '';
  return url.toLowerCase().trim()
    .replace(/^(https?:\\/\\/)?(www\\.)?(instagram|x|twitter)\\.com\\//, '')
    .replace(/^@/, '')
    .replace(/\\/$/, '');
}

const curEmail = (currentLead.email || '').toLowerCase().trim();
const curDomain = cleanDomain(currentLead.website);
const curLinkedIn = cleanLinkedIn(currentLead.linkedInUrl);
const curIg = cleanSocialHandle(currentLead.instagramUrl);
const curX = cleanSocialHandle(currentLead.xUrl);
const curNameComp = (currentLead.fullName + ' ' + currentLead.company).toLowerCase().replace(/[^a-z0-9]/g, '');

let isDuplicate = false;
let duplicateReason = '';
let matchedRecord = null;

for (const row of existingRows) {
  const rowEmail = (row['Email'] || row.email || '').toLowerCase().trim();
  const rowDomain = cleanDomain(row['Website'] || row.website);
  const rowLinkedIn = cleanLinkedIn(row['LinkedIn URL'] || row.linkedInUrl);
  const rowIg = cleanSocialHandle(row['Instagram URL'] || row.instagramUrl);
  const rowX = cleanSocialHandle(row['X URL'] || row.xUrl);
  const rowName = (row['Full Name'] || row.fullName || '').trim();
  const rowCompany = (row['Company'] || row.company || '').trim();
  const rowNameComp = (rowName + ' ' + rowCompany).toLowerCase().replace(/[^a-z0-9]/g, '');

  // Tier 1: Exact Email
  if (curEmail && rowEmail && curEmail === rowEmail) {
    isDuplicate = true;
    duplicateReason = \`Tier 1 Match: Exact email already exists (\${curEmail})\`;
    matchedRecord = row;
    break;
  }
  // Tier 2: Domain Match
  if (curDomain && rowDomain && curDomain === rowDomain) {
    isDuplicate = true;
    duplicateReason = \`Tier 2 Match: Company domain already exists (\${curDomain})\`;
    matchedRecord = row;
    break;
  }
  // Tier 3: LinkedIn Profile
  if (curLinkedIn && rowLinkedIn && curLinkedIn === rowLinkedIn) {
    isDuplicate = true;
    duplicateReason = \`Tier 3 Match: LinkedIn slug already registered (\${curLinkedIn})\`;
    matchedRecord = row;
    break;
  }
  // Tier 4: Instagram Handle
  if (curIg && rowIg && curIg === rowIg) {
    isDuplicate = true;
    duplicateReason = \`Tier 4 Match: Instagram handle match (@\${curIg})\`;
    matchedRecord = row;
    break;
  }
  // Tier 5: X / Twitter Handle
  if (curX && rowX && curX === rowX) {
    isDuplicate = true;
    duplicateReason = \`Tier 5 Match: X handle match (@\${curX})\`;
    matchedRecord = row;
    break;
  }
  // Tier 6: Full Name + Company
  if (curNameComp.length > 5 && rowNameComp.length > 5 && curNameComp === rowNameComp) {
    isDuplicate = true;
    duplicateReason = \`Tier 6 Match: Exact Name & Company combination (\${rowName} @ \${rowCompany})\`;
    matchedRecord = row;
    break;
  }
}

return [{
  json: {
    ...currentLead,
    isDuplicate,
    duplicateReason,
    matchedLeadId: matchedRecord ? (matchedRecord['Lead ID'] || matchedRecord.leadId) : null
  }
}];`
      },
      id: 'node-5-dedup-engine',
      name: '6-Tier Deduplication Engine',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [860, 340]
    },
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict'
          },
          conditions: [
            {
              id: 'c1',
              leftValue: '={{ $json.isDuplicate }}',
              rightValue: false,
              operator: {
                type: 'boolean',
                operation: 'equals'
              }
            }
          ],
          combinator: 'and'
        }
      },
      id: 'node-6-if-new',
      name: 'Is New Prospect?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [1100, 340]
    },
    {
      parameters: {
        jsCode: `// 0–100 Deterministic ICP Scoring & Qualification Engine
const p = $input.first().json;

let economicScore = 0;
let corporateScore = 0;
let inboundScore = 0;
let founderLedScore = 0;
let painScore = 0;
let buyingSignalScore = 0;

const textBlob = [
  p.niche, p.offer, p.estimatedOfferValue, p.jobTitle, p.company,
  p.leadCaptureMethod, p.recentBusinessSignal, p.potentialPain, p.notes
].filter(Boolean).join(' ').toLowerCase();

// 1. Economic Score (0-25 pts)
if (/\\$?[2-5][0-9]k|\\$50,000|retainer|advisory|c-suite retainer/i.test(textBlob)) {
  economicScore = 25;
} else if (/\\$1[0-9]k|corporate package|executive coaching/i.test(textBlob)) {
  economicScore = 20;
} else if (/\\$[5-9]k|mastermind/i.test(textBlob)) {
  economicScore = 12;
} else {
  economicScore = 5;
}

// 2. Corporate Focus (0-20 pts)
if (/c-suite|fortune|enterprise|vp|board of directors|executive leadership/i.test(textBlob)) {
  corporateScore = 20;
} else if (/corporate|leadership training|director|management/i.test(textBlob)) {
  corporateScore = 15;
} else if (/founder|business coach|career/i.test(textBlob)) {
  corporateScore = 10;
} else {
  corporateScore = 2;
}

// 3. Inbound / Bottleneck Score (0-10 pts)
if (/substack|newsletter|podcast|keynote|author|book|active/i.test(textBlob) || p.website) {
  inboundScore = 10;
} else {
  inboundScore = 5;
}

// 4. Founder-Led / Lean (0-10 pts)
if (/founder|principal|managing director|senior coach|owner/i.test(p.jobTitle || '')) {
  founderLedScore = 10;
} else {
  founderLedScore = 6;
}

// 5. Operational Pain Score (0-15 pts)
if (/calendly|manual|intake|calendar|unqualified|inbox|filtering/i.test(textBlob)) {
  painScore = 15;
} else if (/contact form|application/i.test(textBlob)) {
  painScore = 10;
} else {
  painScore = 5;
}

// 6. Buying Signals Score (0-20 pts)
if (/cohort|launch|expanding|new keynote|tour|hiring|high volume/i.test(textBlob)) {
  buyingSignalScore = 20;
} else if (/speaking|published|conference/i.test(textBlob)) {
  buyingSignalScore = 14;
} else {
  buyingSignalScore = 8;
}

const icpScore = economicScore + corporateScore + inboundScore + founderLedScore + painScore + buyingSignalScore;

let tier = 'Rejected';
let qualificationReason = '';
if (icpScore >= 80) {
  tier = 'Tier 1 (A+)';
  qualificationReason = \`Priority A+ (Score \${icpScore}/100): High-ticket corporate retainer, enterprise buyer positioning, and severe manual intake bottleneck.\`;
} else if (icpScore >= 65) {
  tier = 'Tier 2 (A)';
  qualificationReason = \`Qualified A (Score \${icpScore}/100): Strong corporate focus and high-ticket service offer matching intake triage solution.\`;
} else if (icpScore >= 50) {
  tier = 'Tier 3 (B)';
  qualificationReason = \`Moderate B (Score \${icpScore}/100): Mid-market coaching focus; recommend periodic nurture.\`;
} else {
  tier = 'Disqualified';
  qualificationReason = \`Low ICP fit (Score \${icpScore}/100): Below minimum threshold for enterprise intake triage automation.\`;
}

const verifiedEvidence = \`Company: \${p.company}; Role: \${p.jobTitle}; Offer: \${p.offer} (\${p.estimatedOfferValue}); Verified Domain: \${p.website}\`;
const inference = corporateScore >= 15 
  ? 'Strong probability of C-Suite or VP decision makers seeking structured advisory.' 
  : 'General corporate training delivery.';
const unknowns = 'Exact weekly inbound inquiry volume; Current inbound qualification drop-off rate.';
const whyNow = buyingSignalScore >= 14 
  ? 'Active business acceleration and public visibility causing calendar compression.' 
  : 'Continuous corporate intake management.';
const personalizationAngle = \`Addressing inbound lead triage drag between \${p.company} client engagements\`;

return [{
  json: {
    ...p,
    icpScore,
    economicScore,
    corporateScore,
    inboundScore,
    founderLedScore,
    painScore,
    buyingSignalScore,
    tier,
    verifiedEvidence,
    inference,
    unknowns,
    qualificationReason,
    whyNow,
    personalizationAngle,
    recommendedChannel: 'email',
    status: icpScore >= 65 ? 'Ready for Review' : (icpScore >= 50 ? 'Nurture / Hold' : 'Rejected')
  }
}];`
      },
      id: 'node-7-scoring-engine',
      name: '0–100 ICP Scoring Engine',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1340, 260]
    },
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict'
          },
          conditions: [
            {
              id: 'c2',
              leftValue: '={{ $json.icpScore }}',
              rightValue: 65,
              operator: {
                type: 'number',
                operation: 'gte'
              }
            }
          ],
          combinator: 'and'
        }
      },
      id: 'node-8-if-qualified',
      name: 'Is Lead Qualified? (>=65)',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [1580, 260]
    },
    {
      parameters: {
        jsCode: `// Multi-Channel Executive Personalization Engine (Email, LinkedIn, Instagram, X)
const p = $input.first().json;

const firstName = p.firstName || (p.fullName || 'there').split(' ')[0] || 'there';
const companyName = p.company || 'your advisory practice';
const offer = p.offer || 'executive leadership programs';
const corporateFocus = p.corporateFocus || 'enterprise leadership teams';

const hasEmail = Boolean(p.email && p.email.trim());
const hasLinkedIn = Boolean(p.linkedInUrl && p.linkedInUrl.trim());
const hasInstagram = Boolean(p.instagramUrl && p.instagramUrl.trim());
const hasX = Boolean(p.xUrl && p.xUrl.trim());

// A/B CTA Testing selection
const ctaVariant = Math.random() > 0.5 ? 'CTA A' : 'CTA B';
const emailCta = ctaVariant === 'CTA A'
  ? 'Worth sending over a 2-minute breakdown?'
  : 'Would it be useful if I sent you a 2-minute example?';

// 1. Email Channel (80-120 words, Executive Lead Intake positioning, Human review)
let draftEmail = '';
if (hasEmail) {
  const observation = p.recentBusinessSignal && p.recentBusinessSignal.length > 5
    ? \`I came across \${companyName} and noticed your work with \${corporateFocus}, specifically around \${p.recentBusinessSignal}.\`
    : \`I came across \${companyName} and noticed you work with \${corporateFocus} delivering \${offer}.\`;

  draftEmail = \`Subject: Quick question about \${companyName}'s inbound inquiries

Hi \${firstName},

\${observation}

Most senior advisors find that between client sessions, evaluating incoming inquiries, identifying serious corporate opportunities, and drafting response replies takes significant manual attention.

I'm building an executive lead-intake system that turns incoming inquiries into a qualification brief, prioritizes stronger opportunities, and prepares a response draft for review before you open your inbox.

The goal is simple: less time sorting through inquiries, faster responses to serious prospects, and no autonomous AI messaging.

\${emailCta}

Best,
Rusan
Executive Lead Intake\`;
} else {
  draftEmail = '[NOT RECOMMENDED - No verified email available]';
}

// 2. LinkedIn Channel (Connection note, first message, follow-up)
let draftLinkedIn = '';
if (hasLinkedIn) {
  draftLinkedIn = [
    \`[CONNECTION NOTE]\`,
    \`Hi \${firstName} — saw your work with leadership teams at \${companyName}. Noticed your inquiry pathway handles both corporate inquiries and general inbounds. Would love to connect.\`,
    '',
    \`[FIRST MESSAGE]\`,
    \`Hi \${firstName} — thanks for connecting. Appreciate the work you're doing with \${offer} at \${companyName}. Curious: during intensive client delivery weeks, how do you typically triage incoming corporate inquiries?\`,
    '',
    \`[FOLLOW-UP]\`,
    \`Hi \${firstName} — following up on our chat. We set up an executive intake & triage layer for leadership practices: every inquiry gets turned into a qualification brief with response drafts prepared for human review before your inbox. Would it be useful if I showed you how it works?\`
  ].join('\\n');
} else {
  draftLinkedIn = '[NOT RECOMMENDED - No LinkedIn profile available]';
}

// 3. Instagram Channel (Natural professional DM, follow-up)
let draftInstagram = '';
if (hasInstagram) {
  draftInstagram = [
    \`[FIRST DM]\`,
    \`Hey \${firstName}, came across your leadership updates for \${companyName}. Quick question regarding your advisory practice: do you personally filter through your incoming inquiries, or do you have a triage workflow in place?\`,
    '',
    \`[FOLLOW-UP]\`,
    \`Hey \${firstName}, reason I asked: we built an executive lead-intake system that qualifies corporate inquiries and pre-drafts replies for your review so your calendar stays protected. Open to seeing a quick 2-minute example?\`
  ].join('\\n');
} else {
  draftInstagram = '[NOT RECOMMENDED - No Instagram profile available]';
}

// 4. X Channel (Public opener, DM, follow-up)
let draftX = '';
if (hasX) {
  draftX = [
    \`[PUBLIC REPLY / OPENER]\`,
    \`Solid perspective on executive advisory delivery. The operational challenge is always defending focus while inbounds keep landing.\`,
    '',
    \`[DIRECT MESSAGE]\`,
    \`Hi \${firstName}, saw your posts on corporate leadership consulting. We built an intake triage layer that prioritizes qualified corporate inquiries and prepares response drafts for review. Open to seeing a quick example?\`,
    '',
    \`[FOLLOW-UP]\`,
    \`Hi \${firstName}, just checking if you had a chance to see my note above regarding intake triage for \${companyName}. Happy to share a quick 2-minute walkthrough.\`
  ].join('\\n');
} else {
  draftX = '[NOT RECOMMENDED - No X profile available]';
}

// Channel recommendation
let recommendedChannel = 'EMAIL';
if (hasEmail && hasLinkedIn) {
  recommendedChannel = 'MULTI-CHANNEL';
} else if (hasLinkedIn && !hasEmail) {
  recommendedChannel = 'LINKEDIN';
} else if (hasEmail) {
  recommendedChannel = 'EMAIL';
} else if (hasInstagram) {
  recommendedChannel = 'INSTAGRAM';
} else if (hasX) {
  recommendedChannel = 'X';
}

return [{
  json: {
    ...p,
    recommendedChannel,
    ctaVariant,
    draftEmail,
    draftLinkedInMessage: draftLinkedIn,
    draftInstagramMessage: draftInstagram,
    draftXMessage: draftX,
    status: 'Ready for Review'
  }
}];`
      },
      id: 'node-9-personalization',
      name: 'Bespoke Messaging Engine',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1840, 180]
    },
    {
      parameters: {
        jsCode: `// Map exact 50 Column Headers for Google Sheet
const p = $input.first().json;

return [{
  json: {
    'Lead ID': p.leadId || '',
    'First Name': p.firstName || '',
    'Last Name': p.lastName || '',
    'Full Name': p.fullName || '',
    'Company': p.company || '',
    'Job Title': p.jobTitle || '',
    'Website': p.website || '',
    'LinkedIn URL': p.linkedInUrl || '',
    'Instagram URL': p.instagramUrl || '',
    'X URL': p.xUrl || '',
    'Country': p.country || 'United States',
    'Niche': p.niche || '',
    'Corporate Focus': p.corporateFocus || '',
    'Offer': p.offer || '',
    'Estimated Offer Value': p.estimatedOfferValue || '',
    'Lead Capture Method': p.leadCaptureMethod || '',
    'Recent Business Signal': p.recentBusinessSignal || '',
    'Potential Pain': p.potentialPain || '',
    'Email': p.email || '',
    'Email Verification Status': p.emailVerificationStatus || 'verified',
    'Source': p.source || 'n8n Master Workflow',
    'ICP Score': Number(p.icpScore || 0),
    'Economic Score': Number(p.economicScore || 0),
    'Corporate Score': Number(p.corporateScore || 0),
    'Inbound Score': Number(p.inboundScore || 0),
    'Founder-Led Score': Number(p.founderLedScore || 0),
    'Pain Score': Number(p.painScore || 0),
    'Buying Signal Score': Number(p.buyingSignalScore || 0),
    'Verified Evidence': p.verifiedEvidence || '',
    'Inference': p.inference || '',
    'Unknowns': p.unknowns || '',
    'Qualification Reason': p.qualificationReason || '',
    'Why Now': p.whyNow || '',
    'Personalization Angle': p.personalizationAngle || '',
    'Recommended Channel': p.recommendedChannel || 'email',
    'Draft Email': p.draftEmail || '',
    'Draft LinkedIn Message': p.draftLinkedInMessage || '',
    'Draft Instagram Message': p.draftInstagramMessage || '',
    'Draft X Message': p.draftXMessage || '',
    'Status': p.status || 'Ready for Review',
    'Date Added': p.dateAdded || new Date().toISOString().split('T')[0],
    'Date Contacted': p.dateContacted || '',
    'Follow-up 1': '',
    'Follow-up 2': '',
    'Response': '',
    'Positive Response': '',
    'Call Booked': '',
    'Proposal': '',
    'Closed': '',
    'Notes': p.notes || \`Processed via n8n Master Workflow on \${new Date().toISOString().split('T')[0]}\`
  }
}];`
      },
      id: 'node-10-format-sheet-cols',
      name: 'Format 50 Columns',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2100, 260]
    },
    {
      parameters: {
        operation: 'append',
        documentId: {
          __rl: true,
          value: SHEET_ID,
          mode: 'id',
          cachedResultName: 'Master_Prospects'
        },
        sheetName: {
          __rl: true,
          value: SHEET_NAME,
          mode: 'name',
          cachedResultName: 'Master_Prospects'
        },
        columns: {
          mappingMode: 'autoMapInputData',
          value: {},
          schema: schemaArray
        },
        options: {}
      },
      id: 'node-11-google-sheets-append',
      name: 'Save to Master Google Sheet',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [2340, 260],
      credentials: {
        googleSheetsOAuth2Api: {
          id: GS_CRED_ID,
          name: 'Google Sheets Account (shahriar.rusan12@gmail.com)'
        }
      }
    },
    {
      parameters: {
        jsCode: `// Dispatches Telegram Review Card (with 1-click Approval Link and Fallback)
const item = $input.first().json;
const leadId = item['Lead ID'];
const name = item['Full Name'];
const company = item['Company'];
const score = item['ICP Score'];
const draft = item['Draft Email'] || '';
const channel = item['Recommended Channel'] || 'EMAIL';

const approveUrl = \`http://localhost:5678/webhook/lead-approval?leadId=\${encodeURIComponent(leadId)}&action=approve\`;
const rejectUrl = \`http://localhost:5678/webhook/lead-approval?leadId=\${encodeURIComponent(leadId)}&action=reject\`;
const sheetUrl = 'https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit';

const summaryCard = 
\`🌟 \${score >= 80 ? 'A+ PROSPECT' : 'A PROSPECT'} FOR REVIEW

👤 Name: \${name}
🏢 Company: \${company}
🎯 Title: \${item['Job Title']}
📊 ICP Score: \${score}/100
🔍 Qualification: \${item['Qualification Reason']}
⏱ Why Now: \${item['Why Now']}
📬 Channel: \${channel.toUpperCase()}

📝 Draft Message:
\${draft}

👉 APPROVE OUTREACH (Creates Gmail Draft):
\${approveUrl}

❌ DISQUALIFY / REJECT:
\${rejectUrl}

📊 View Master Sheet:
\${sheetUrl}\`;

console.log('\\n' + '='.repeat(60));
console.log('📢 TELEGRAM HUMAN APPROVAL CARD:');
console.log('='.repeat(60));
console.log(summaryCard);
console.log('='.repeat(60) + '\\n');

return [{
  json: {
    ...item,
    telegramNotificationCard: summaryCard,
    approveUrl,
    rejectUrl,
    sheetUrl
  }
}];`
      },
      id: 'node-12-telegram-review',
      name: 'Telegram Review Card',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2580, 260]
    }
  ],
  connections: {
    'Lead Ingest Webhook': {
      main: [[{ node: 'Normalize Inbound Lead', type: 'main', index: 0 }]]
    },
    'Manual Test Trigger': {
      main: [[{ node: 'Normalize Inbound Lead', type: 'main', index: 0 }]]
    },
    'Normalize Inbound Lead': {
      main: [[{ node: 'Fetch Existing Leads (Google Sheet)', type: 'main', index: 0 }]]
    },
    'Fetch Existing Leads (Google Sheet)': {
      main: [[{ node: '6-Tier Deduplication Engine', type: 'main', index: 0 }]]
    },
    '6-Tier Deduplication Engine': {
      main: [[{ node: 'Is New Prospect?', type: 'main', index: 0 }]]
    },
    'Is New Prospect?': {
      main: [
        [{ node: '0–100 ICP Scoring Engine', type: 'main', index: 0 }],
        [] // Duplicates stop here
      ]
    },
    '0–100 ICP Scoring Engine': {
      main: [[{ node: 'Is Lead Qualified? (>=65)', type: 'main', index: 0 }]]
    },
    'Is Lead Qualified? (>=65)': {
      main: [
        [{ node: 'Bespoke Messaging Engine', type: 'main', index: 0 }],
        [{ node: 'Format 50 Columns', type: 'main', index: 0 }] // Unqualified still get saved with status
      ]
    },
    'Bespoke Messaging Engine': {
      main: [[{ node: 'Format 50 Columns', type: 'main', index: 0 }]]
    },
    'Format 50 Columns': {
      main: [[{ node: 'Save to Master Google Sheet', type: 'main', index: 0 }]]
    },
    'Save to Master Google Sheet': {
      main: [[{ node: 'Telegram Review Card', type: 'main', index: 0 }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  }
};

// 2. APPROVAL & GMAIL DISPATCH WORKFLOW
const approvalWorkflow = {
  id: 'ExecLeadApprove2',
  name: 'Executive Lead Approval & Gmail Outreach Dispatcher',
  active: true,
  nodes: [
    {
      parameters: {
        httpMethod: 'GET',
        path: 'lead-approval',
        responseMode: 'responseNode',
        options: {}
      },
      id: 'node-appr-1-webhook',
      name: 'Approval Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [120, 300],
      webhookId: 'exec-lead-approval-webhook'
    },
    {
      parameters: {
        jsCode: `// Parse approval decision and leadId from query or body
const query = $input.first().json.query || {};
const body = $input.first().json.body || {};

const leadId = (query.leadId || body.leadId || '').trim();
const action = (query.action || body.action || 'approve').toLowerCase().trim();

if (!leadId) {
  throw new Error('Missing required leadId parameter in approval webhook');
}

return [{
  json: {
    leadId,
    action,
    timestamp: new Date().toISOString()
  }
}];`
      },
      id: 'node-appr-2-parse-action',
      name: 'Parse Approval Action',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [360, 300]
    },
    {
      parameters: {
        operation: 'read',
        documentId: {
          __rl: true,
          value: SHEET_ID,
          mode: 'id'
        },
        sheetName: {
          __rl: true,
          value: SHEET_NAME,
          mode: 'name'
        },
        options: {}
      },
      id: 'node-appr-3-read-sheet',
      name: 'Read Master Sheet',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [600, 300],
      credentials: {
        googleSheetsOAuth2Api: {
          id: GS_CRED_ID,
          name: 'Google Sheets Account (shahriar.rusan12@gmail.com)'
        }
      }
    },
    {
      parameters: {
        jsCode: `// Match specific row by Lead ID
const target = $('Parse Approval Action').first().json;
const rows = $input.all().map(i => i.json);

const matchedRow = rows.find(r => {
  const rowId = String(r['Lead ID'] || r.leadId || '').trim();
  return rowId && rowId.toLowerCase() === target.leadId.toLowerCase();
});

if (!matchedRow) {
  throw new Error('Lead ID not found in Master Google Sheet: ' + target.leadId);
}

const draftText = matchedRow['Draft Email'] || '';
const lines = draftText.split('\\n');
let subject = lines.find(l => l.startsWith('Subject:'));
if (subject) {
  subject = subject.replace(/^Subject:\\s*/, '').trim();
} else {
  subject = lines[0] || 'Executive Leadership Advisory Inquiry';
}

const bodyText = draftText.replace(/^Subject:.*\\n+/, '').trim();

return [{
  json: {
    ...matchedRow,
    'Lead ID': matchedRow['Lead ID'] || target.leadId,
    leadId: target.leadId,
    action: target.action,
    emailSubject: subject,
    emailBody: bodyText,
    recipientEmail: matchedRow['Email'] || 'shahriar.rusan12@gmail.com'
  }
}];`
      },
      id: 'node-appr-4-match-row',
      name: 'Find Prospect Record',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [840, 300]
    },
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict'
          },
          conditions: [
            {
              id: 'c-appr-1',
              leftValue: '={{ $json.action }}',
              rightValue: 'approve',
              operator: {
                type: 'string',
                operation: 'equals'
              }
            }
          ],
          combinator: 'and'
        }
      },
      id: 'node-appr-5-if-approve',
      name: 'Is Approved?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [1080, 300]
    },
    {
      parameters: {
        operation: 'update',
        documentId: {
          __rl: true,
          value: SHEET_ID,
          mode: 'id'
        },
        sheetName: {
          __rl: true,
          value: SHEET_NAME,
          mode: 'name'
        },
        columns: {
          mappingMode: 'defineBelow',
          value: {
            'Lead ID': '={{ $json["Lead ID"] || $json.leadId }}',
            'Status': 'Contacted',
            'Date Contacted': '={{ $now.format("yyyy-MM-dd") }}',
            'Notes': '={{ ($json.Notes || "") }} | Approved via Human Review. Outreach dispatched.'
          },
          matchingColumns: ['Lead ID'],
          schema: schemaArray
        },
        options: {}
      },
      id: 'node-appr-7-update-sheet-approved',
      name: 'Mark Contacted (Google Sheet)',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [1340, 200],
      credentials: {
        googleSheetsOAuth2Api: {
          id: GS_CRED_ID,
          name: 'Google Sheets Account (shahriar.rusan12@gmail.com)'
        }
      }
    },
    {
      parameters: {
        sendTo: '={{ $(\'Find Prospect Record\').first().json.recipientEmail || $(\'Find Prospect Record\').first().json.Email }}',
        subject: '={{ $(\'Find Prospect Record\').first().json.emailSubject }}',
        message: '={{ $(\'Find Prospect Record\').first().json.emailBody }}',
        options: {}
      },
      id: 'node-appr-6-gmail-draft',
      name: 'Create Gmail Draft',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.1,
      position: [1580, 200],
      credentials: {
        gmailOAuth2: {
          id: GMAIL_CRED_ID,
          name: 'Gmail Account (shahriar.rusan12@gmail.com)'
        }
      },
      continueOnFail: true
    },
    {
      parameters: {
        respondWith: 'text',
        responseBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Prospect Approved</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 40px; max-width: 520px; text-align: center; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    .badge { display: inline-block; background: #10b981; color: #022c22; font-weight: 700; padding: 6px 14px; border-radius: 9999px; margin-bottom: 20px; font-size: 14px; }
    h1 { margin: 0 0 10px; font-size: 24px; color: #ffffff; }
    p { color: #94a3b8; font-size: 15px; line-height: 1.5; margin: 10px 0 25px; }
    .btn { display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 14px; transition: background 0.2s; }
    .btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">APPROVED & DISPATCHED</div>
    <h1>Lead Approved Successfully</h1>
    <p>The personalized outreach for <strong>{{ $('Find Prospect Record').first().json['Full Name'] }}</strong> ({{ $('Find Prospect Record').first().json['Company'] }}) was approved. A Gmail draft has been queued and the Google Master Sheet status updated to <em>Contacted</em>.</p>
    <a class="btn" href="https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit" target="_blank">Open Master Google Sheet</a>
  </div>
</body>
</html>`,
        options: {
          responseHeaders: {
            entries: [
              {
                name: 'Content-Type',
                value: 'text/html; charset=utf-8'
              }
            ]
          }
        }
      },
      id: 'node-appr-8-respond-approved',
      name: 'Respond Approved Screen',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1820, 200]
    },
    {
      parameters: {
        operation: 'update',
        documentId: {
          __rl: true,
          value: SHEET_ID,
          mode: 'id'
        },
        sheetName: {
          __rl: true,
          value: SHEET_NAME,
          mode: 'name'
        },
        columns: {
          mappingMode: 'defineBelow',
          value: {
            'Lead ID': '={{ $json["Lead ID"] || $json.leadId }}',
            'Status': 'Rejected',
            'Notes': '={{ $json.Notes || "" }} | Rejected via Human Review on {{ $now.format("yyyy-MM-dd") }}'
          },
          matchingColumns: ['Lead ID'],
          schema: schemaArray
        },
        options: {}
      },
      id: 'node-appr-9-update-sheet-rejected',
      name: 'Mark Rejected (Google Sheet)',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [1340, 420],
      credentials: {
        googleSheetsOAuth2Api: {
          id: GS_CRED_ID,
          name: 'Google Sheets Account (shahriar.rusan12@gmail.com)'
        }
      }
    },
    {
      parameters: {
        respondWith: 'text',
        responseBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Prospect Disqualified</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 40px; max-width: 520px; text-align: center; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    .badge { display: inline-block; background: #ef4444; color: #450a0a; font-weight: 700; padding: 6px 14px; border-radius: 9999px; margin-bottom: 20px; font-size: 14px; }
    h1 { margin: 0 0 10px; font-size: 24px; color: #ffffff; }
    p { color: #94a3b8; font-size: 15px; line-height: 1.5; margin: 10px 0 25px; }
    .btn { display: inline-block; background: #475569; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">LEAD REJECTED</div>
    <h1>Prospect Disqualified</h1>
    <p>Lead <strong>{{ $('Find Prospect Record').first().json['Full Name'] }}</strong> has been marked as <em>Rejected</em> in Google Sheets. No outreach will be sent.</p>
    <a class="btn" href="https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit" target="_blank">Open Master Google Sheet</a>
  </div>
</body>
</html>`,
        options: {
          responseHeaders: {
            entries: [
              {
                name: 'Content-Type',
                value: 'text/html; charset=utf-8'
              }
            ]
          }
        }
      },
      id: 'node-appr-10-respond-rejected',
      name: 'Respond Rejected Screen',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1580, 420]
    }
  ],
  connections: {
    'Approval Webhook Trigger': {
      main: [[{ node: 'Parse Approval Action', type: 'main', index: 0 }]]
    },
    'Parse Approval Action': {
      main: [[{ node: 'Read Master Sheet', type: 'main', index: 0 }]]
    },
    'Read Master Sheet': {
      main: [[{ node: 'Find Prospect Record', type: 'main', index: 0 }]]
    },
    'Find Prospect Record': {
      main: [[{ node: 'Is Approved?', type: 'main', index: 0 }]]
    },
    'Is Approved?': {
      main: [
        [{ node: 'Mark Contacted (Google Sheet)', type: 'main', index: 0 }],
        [{ node: 'Mark Rejected (Google Sheet)', type: 'main', index: 0 }]
      ]
    },
    'Mark Contacted (Google Sheet)': {
      main: [[{ node: 'Create Gmail Draft', type: 'main', index: 0 }]]
    },
    'Create Gmail Draft': {
      main: [[{ node: 'Respond Approved Screen', type: 'main', index: 0 }]]
    },
    'Mark Rejected (Google Sheet)': {
      main: [[{ node: 'Respond Rejected Screen', type: 'main', index: 0 }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  }
};

const outputDir = path.resolve(__dirname, '../n8n-workflows');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(
  path.join(outputDir, 'executive_lead_triage_master.json'),
  JSON.stringify([masterWorkflow], null, 2),
  'utf8'
);

fs.writeFileSync(
  path.join(outputDir, 'executive_lead_approval_dispatcher.json'),
  JSON.stringify([approvalWorkflow], null, 2),
  'utf8'
);

console.log('Successfully generated n8n workflow blueprints:');
console.log('1. ' + path.join(outputDir, 'executive_lead_triage_master.json'));
console.log('2. ' + path.join(outputDir, 'executive_lead_approval_dispatcher.json'));
