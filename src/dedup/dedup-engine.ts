import { ProspectMasterRecord, RawLeadInput } from '../types';

export class DeduplicationEngine {
  /**
   * Normalizes an email address for consistent comparison
   */
  public static normalizeEmail(email?: string): string {
    if (!email) return '';
    return email.trim().toLowerCase();
  }

  /**
   * Extracts clean canonical domain from any URL
   */
  public static extractDomain(url?: string): string {
    if (!url) return '';
    try {
      let cleanUrl = url.trim().toLowerCase();
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
      }
      const parsed = new URL(cleanUrl);
      let hostname = parsed.hostname;
      if (hostname.startsWith('www.')) {
        hostname = hostname.slice(4);
      }
      return hostname;
    } catch {
      return url.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].trim();
    }
  }

  /**
   * Normalizes LinkedIn profile URL or handle
   */
  public static normalizeLinkedIn(url?: string): string {
    if (!url) return '';
    let clean = url.trim().toLowerCase().split('?')[0].replace(/\/+$/, '');
    const match = clean.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : clean;
  }

  /**
   * Normalizes Instagram URL or handle
   */
  public static normalizeInstagram(urlOrHandle?: string): string {
    if (!urlOrHandle) return '';
    let clean = urlOrHandle.trim().toLowerCase().replace('@', '').split('?')[0].replace(/\/+$/, '');
    const match = clean.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/);
    return match ? match[1] : clean;
  }

  /**
   * Normalizes X/Twitter URL or handle
   */
  public static normalizeX(urlOrHandle?: string): string {
    if (!urlOrHandle) return '';
    let clean = urlOrHandle.trim().toLowerCase().replace('@', '').split('?')[0].replace(/\/+$/, '');
    const match = clean.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : clean;
  }

  /**
   * Normalizes Name + Company key
   */
  public static normalizeNameAndCompany(name?: string, company?: string): string {
    const cleanName = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanCo = (company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanName) return '';
    return `${cleanName}__${cleanCo}`;
  }

  /**
   * Finds if a raw lead matches any existing master record according to the strict 6-tier hierarchy:
   * Tier 1: Email
   * Tier 2: Website Domain
   * Tier 3: LinkedIn Profile
   * Tier 4: Instagram Handle
   * Tier 5: X Handle
   * Tier 6: Name + Company
   */
  public static findDuplicate(
    candidate: RawLeadInput | ProspectMasterRecord,
    existingPool: ProspectMasterRecord[]
  ): { isDuplicate: boolean; matchedRecord?: ProspectMasterRecord; tier?: string } {
    const candidateEmail = this.normalizeEmail(candidate.email);
    const candidateDomain = this.extractDomain(candidate.website);
    const candidateLinkedIn = this.normalizeLinkedIn(candidate.linkedInUrl);
    const candidateInstagram = this.normalizeInstagram(candidate.instagramUrl);
    const candidateX = this.normalizeX(candidate.xUrl);
    const candidateNameCo = this.normalizeNameAndCompany(
      candidate.fullName || `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim(),
      candidate.company
    );

    for (const record of existingPool) {
      // Tier 1: Email match
      if (candidateEmail && this.normalizeEmail(record.email) === candidateEmail) {
        return { isDuplicate: true, matchedRecord: record, tier: 'Tier 1 (Email)' };
      }

      // Tier 2: Domain match (ignoring generic domains like gmail, linkedin, linktr.ee)
      const genericDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'linktr.ee', 'linkedin.com'];
      const recordDomain = this.extractDomain(record.website);
      if (candidateDomain && recordDomain && !genericDomains.includes(candidateDomain) && candidateDomain === recordDomain) {
        return { isDuplicate: true, matchedRecord: record, tier: 'Tier 2 (Domain)' };
      }

      // Tier 3: LinkedIn URL match
      const recordLinkedIn = this.normalizeLinkedIn(record.linkedInUrl);
      if (candidateLinkedIn && recordLinkedIn && candidateLinkedIn === recordLinkedIn) {
        return { isDuplicate: true, matchedRecord: record, tier: 'Tier 3 (LinkedIn)' };
      }

      // Tier 4: Instagram handle match
      const recordInstagram = this.normalizeInstagram(record.instagramUrl);
      if (candidateInstagram && recordInstagram && candidateInstagram === recordInstagram) {
        return { isDuplicate: true, matchedRecord: record, tier: 'Tier 4 (Instagram)' };
      }

      // Tier 5: X handle match
      const recordX = this.normalizeX(record.xUrl);
      if (candidateX && recordX && candidateX === recordX) {
        return { isDuplicate: true, matchedRecord: record, tier: 'Tier 5 (X)' };
      }

      // Tier 6: Name + Company match
      const recordNameCo = this.normalizeNameAndCompany(record.fullName, record.company);
      if (candidateNameCo && recordNameCo && candidateNameCo === recordNameCo) {
        return { isDuplicate: true, matchedRecord: record, tier: 'Tier 6 (Name + Company)' };
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Merges incoming raw candidate info into a canonical record
   */
  public static mergeIntoCanonical(
    canonical: ProspectMasterRecord,
    incoming: RawLeadInput
  ): ProspectMasterRecord {
    const updated = { ...canonical };

    // Fill in blanks without overwriting verified data
    if (!updated.email && incoming.email) updated.email = incoming.email.trim();
    if (!updated.website && incoming.website) updated.website = incoming.website.trim();
    if (!updated.linkedInUrl && incoming.linkedInUrl) updated.linkedInUrl = incoming.linkedInUrl.trim();
    if (!updated.instagramUrl && incoming.instagramUrl) updated.instagramUrl = incoming.instagramUrl.trim();
    if (!updated.xUrl && incoming.xUrl) updated.xUrl = incoming.xUrl.trim();
    if (!updated.company && incoming.company) updated.company = incoming.company.trim();
    if (!updated.jobTitle && incoming.jobTitle) updated.jobTitle = incoming.jobTitle.trim();
    if (!updated.country && incoming.country) updated.country = incoming.country.trim();

    // Append notes if incoming has extra snippet info
    if (incoming.snippet && !updated.notes.includes(incoming.snippet.slice(0, 40))) {
      updated.notes = updated.notes ? `${updated.notes} | Snippet: ${incoming.snippet}` : `Snippet: ${incoming.snippet}`;
    }

    return updated;
  }
}
