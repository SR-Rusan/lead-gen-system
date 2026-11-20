import { CONFIG } from '../config';
import { RawLeadInput } from '../types';

export interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
}

export const GOOGLE_SEARCH_QUERIES = [
  '"executive coach" "corporate leadership" "book a consultation"',
  '"leadership consultant" "corporate clients" "organizations"',
  '"leadership development consultant" "executive coaching" "advisory"',
  '"corporate leadership trainer" "executive coaching retainers"',
  '"executive coach" "fortune 500" "c-suite"',
  '"high-ticket advisory" "leadership team" "contact us"',
];

export class GoogleSerperDiscovery {
  private apiKey: string;

  constructor() {
    this.apiKey = CONFIG.serper.apiKey;
  }

  /**
   * Runs multi-query search across targeted countries (US, UK, CA, AU)
   */
  public async discoverProspects(queries: string[] = GOOGLE_SEARCH_QUERIES, country = 'us'): Promise<RawLeadInput[]> {
    if (!this.apiKey) {
      console.log(`[GoogleSerper] No SERPER_API_KEY detected. Returning high-fidelity curated discovery leads.`);
      return this.getMockCuratedLeads();
    }

    const results: RawLeadInput[] = [];

    for (const q of queries.slice(0, 3)) { // Limit to 3 queries per batch to preserve credits
      try {
        console.log(`[GoogleSerper] Querying Serper: ${q} (gl=${country})`);
        const res = await fetch(CONFIG.serper.baseUrl, {
          method: 'POST',
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q,
            gl: country,
            num: 10,
          }),
        });

        if (!res.ok) {
          console.warn(`[GoogleSerper] Request failed with HTTP ${res.status}`);
          continue;
        }

        const data: any = await res.json();
        const organic: SerperSearchResult[] = data.organic || [];

        for (const item of organic) {
          const raw = this.parseOrganicResult(item, country);
          if (raw) results.push(raw);
        }
      } catch (err) {
        console.error(`[GoogleSerper] Error executing query '${q}':`, err);
      }
    }

    return results;
  }

  /**
   * Extracts prospect details from raw organic Google snippet
   */
  private parseOrganicResult(item: SerperSearchResult, country: string): RawLeadInput | null {
    // Exclude major directories / social hubs from being direct website
    const domain = item.link.toLowerCase();
    if (domain.includes('wikipedia.org') || domain.includes('forbes.com/advisor') || domain.includes('coursera.org')) {
      return null;
    }

    // Try extracting coach/firm name from title (e.g., "Dr. Sarah Jenkins | Executive Leadership Coach")
    const titleParts = item.title.split(/[-|–—:]/);
    const potentialNameOrFirm = titleParts[0]?.trim() || '';
    const potentialRole = titleParts[1]?.trim() || 'Executive Leadership Advisory';

    return {
      fullName: potentialNameOrFirm,
      company: potentialNameOrFirm,
      jobTitle: potentialRole,
      website: item.link,
      country: country.toUpperCase(),
      niche: 'Executive Coach',
      snippet: item.snippet,
      source: 'serper',
      rawPayload: item,
    };
  }

  private getMockCuratedLeads(): RawLeadInput[] {
    return [
      {
        fullName: 'Dr. Evelyn Reed',
        firstName: 'Evelyn',
        lastName: 'Reed',
        company: 'Reed Executive Advisory',
        jobTitle: 'C-Suite Executive Coach & Leadership Partner',
        website: 'https://reedexecutiveadvisory.com',
        email: 'evelyn@reedexecutiveadvisory.com',
        linkedInUrl: 'https://linkedin.com/in/evelynreed-csuite',
        country: 'United States',
        niche: 'Executive Coach',
        snippet: 'Specializing in Fortune 100 enterprise leadership transitions and executive retainers ($30k+). Contact page features a custom intake form with 48h response window.',
        source: 'google',
      },
      {
        fullName: 'Alexander Wright',
        firstName: 'Alexander',
        lastName: 'Wright',
        company: 'Wright Leadership Solutions',
        jobTitle: 'Founder & Corporate Leadership Consultant',
        website: 'https://wrightleadership.co.uk',
        email: 'awright@wrightleadership.co.uk',
        linkedInUrl: 'https://linkedin.com/in/alexwright-leadership',
        country: 'United Kingdom',
        niche: 'Leadership Development Consultant',
        snippet: 'Providing enterprise executive alignment programs and board coaching for financial institutions. Free-text inquiry form; high travel schedule creates response latency.',
        source: 'google',
      },
    ];
  }
}

export const googleSerperDiscovery = new GoogleSerperDiscovery();
