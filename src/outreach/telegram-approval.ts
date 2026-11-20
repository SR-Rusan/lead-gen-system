import { CONFIG } from '../config';
import { ProspectMasterRecord } from '../types';
import { dbClient } from '../db/sheets-client';

export class TelegramApprovalService {
  private botToken: string;
  private chatId: string;

  constructor() {
    this.botToken = CONFIG.telegram.botToken;
    this.chatId = CONFIG.telegram.chatId;
  }

  /**
   * Formats a high-stakes prospect review message for Telegram
   */
  public formatReviewMessage(lead: ProspectMasterRecord): string {
    const tier = lead.icpScore >= CONFIG.thresholds.aPlus ? '🌟 A+ PROSPECT' : '⭐ A PROSPECT';

    return `
${tier} FOR REVIEW

👤 *Name:* ${lead.fullName}
🏢 *Company:* ${lead.company}
🎯 *Title:* ${lead.jobTitle}
🌐 *Website:* ${lead.website}
📍 *Country:* ${lead.country || 'Unknown'}

📊 *ICP Score:* ${lead.icpScore}/100
• Economic: ${lead.economicScore}/25 (${lead.estimatedOfferValue || 'High-Ticket'})
• Corporate Focus: ${lead.corporateScore}/20
• Inbound Potential: ${lead.inboundScore}/10
• Founder-Led: ${lead.founderLedScore}/10
• Operational Pain: ${lead.painScore}/15
• Buying Signals: ${lead.buyingSignalScore}/20

🔍 *Why Qualified:*
${lead.qualificationReason}

⏱ *Why Now:*
${lead.whyNow}

⚠️ *Pain Hypothesis:*
${lead.potentialPain || lead.notes}

📬 *Recommended Channel:* ${lead.recommendedChannel.toUpperCase()}

📝 *Draft Email Subject:*
"${lead.draftEmail.split('\n')[0] || 'Inbound triage between advisory sessions'}"

✉️ *Draft Message Body:*
\`\`\`
${lead.draftEmail}
\`\`\`

To take action, reply:
/approve_${lead.leadId}
/reject_${lead.leadId}
`.trim();
  }

  /**
   * Dispatches review notification to Telegram with inline buttons
   */
  public async sendForReview(lead: ProspectMasterRecord): Promise<{ success: boolean; simulated?: boolean }> {
    const text = this.formatReviewMessage(lead);

    if (!this.botToken || !this.chatId) {
      console.log('\n======================================================');
      console.log('📢 TELEGRAM HUMAN APPROVAL NOTIFICATION (Simulated Mode)');
      console.log('======================================================');
      console.log(text);
      console.log('======================================================\n');
      return { success: true, simulated: true };
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const payload: any = {
        chat_id: this.chatId,
        text,
        parse_mode: 'Markdown',
      };

      if (CONFIG.telegram.enableApprovalButtons) {
        payload.reply_markup = {
          inline_keyboard: [
            [
              { text: '✅ Approve Email', callback_data: `approve_${lead.leadId}` },
              { text: '❌ Reject', callback_data: `reject_${lead.leadId}` },
            ],
            [
              {
                text: '📊 View Master Sheet',
                url: `https://docs.google.com/spreadsheets/d/${CONFIG.google.sheetId}`,
              },
            ],
          ],
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Telegram API HTTP ${res.status}: ${await res.text()}`);
      }

      console.log(`[TelegramApproval] Sent review notification for ${lead.fullName} (${lead.leadId})`);
      return { success: true };
    } catch (err) {
      console.error(`[TelegramApproval] Failed to send Telegram alert:`, err);
      return { success: false };
    }
  }

  /**
   * Processes human approval callback or command
   */
  public handleApprovalAction(leadId: string, action: 'approve' | 'reject', reviewerNotes?: string): ProspectMasterRecord | null {
    const lead = dbClient.getById(leadId);
    if (!lead) {
      console.error(`[TelegramApproval] Lead ${leadId} not found`);
      return null;
    }

    if (action === 'approve') {
      lead.status = 'Approved';
      lead.notes = `${lead.notes} | Approved via Telegram human review on ${new Date().toISOString().split('T')[0]}`;
      console.log(`[TelegramApproval] Lead ${lead.fullName} (${leadId}) marked as APPROVED`);
    } else {
      lead.status = 'Rejected';
      lead.notes = `${lead.notes} | Rejected via human review: ${reviewerNotes || 'Does not fit immediate offer'}`;
      console.log(`[TelegramApproval] Lead ${lead.fullName} (${leadId}) marked as REJECTED`);
    }

    dbClient.upsert(lead);
    return lead;
  }
}

export const telegramApprovalService = new TelegramApprovalService();
