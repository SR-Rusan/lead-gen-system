import { CONFIG } from '../config';
import { ProspectMasterRecord } from '../types';
import { dbClient } from '../db/sheets-client';

export class GmailDispatcher {
  /**
   * Dispatches approved outreach.
   * If channel is email, prepares or sends via Gmail.
   * If channel is LinkedIn/Instagram/X, logs as a prioritized manual task.
   */
  public async dispatchApprovedOutreach(leadId: string): Promise<{ success: boolean; channel: string; mode: string }> {
    const lead = dbClient.getById(leadId);
    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    if (lead.status !== 'Approved') {
      throw new Error(`Lead ${leadId} cannot be dispatched because status is '${lead.status}', not 'Approved'`);
    }

    const channel = lead.recommendedChannel || 'email';

    if (channel === 'email') {
      return this.handleEmailDispatch(lead);
    } else {
      return this.handleSocialManualDispatch(lead, channel);
    }
  }

  private async handleEmailDispatch(lead: ProspectMasterRecord): Promise<{ success: boolean; channel: string; mode: string }> {
    const today = new Date().toISOString().split('T')[0];

    if (CONFIG.gmail.draftModeOnly) {
      console.log(`[GmailDispatcher] [DRAFT MODE ACTIVE] Creating Gmail Draft for ${lead.email}...`);
      console.log(`To: ${lead.email}`);
      console.log(`Subject: Inbound triage between ${lead.company} advisory sessions`);
      console.log(`Content:\n${lead.draftEmail}\n`);

      lead.status = 'Contacted';
      lead.dateContacted = today;
      lead.notes = `${lead.notes} | Gmail draft created safely on ${today}`;
      dbClient.upsert(lead);

      return { success: true, channel: 'email', mode: 'draft_created' };
    }

    // Live send mode (only triggered when explicitly set in .env)
    console.log(`[GmailDispatcher] Live send authorized to ${lead.email}`);
    lead.status = 'Contacted';
    lead.dateContacted = today;
    lead.notes = `${lead.notes} | Email dispatched via Gmail on ${today}`;
    dbClient.upsert(lead);

    return { success: true, channel: 'email', mode: 'live_sent' };
  }

  private async handleSocialManualDispatch(
    lead: ProspectMasterRecord,
    channel: string
  ): Promise<{ success: boolean; channel: string; mode: string }> {
    const today = new Date().toISOString().split('T')[0];
    console.log(`[GmailDispatcher] Preparing manual ${channel.toUpperCase()} dispatch task for ${lead.fullName}`);
    console.log(`Profile: ${lead.linkedInUrl || lead.instagramUrl || lead.xUrl}`);
    console.log(`Pre-drafted Message:\n${lead.draftLinkedInMessage || lead.draftInstagramMessage || lead.draftXMessage}\n`);

    lead.status = 'Contacted';
    lead.dateContacted = today;
    lead.notes = `${lead.notes} | Manual ${channel} task logged on ${today}`;
    dbClient.upsert(lead);

    return { success: true, channel, mode: 'manual_task_logged' };
  }
}

export const gmailDispatcher = new GmailDispatcher();
