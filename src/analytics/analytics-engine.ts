import { dbClient } from '../db/sheets-client';
import { AnalyticsSummary, ProspectMasterRecord } from '../types';

export class AnalyticsEngine {
  /**
   * Computes the complete commercial funnel metrics from the master database
   */
  public static computeMetrics(records: ProspectMasterRecord[] = dbClient.getAll()): AnalyticsSummary {
    const totalRaw = records.length;
    let totalQualified = 0;
    let totalAPlus = 0;
    let totalA = 0;
    let totalB = 0;
    let totalRejected = 0;
    let totalReadyForReview = 0;
    let totalApproved = 0;
    let totalContacted = 0;
    let totalReplies = 0;
    let totalPositiveReplies = 0;
    let totalCallsBooked = 0;
    let totalProposals = 0;
    let totalWon = 0;
    let totalLost = 0;

    const channelBreakdown: Record<string, { count: number; qualified: number; calls: number; won: number }> = {};
    const sourceBreakdown: Record<string, { count: number; qualified: number; calls: number; won: number }> = {};

    for (const r of records) {
      // Score-based tier counts
      if (r.icpScore >= 80) totalAPlus++;
      else if (r.icpScore >= 65) totalA++;
      else if (r.icpScore >= 50) totalB++;
      else if (r.icpScore > 0) totalRejected++;

      if (r.icpScore >= 50) totalQualified++;

      // Pipeline status counts
      if (r.status === 'Ready for Review') totalReadyForReview++;
      if (r.status === 'Approved') totalApproved++;
      if (['Contacted', 'Follow-up', 'Replied', 'Positive', 'Call Booked', 'Proposal', 'Won', 'Lost'].includes(r.status)) {
        totalContacted++;
      }
      if (r.response === 'Yes' || ['Replied', 'Positive', 'Call Booked', 'Proposal', 'Won'].includes(r.status)) {
        totalReplies++;
      }
      if (r.positiveResponse === 'Yes' || ['Positive', 'Call Booked', 'Proposal', 'Won'].includes(r.status)) {
        totalPositiveReplies++;
      }
      if (r.callBooked === 'Yes' || ['Call Booked', 'Proposal', 'Won'].includes(r.status)) {
        totalCallsBooked++;
      }
      if (r.proposal === 'Yes' || ['Proposal', 'Won'].includes(r.status)) {
        totalProposals++;
      }
      if (r.closed === 'Won' || r.status === 'Won') {
        totalWon++;
      }
      if (r.closed === 'Lost' || r.status === 'Lost') {
        totalLost++;
      }

      // Channel breakdown
      const ch = r.recommendedChannel || 'unassigned';
      if (!channelBreakdown[ch]) {
        channelBreakdown[ch] = { count: 0, qualified: 0, calls: 0, won: 0 };
      }
      channelBreakdown[ch].count++;
      if (r.icpScore >= 65) channelBreakdown[ch].qualified++;
      if (r.callBooked === 'Yes') channelBreakdown[ch].calls++;
      if (r.closed === 'Won') channelBreakdown[ch].won++;

      // Source breakdown
      const src = r.source || 'manual';
      if (!sourceBreakdown[src]) {
        sourceBreakdown[src] = { count: 0, qualified: 0, calls: 0, won: 0 };
      }
      sourceBreakdown[src].count++;
      if (r.icpScore >= 65) sourceBreakdown[src].qualified++;
      if (r.callBooked === 'Yes') sourceBreakdown[src].calls++;
      if (r.closed === 'Won') sourceBreakdown[src].won++;
    }

    const calcPct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

    return {
      totalRaw,
      totalQualified,
      totalAPlus,
      totalA,
      totalB,
      totalRejected,
      totalReadyForReview,
      totalApproved,
      totalContacted,
      totalReplies,
      totalPositiveReplies,
      totalCallsBooked,
      totalProposals,
      totalWon,
      totalLost,
      qualificationRatePct: calcPct(totalQualified, totalRaw),
      replyRatePct: calcPct(totalReplies, totalContacted),
      positiveReplyRatePct: calcPct(totalPositiveReplies, totalReplies),
      callRatePct: calcPct(totalCallsBooked, totalContacted),
      proposalRatePct: calcPct(totalProposals, totalCallsBooked),
      closeRatePct: calcPct(totalWon, totalProposals),
      overallLeadToClientPct: calcPct(totalWon, totalRaw),
      channelBreakdown,
      sourceBreakdown,
    };
  }

  /**
   * Generates a readable ASCII dashboard for the terminal and reports
   */
  public static formatDashboard(summary: AnalyticsSummary): string {
    return `
=============================================================================
         EXECUTIVE LEAD INTAKE & TRIAGE - FUNNEL ANALYTICS DASHBOARD
=============================================================================
RAW INGESTED PROSPECTS : ${summary.totalRaw}
QUALIFIED PROSPECTS    : ${summary.totalQualified} (${summary.qualificationRatePct}% qual rate)
  ├── 🌟 A+ Prospects   : ${summary.totalAPlus} (Immediate Priority)
  ├── ⭐ A Prospects    : ${summary.totalA} (High Potential)
  ├── 📋 B / Nurture    : ${summary.totalB}
  └── ❌ Rejected       : ${summary.totalRejected}

OUTREACH PIPELINE:
  ├── Ready for Review  : ${summary.totalReadyForReview}
  ├── Human Approved    : ${summary.totalApproved}
  ├── Contacted         : ${summary.totalContacted}
  ├── Inbound Replies   : ${summary.totalReplies} (${summary.replyRatePct}% reply rate)
  ├── Positive Replies  : ${summary.totalPositiveReplies} (${summary.positiveReplyRatePct}% positive rate)
  ├── Sales Calls Booked: ${summary.totalCallsBooked} (${summary.callRatePct}% call booking rate)
  ├── Proposals Sent    : ${summary.totalProposals} (${summary.proposalRatePct}% proposal rate)
  ├── 🏆 Deals Won      : ${summary.totalWon} (${summary.closeRatePct}% close rate)
  └── 📉 Deals Lost     : ${summary.totalLost}

OVERALL LEAD-TO-CLIENT RATE: ${summary.overallLeadToClientPct}%

CHANNEL PERFORMANCE:
${Object.entries(summary.channelBreakdown)
  .map(([ch, s]) => `  • ${ch.toUpperCase().padEnd(10)}: Leads=${s.count} | Qual=${s.qualified} | Calls=${s.calls} | Won=${s.won}`)
  .join('\n')}

SOURCE PERFORMANCE:
${Object.entries(summary.sourceBreakdown)
  .map(([src, s]) => `  • ${src.toUpperCase().padEnd(10)}: Leads=${s.count} | Qual=${s.qualified} | Calls=${s.calls} | Won=${s.won}`)
  .join('\n')}
=============================================================================
`.trim();
  }
}

export function printAnalyticsDashboard(): void {
  const summary = AnalyticsEngine.computeMetrics();
  console.log(AnalyticsEngine.formatDashboard(summary));
}
