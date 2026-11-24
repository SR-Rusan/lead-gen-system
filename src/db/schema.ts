import { ProspectMasterRecord } from '../types';

export const MASTER_SHEET_COLUMNS: Array<{ key: keyof ProspectMasterRecord; header: string; width?: number }> = [
  { key: 'leadId', header: 'Lead ID', width: 120 },
  { key: 'firstName', header: 'First Name', width: 120 },
  { key: 'lastName', header: 'Last Name', width: 120 },
  { key: 'fullName', header: 'Full Name', width: 160 },
  { key: 'company', header: 'Company', width: 180 },
  { key: 'jobTitle', header: 'Job Title', width: 180 },
  { key: 'website', header: 'Website', width: 200 },
  { key: 'linkedInUrl', header: 'LinkedIn URL', width: 220 },
  { key: 'instagramUrl', header: 'Instagram URL', width: 200 },
  { key: 'xUrl', header: 'X URL', width: 180 },
  { key: 'country', header: 'Country', width: 110 },
  { key: 'niche', header: 'Niche', width: 180 },
  { key: 'corporateFocus', header: 'Corporate Focus', width: 160 },
  { key: 'offer', header: 'Offer', width: 220 },
  { key: 'estimatedOfferValue', header: 'Estimated Offer Value', width: 140 },
  { key: 'leadCaptureMethod', header: 'Lead Capture Method', width: 180 },
  { key: 'recentBusinessSignal', header: 'Recent Business Signal', width: 220 },
  { key: 'potentialPain', header: 'Potential Pain', width: 220 },
  { key: 'email', header: 'Email', width: 220 },
  { key: 'emailVerificationStatus', header: 'Email Verification Status', width: 140 },
  { key: 'source', header: 'Source', width: 100 },
  { key: 'icpScore', header: 'ICP Score', width: 90 },
  { key: 'economicScore', header: 'Economic Score', width: 100 },
  { key: 'corporateScore', header: 'Corporate Score', width: 100 },
  { key: 'inboundScore', header: 'Inbound Score', width: 100 },
  { key: 'founderLedScore', header: 'Founder-Led Score', width: 110 },
  { key: 'painScore', header: 'Pain Score', width: 90 },
  { key: 'buyingSignalScore', header: 'Buying Signal Score', width: 120 },
  { key: 'verifiedEvidence', header: 'Verified Evidence', width: 300 },
  { key: 'inference', header: 'Inference', width: 250 },
  { key: 'unknowns', header: 'Unknowns', width: 200 },
  { key: 'qualificationReason', header: 'Qualification Reason', width: 250 },
  { key: 'whyNow', header: 'Why Now', width: 250 },
  { key: 'personalizationAngle', header: 'Personalization Angle', width: 280 },
  { key: 'recommendedChannel', header: 'Recommended Channel', width: 130 },
  { key: 'draftEmail', header: 'Draft Email', width: 350 },
  { key: 'draftLinkedInMessage', header: 'Draft LinkedIn Message', width: 300 },
  { key: 'draftInstagramMessage', header: 'Draft Instagram Message', width: 280 },
  { key: 'draftXMessage', header: 'Draft X Message', width: 280 },
  { key: 'status', header: 'Status', width: 130 },
  { key: 'dateAdded', header: 'Date Added', width: 110 },
  { key: 'dateContacted', header: 'Date Contacted', width: 110 },
  { key: 'followUp1', header: 'Follow-up 1', width: 110 },
  { key: 'followUp2', header: 'Follow-up 2', width: 110 },
  { key: 'response', header: 'Response', width: 90 },
  { key: 'positiveResponse', header: 'Positive Response', width: 110 },
  { key: 'callBooked', header: 'Call Booked', width: 100 },
  { key: 'proposal', header: 'Proposal', width: 90 },
  { key: 'closed', header: 'Closed', width: 90 },
  { key: 'notes', header: 'Notes', width: 200 },
];

export const MASTER_SHEET_HEADERS = MASTER_SHEET_COLUMNS.map((c) => c.header);

export function recordToRow(record: ProspectMasterRecord): (string | number)[] {
  return MASTER_SHEET_COLUMNS.map((col) => {
    const val = record[col.key];
    if (val === undefined || val === null) return '';
    return Array.isArray(val) ? val.join(', ') : val;
  });
}

export function rowToRecord(row: (string | number)[]): Partial<ProspectMasterRecord> {
  const record: any = {};
  MASTER_SHEET_COLUMNS.forEach((col, idx) => {
    const rawVal = row[idx];
    if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
      if (['icpScore', 'economicScore', 'corporateScore', 'inboundScore', 'founderLedScore', 'painScore', 'buyingSignalScore'].includes(col.key)) {
        record[col.key] = Number(rawVal) || 0;
      } else {
        record[col.key] = String(rawVal);
      }
    } else {
      if (['icpScore', 'economicScore', 'corporateScore', 'inboundScore', 'founderLedScore', 'painScore', 'buyingSignalScore'].includes(col.key)) {
        record[col.key] = 0;
      } else {
        record[col.key] = '';
      }
    }
  });
  return record as ProspectMasterRecord;
}

export function generateCsvTemplate(): string {
  const headerLine = MASTER_SHEET_HEADERS.map((h) => `"${h.replace(/"/g, '""')}"`).join(',');
  return headerLine + '\n';
}
