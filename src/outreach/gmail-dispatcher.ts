import { CONFIG } from '../config';
import { ProspectMasterRecord } from '../types';
import { dbClient } from '../db/sheets-client';
import { createGmailDraft, gmailApiConfigured, splitDraft } from './gmail-api';
import { createMailboxDraft, mailboxConfigured, mailboxUser } from './imap-draft';

export class GmailDispatcher {
  /**
   * Dispatches approved outreach.
   * If channel is email, prepares or sends via Gmail.
   * If channel is LinkedIn/Instagram/X, logs as a prioritized manual task.
   */
  public async dispatchApprovedOutreach(leadId: string): Promise<{ success: boolean; channel: string; mode: string; message: string }> {
    const lead = dbClient.getById(leadId);
    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    if (lead.status !== 'Approved') {
      throw new Error(`Lead ${leadId} cannot be dispatched because status is '${lead.status}', not 'Approved'`);
    }

    const channel = lead.email ? 'email' : lead.recommendedChannel || 'email';

    if (channel === 'email') {
      return this.handleEmailDispatch(lead);
    } else {
      return this.handleSocialManualDispatch(lead, channel);
    }
  }

  private async handleEmailDispatch(lead: ProspectMasterRecord): Promise<{ success: boolean; channel: string; mode: string; message: string }> {
    const today = new Date().toISOString().split('T')[0];

    if (!lead.email) {
      lead.notes = `${lead.notes ? lead.notes + "\n" : ""}Approved ${today}; no email address yet, so no Gmail draft`;
      dbClient.upsert(lead);
      return { success: true, channel: 'email', mode: 'no_email', message: 'Approved. No email address for this lead yet, so no Gmail draft was made.' };
    }
    if (!lead.draftEmail?.trim() || lead.draftEmail.includes('[NOT RECOMMENDED')) {
      lead.notes = `${lead.notes ? lead.notes + "\n" : ""}Approved ${today}; no email text drafted, so no Gmail draft`;
      dbClient.upsert(lead);
      return { success: true, channel: 'email', mode: 'no_draft_text', message: 'Approved. There is no email text for this lead, so no Gmail draft was made.' };
    }
    const { subject, body } = splitDraft(lead.draftEmail, `Quick question, ${lead.firstName || lead.fullName}`);

    // Preferred: save the draft inside the rusan@axiomsdigital.com mailbox itself (Hostinger, IMAP).
    if (mailboxConfigured()) {
      const folder = await createMailboxDraft({ to: lead.email, subject, body });
      lead.notes = `${lead.notes ? lead.notes + "\n" : ""}Draft saved ${today} in ${mailboxUser()} (${folder}); send it from that mailbox`;
      dbClient.upsert(lead);
      return { success: true, channel: 'email', mode: 'draft_created', message: `Approved. Draft to ${lead.email} is in the Drafts folder of ${mailboxUser()}.` };
    }

    // Fallback: Gmail draft (personal Gmail, sent as rusan@ through Send-As).
    if (!gmailApiConfigured()) {
      lead.notes = `${lead.notes ? lead.notes + "\n" : ""}Approved ${today}; no mailbox connected, so no draft`;
      dbClient.upsert(lead);
      return { success: true, channel: 'email', mode: 'gmail_not_connected', message: 'Approved. No mailbox is connected here, so no draft was made.' };
    }
    const draftId = await createGmailDraft({ to: lead.email, subject, body });
    lead.notes = `${lead.notes ? lead.notes + "\n" : ""}Gmail draft created ${today} (id ${draftId}); send it from Gmail`;
    dbClient.upsert(lead);
    return { success: true, channel: 'email', mode: 'draft_created', message: `Approved. Email draft to ${lead.email} is in your Gmail Drafts.` };
  }

  private async handleSocialManualDispatch(
    lead: ProspectMasterRecord,
    channel: string
  ): Promise<{ success: boolean; channel: string; mode: string; message: string }> {
    const today = new Date().toISOString().split('T')[0];
    console.log(`[GmailDispatcher] Preparing manual ${channel.toUpperCase()} dispatch task for ${lead.fullName}`);
    console.log(`Profile: ${lead.linkedInUrl || lead.instagramUrl || lead.xUrl}`);
    console.log(`Pre-drafted Message:\n${lead.draftLinkedInMessage || lead.draftInstagramMessage || lead.draftXMessage}\n`);

    lead.status = 'Contacted';
    lead.dateContacted = today;
    lead.notes = `${lead.notes ? lead.notes + "\n" : ""}Manual ${channel} task logged on ${today}`;
    dbClient.upsert(lead);

    return { success: true, channel, mode: 'manual_task_logged', message: `Approved. Send the ${channel} message by hand (marked as contacted).` };
  }
}

export const gmailDispatcher = new GmailDispatcher();
