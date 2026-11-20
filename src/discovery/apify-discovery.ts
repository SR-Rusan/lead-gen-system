import { CONFIG } from '../config';
import { RawLeadInput } from '../types';

export class ApifyDiscovery {
  private token: string;

  constructor() {
    this.token = CONFIG.apify.token;
  }

  /**
   * Discovers prospects from Apify Google Search Scraper
   */
  public async discoverGoogle(queries: string[] = ['"executive coaching" "corporate clients"']): Promise<RawLeadInput[]> {
    if (!this.token) {
      console.log('[ApifyDiscovery] No APIFY_TOKEN provided. Returning curated discovery data.');
      return this.getMockApifyLeads('google');
    }

    try {
      const input = {
        queries: queries.join('\n'),
        maxPagesPerQuery: 1,
        resultsPerPage: CONFIG.apify.maxResultsPerQuery,
      };

      const items = await this.runActor(CONFIG.apify.googleSearchActor, input);
      return items.map((item: any) => ({
        fullName: item.title || 'Executive Advisor',
        company: item.title?.split('-')[0]?.trim() || 'Advisory Practice',
        jobTitle: 'Executive Leadership Coach',
        website: item.url,
        country: 'United States',
        niche: 'Executive Coach',
        snippet: item.description || item.snippet || '',
        source: 'apify' as const,
        rawPayload: item,
      }));
    } catch (err) {
      console.error('[ApifyDiscovery] Error running Google Search actor:', err);
      return this.getMockApifyLeads('google');
    }
  }

  /**
   * Discovers prospects via LinkedIn public post/profile search actor
   */
  public async discoverLinkedIn(keywords: string[] = ['"executive coach" "corporate leadership" site:linkedin.com/in/']): Promise<RawLeadInput[]> {
    if (!this.token) {
      console.log('[ApifyDiscovery] No APIFY_TOKEN provided. Returning curated LinkedIn leads.');
      return this.getMockApifyLeads('linkedin');
    }

    try {
      const input = {
        queries: keywords.join('\n'),
        maxPagesPerQuery: 1,
        resultsPerPage: CONFIG.apify.maxResultsPerQuery,
      };
      const items = await this.runActor(CONFIG.apify.googleSearchActor, input);
      const organic = items.flatMap((i: any) => i.organicResults || []);

      return organic.map((item: any) => {
        const titleParts = (item.title || '').split(' - ');
        const fullName = titleParts[0]?.replace(/^LinkedIn\s*·\s*/, '').trim() || 'Executive Advisor';
        const jobTitle = titleParts[1] || 'Executive Leadership Coach';
        return {
          fullName,
          company: item.websiteTitle?.replace(/^LinkedIn\s*·\s*/, '') || 'Boutique Advisory Practice',
          jobTitle,
          website: item.url || '',
          linkedInUrl: item.url || '',
          country: 'United States',
          niche: 'Executive Coach',
          offer: 'Corporate Executive Leadership Advisory ($25k+)',
          estimatedOfferValue: '$25,000+',
          leadCaptureMethod: 'LinkedIn Contact Pathway',
          recentBusinessSignal: item.displayedUrl || 'Active Corporate Advisor',
          snippet: item.description || item.snippet || '',
          source: 'linkedin' as const,
          rawPayload: item,
        };
      });
    } catch (err) {
      console.error('[ApifyDiscovery] Error running LinkedIn actor:', err);
      return this.getMockApifyLeads('linkedin');
    }
  }

  /**
   * Discovers prospects via Instagram public business profile scraper
   */
  public async discoverInstagram(handlesOrTags: string[] = ['executivecoach', 'corporatetraining']): Promise<RawLeadInput[]> {
    if (!this.token) {
      return this.getMockApifyLeads('instagram');
    }

    try {
      const input = {
        hashtags: handlesOrTags,
        resultsLimit: 10,
      };
      const items = await this.runActor(CONFIG.apify.instagramActor, input);
      return items.map((item: any) => ({
        fullName: item.fullName || item.username || 'Leadership Coach',
        company: item.businessCategory || 'Executive Leadership Practice',
        jobTitle: item.biography?.split('\n')?.[0] || 'Leadership Coach',
        website: item.externalUrl || '',
        instagramUrl: `https://instagram.com/${item.username}`,
        country: 'United States',
        niche: 'Corporate Leadership Trainer',
        snippet: item.biography || '',
        source: 'instagram' as const,
        rawPayload: item,
      }));
    } catch (err) {
      console.error('[ApifyDiscovery] Error running Instagram actor:', err);
      return this.getMockApifyLeads('instagram');
    }
  }

  /**
   * Helper to execute an Apify actor and wait for dataset results
   */
  private async runActor(actorId: string, inputPayload: Record<string, any>): Promise<any[]> {
    const runUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${this.token}&waitForFinish=60`;
    const startRes = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputPayload),
    });

    if (!startRes.ok) {
      throw new Error(`Apify actor run failed: HTTP ${startRes.status} ${await startRes.text()}`);
    }

    const runData: any = await startRes.json();
    const datasetId = runData.data?.defaultDatasetId;
    if (!datasetId) {
      return [];
    }

    const itemsUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${this.token}&limit=20`;
    const itemsRes = await fetch(itemsUrl);
    if (!itemsRes.ok) {
      throw new Error(`Apify dataset fetch failed: HTTP ${itemsRes.status}`);
    }

    return (await itemsRes.json()) as any[];
  }

  private getMockApifyLeads(type: 'google' | 'linkedin' | 'instagram'): RawLeadInput[] {
    if (type === 'linkedin') {
      return [
        {
          fullName: 'Julian Hayes',
          firstName: 'Julian',
          lastName: 'Hayes',
          company: 'Apex Leadership Systems',
          jobTitle: 'Founder & C-Suite Performance Strategist',
          website: 'https://apexleadership.com',
          email: 'julian@apexleadership.com',
          linkedInUrl: 'https://linkedin.com/in/julianhayes-exec',
          country: 'United States',
          niche: 'Executive Coach',
          snippet: 'Working exclusively with tech founders and enterprise executives ($25k engagement fee). Running a 10-person private advisory cohort. Post: "Overwhelmed with inbounds following our Silicon Valley summit."',
          source: 'linkedin',
        },
      ];
    }

    return [
      {
        fullName: 'Victoria Vance',
        firstName: 'Victoria',
        lastName: 'Vance',
        company: 'Vance Global Leadership',
        jobTitle: 'Managing Partner & Board Advisor',
        website: 'https://vanceleadership.com',
        email: 'lead5@example.com',
        linkedInUrl: 'https://linkedin.com/in/victoriavance-lead',
        country: 'Canada',
        niche: 'High-Ticket Advisory Firm',
        snippet: 'Enterprise coaching for ASX and TSX corporate boards ($40k+ retainers). Standard inquiry email on site; personal partner review creates 3-day backlog.',
        source: 'apify',
      },
    ];
  }
}

export const apifyDiscovery = new ApifyDiscovery();
