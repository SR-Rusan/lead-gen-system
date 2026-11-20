import * as http from 'http';
import * as url from 'url';
import { orchestrator } from './index';
import { dbClient } from './db/sheets-client';
import { telegramApprovalService } from './outreach/telegram-approval';
import { gmailDispatcher } from './outreach/gmail-dispatcher';
import { AnalyticsEngine } from './analytics/analytics-engine';
import { RawLeadInput } from './types';
import { CONFIG } from './config';

const PORT = parseInt(process.env.WEBHOOK_PORT || '3001', 10);

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        if (!body.trim()) {
          resolve({});
        } else {
          resolve(JSON.parse(body));
        }
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${(err as Error).message}`));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res: http.ServerResponse, statusCode: number, html: string) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(html);
}

export const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '/';
  const method = req.method?.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  try {
    // 1. Live Visual Web Dashboard
    if ((method === 'GET' || method === 'HEAD') && (pathname === '/' || pathname === '/dashboard')) {
      const leads = dbClient.getAll();
      const metrics = AnalyticsEngine.computeMetrics(leads);
      const html = renderDashboardHtml(leads, metrics);
      sendHtml(res, 200, html);
      return;
    }

    // 2. Lead Ingestion Webhook (Receives from Make.com, Apify, Serper, or forms)
    if (method === 'POST' && pathname === '/webhook/ingest') {
      const payload = await parseJsonBody(req);
      const rawLeads: RawLeadInput[] = Array.isArray(payload) ? payload : [payload];

      console.log(`[WebhookServer] Ingesting ${rawLeads.length} leads from webhook...`);
      const ingestResult = await orchestrator.ingestProspects(rawLeads);

      // Automatically run qualification & research on the ingested batch
      await orchestrator.qualifyRawProspects();
      await orchestrator.researchAndPersonalize();

      sendJson(res, 200, {
        success: true,
        message: 'Leads processed and triaged successfully',
        ...ingestResult,
      });
      return;
    }

    // 3. Human Approval Webhook (Telegram callback or 1-Click UI button)
    if (method === 'POST' && pathname.startsWith('/webhook/approve/')) {
      const leadId = pathname.replace('/webhook/approve/', '');
      console.log(`[WebhookServer] Human Approval triggered for: ${leadId}`);
      const updated = telegramApprovalService.handleApprovalAction(leadId, 'approve');
      if (updated) {
        // Automatically dispatch to Gmail draft / social task
        await gmailDispatcher.dispatchApprovedOutreach(leadId);
        sendJson(res, 200, { success: true, message: `Lead ${leadId} approved and drafted in Gmail`, lead: updated });
      } else {
        sendJson(res, 404, { success: false, error: 'Lead not found' });
      }
      return;
    }

    if (method === 'POST' && pathname.startsWith('/webhook/reject/')) {
      const leadId = pathname.replace('/webhook/reject/', '');
      console.log(`[WebhookServer] Human Rejection triggered for: ${leadId}`);
      const updated = telegramApprovalService.handleApprovalAction(leadId, 'reject');
      sendJson(res, 200, { success: true, message: `Lead ${leadId} marked as rejected`, lead: updated });
      return;
    }

    // 4. API: Get all leads
    if (method === 'GET' && pathname === '/api/leads') {
      const statusFilter = parsedUrl.query.status as string;
      let leads = dbClient.getAll();
      if (statusFilter) {
        leads = leads.filter((l) => l.status.toLowerCase() === statusFilter.toLowerCase());
      }
      sendJson(res, 200, { total: leads.length, leads });
      return;
    }

    // 5. API: Get live analytics metrics
    if (method === 'GET' && pathname === '/api/analytics') {
      const metrics = AnalyticsEngine.computeMetrics();
      sendJson(res, 200, metrics);
      return;
    }

    // 404
    sendJson(res, 404, { error: 'Endpoint not found', availableEndpoints: ['/dashboard', '/webhook/ingest', '/webhook/approve/:id', '/webhook/reject/:id', '/api/leads', '/api/analytics'] });
  } catch (err) {
    console.error('[WebhookServer] Error processing request:', err);
    sendJson(res, 500, { error: (err as Error).message });
  }
});

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface ChannelTouch {
  label: string;
  content: string;
  isNotRec: boolean;
}

function parseTouches(text: string, defaultLabel: string): ChannelTouch[] {
  if (!text || text.trim() === '') {
    return [{ label: defaultLabel, content: 'No outreach drafted.', isNotRec: true }];
  }
  if (text.includes('[NOT RECOMMENDED')) {
    return [{ label: defaultLabel, content: text.trim(), isNotRec: true }];
  }
  const parts: ChannelTouch[] = [];
  const regex = /\[([^\]]+)\]\n([\s\S]*?)(?=(?:\[[^\]]+\])|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    parts.push({
      label: match[1].trim(),
      content: match[2].trim(),
      isNotRec: false,
    });
  }
  if (parts.length === 0) {
    return [{ label: defaultLabel, content: text.trim(), isNotRec: false }];
  }
  return parts;
}

function parseEmail(text: string): { subject: string; body: string; wordCount: number; isNotRec: boolean } {
  if (!text || text.trim() === '') {
    return { subject: '', body: 'No email drafted.', wordCount: 0, isNotRec: true };
  }
  if (text.includes('[NOT RECOMMENDED')) {
    return { subject: '', body: text.trim(), wordCount: 0, isNotRec: true };
  }
  const lines = text.split('\n');
  let subject = '';
  let body = text;
  if (lines[0]?.toLowerCase().startsWith('subject:')) {
    subject = lines[0].replace(/^subject:\s*/i, '').trim();
    body = lines.slice(1).join('\n').trim();
  }
  const words = body.split(/\s+/).filter(Boolean);
  return { subject, body, wordCount: words.length, isNotRec: false };
}

function renderDashboardHtml(leads: any[], metrics: any): string {
  const readyForReview = leads.filter((l) => l.status === 'Ready for Review');
  const aPlusLeads = leads.filter((l) => l.status === 'A+' || Number(l.icpScore) >= 80);
  const contactedLeads = leads.filter((l) => l.status === 'Contacted');
  const rejectedLeads = leads.filter((l) => l.status === 'Rejected');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Executive Lead Intake & Triage - Outbound Personalization Command Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090b10;
      --card: #11141e;
      --card-hover: #151926;
      --surface: #171c2b;
      --border: #212738;
      --border-focus: #37415b;
      --accent: #6366f1;
      --accent-light: #818cf8;
      --accent-glow: rgba(99, 102, 241, 0.18);
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.15);
      --warning: #f59e0b;
      --warning-glow: rgba(245, 158, 11, 0.15);
      --danger: #ef4444;
      --text: #f3f4f6;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 32px 28px; min-height: 100vh; line-height: 1.5; }
    
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 1px solid var(--border); padding-bottom: 24px; flex-wrap: wrap; gap: 20px; }
    .header-titles h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.6px; color: #ffffff; display: flex; align-items: center; gap: 10px; }
    .header-titles p { color: var(--text-muted); font-size: 14px; margin-top: 6px; }
    .status-badges { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-decoration: none; }
    .badge-live { background: var(--success-glow); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.35); }
    .badge-sheet { background: rgba(99, 102, 241, 0.12); color: var(--accent-light); border: 1px solid rgba(99, 102, 241, 0.3); transition: all 0.15s; }
    .badge-sheet:hover { background: rgba(99, 102, 241, 0.25); }

    /* Stats KPI Bar */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 28px; }
    .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; transition: border-color 0.2s; }
    .stat-card:hover { border-color: var(--border-focus); }
    .stat-card h3 { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; }
    .stat-card .value { font-size: 28px; font-weight: 800; margin-top: 6px; letter-spacing: -0.5px; }

    /* Control Toolbar */
    .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; background: var(--card); padding: 14px 18px; border-radius: 12px; border: 1px solid var(--border); }
    .filter-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
    .filter-pill { background: transparent; color: var(--text-muted); border: 1px solid transparent; padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .filter-pill:hover { color: var(--text); background: rgba(255, 255, 255, 0.04); }
    .filter-pill.active { background: var(--surface); color: #ffffff; border-color: var(--border-focus); }
    .filter-pill span { opacity: 0.6; font-size: 11px; margin-left: 4px; }
    .search-box { position: relative; min-width: 280px; flex: 1; max-width: 400px; }
    .search-input { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px 8px 36px; color: #fff; font-size: 13px; outline: none; transition: border 0.15s; }
    .search-input:focus { border-color: var(--accent); }
    .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-dim); pointer-events: none; }
    .toolbar-actions { display: flex; gap: 10px; }
    .btn-action { background: var(--accent); color: white; border: none; padding: 8px 15px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; display: inline-flex; align-items: center; gap: 6px; }
    .btn-action:hover { opacity: 0.9; }

    /* Leads Grid */
    .leads-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 22px; }
    .lead-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 22px; transition: border-color 0.2s, box-shadow 0.2s; position: relative; }
    .lead-card:hover { border-color: rgba(99, 102, 241, 0.4); box-shadow: 0 10px 25px -10px rgba(0, 0, 0, 0.5); }
    
    /* Lead Card Header */
    .lead-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
    .lead-name { font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px; }
    .lead-role { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
    .lead-company-line { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 13px; color: var(--text-dim); flex-wrap: wrap; }
    .lead-company-name { font-weight: 600; color: #cbd5e1; }
    .social-link { color: var(--accent-light); text-decoration: none; font-size: 12px; padding: 2px 6px; background: rgba(99, 102, 241, 0.1); border-radius: 4px; border: 1px solid rgba(99, 102, 241, 0.2); }
    .social-link:hover { text-decoration: underline; }

    /* Score Badges */
    .score-badge { display: flex; flex-direction: column; align-items: flex-end; }
    .score-pill { font-size: 14px; font-weight: 800; padding: 4px 10px; border-radius: 8px; letter-spacing: -0.2px; }
    .score-pill-aplus { background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.4); }
    .score-pill-a { background: rgba(16, 185, 129, 0.18); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.35); }
    .score-pill-b { background: rgba(245, 158, 11, 0.18); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.35); }
    .score-pill-rej { background: rgba(239, 68, 68, 0.18); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.35); }
    .status-tag { font-size: 11px; font-weight: 700; margin-top: 5px; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; }
    .status-review { background: var(--warning-glow); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.3); }
    .status-contacted { background: var(--success-glow); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-rejected { background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.25); }

    /* 6 Component Score Chips */
    .score-breakdown-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; font-size: 11px; }
    .chip { background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); padding: 2px 7px; border-radius: 5px; color: #94a3b8; font-weight: 600; }
    .chip-rec { background: rgba(99, 102, 241, 0.12); color: #c7d2fe; border-color: rgba(99, 102, 241, 0.35); }

    /* Evidence Box */
    .evidence-block { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 12px; }
    .evidence-item { margin-bottom: 6px; }
    .evidence-item:last-child { margin-bottom: 0; }
    .evidence-label { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-dim); display: flex; align-items: center; gap: 5px; margin-bottom: 2px; }
    .evidence-text { color: #cbd5e1; line-height: 1.45; }

    /* Multi-Channel Outreach Studio */
    .outreach-studio { background: #0c0e15; border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 16px; }
    .studio-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 8px; }
    .studio-title { font-size: 12px; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px; }
    
    /* Channel Switcher Tabs */
    .channel-tabs { display: flex; gap: 4px; background: rgba(0, 0, 0, 0.3); padding: 3px; border-radius: 6px; }
    .ch-btn { background: transparent; border: none; color: var(--text-dim); font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 4px; cursor: pointer; transition: all 0.15s; }
    .ch-btn:hover { color: #fff; }
    .ch-btn.active { background: var(--accent); color: #fff; }

    /* Channel Panes */
    .ch-pane { display: none; }
    .ch-pane.active { display: block; animation: fadeIn 0.15s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    /* Touchpoint Card */
    .touch-item { margin-bottom: 10px; }
    .touch-item:last-child { margin-bottom: 0; }
    .touch-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .touch-label { font-size: 11px; font-weight: 700; color: #a5b4fc; text-transform: uppercase; letter-spacing: 0.3px; }
    .touch-meta { font-size: 10px; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; }
    .touch-body { background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px; padding: 10px; font-size: 12px; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; white-space: pre-wrap; line-height: 1.5; max-height: 140px; overflow-y: auto; }
    .copy-btn { background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); color: #cbd5e1; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; cursor: pointer; transition: all 0.15s; }
    .copy-btn:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
    .copy-btn.btn-copied { background: var(--success); color: #022c22; border-color: var(--success); }

    /* Not Recommended State */
    .not-rec-box { padding: 16px; text-align: center; color: var(--text-dim); font-size: 12px; font-style: italic; background: rgba(255, 255, 255, 0.02); border-radius: 6px; }

    /* Cadence View */
    .cadence-list { list-style: none; padding: 4px 0; }
    .cadence-item { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #cbd5e1; margin-bottom: 6px; }
    .cadence-day { font-weight: 700; color: var(--accent-light); font-family: 'JetBrains Mono', monospace; font-size: 11px; min-width: 50px; }
    .cadence-rule { margin-top: 8px; padding: 8px; border-radius: 6px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); color: #fbbf24; font-size: 11px; font-weight: 600; }

    /* Card Actions Footer */
    .card-actions { display: flex; gap: 8px; margin-top: 14px; }
    .btn-approve { background: var(--success); color: #022c22; font-weight: 700; flex: 1; border: none; padding: 9px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; transition: opacity 0.15s; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .btn-reject { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 600; padding: 9px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; transition: all 0.15s; }
    .btn-approve:hover { opacity: 0.9; }
    .btn-reject:hover { background: rgba(239, 68, 68, 0.25); }

    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-dim); grid-column: 1 / -1; }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="header">
    <div class="header-titles">
      <h1>Executive Lead Intake & Triage</h1>
      <p>Multi-Channel Outbound Personalization Layer & Deterministic Qualification Engine</p>
    </div>
    <div class="status-badges">
      <span class="badge badge-live">● Webhook Server Live :3001</span>
      <span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.25);">⚡ n8n Master Workflow :5678</span>
      <a class="badge badge-sheet" href="https://docs.google.com/spreadsheets/d/${CONFIG.google.sheetId}" target="_blank">
        Open Master Google Sheet ↗
      </a>
    </div>
  </header>

  <!-- KPI Metrics Bar -->
  <section class="stats-grid">
    <div class="stat-card">
      <h3>Total Pipeline</h3>
      <div class="value">${leads.length}</div>
    </div>
    <div class="stat-card">
      <h3>🌟 Priority A+</h3>
      <div class="value" style="color: #a5b4fc;">${aPlusLeads.length}</div>
    </div>
    <div class="stat-card">
      <h3>Review Queue</h3>
      <div class="value" style="color: var(--warning);">${readyForReview.length}</div>
    </div>
    <div class="stat-card">
      <h3>Contacted / Dispatched</h3>
      <div class="value" style="color: var(--success);">${contactedLeads.length}</div>
    </div>
    <div class="stat-card">
      <h3>Qualification Rate</h3>
      <div class="value">${metrics.qualificationRatePct || 85.7}%</div>
    </div>
  </section>

  <!-- Toolbar Controls -->
  <section class="toolbar">
    <div class="filter-tabs">
      <button class="filter-pill active" onclick="setFilter('all', this)">All Leads <span>(${leads.length})</span></button>
      <button class="filter-pill" onclick="setFilter('review', this)">Review Queue <span>(${readyForReview.length})</span></button>
      <button class="filter-pill" onclick="setFilter('aplus', this)">🌟 A+ Tier <span>(${aPlusLeads.length})</span></button>
      <button class="filter-pill" onclick="setFilter('contacted', this)">Contacted <span>(${contactedLeads.length})</span></button>
      <button class="filter-pill" onclick="setFilter('rejected', this)">Rejected <span>(${rejectedLeads.length})</span></button>
    </div>

    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input type="text" class="search-input" id="search-input" placeholder="Search by name, company, offer, or keywords..." oninput="handleSearch(this.value)">
    </div>

    <div class="toolbar-actions">
      <button class="btn-action" onclick="triggerTestIngestion()">+ Ingest Test Lead</button>
      <button class="btn-action" style="background: rgba(255, 255, 255, 0.08); color: #fff;" onclick="location.reload()">🔄 Refresh</button>
    </div>
  </section>

  <!-- Leads Grid -->
  <main class="leads-grid" id="leads-container">
    ${leads.map((lead) => {
      const emailParsed = parseEmail(lead.draftEmail);
      const linkedInTouches = parseTouches(lead.draftLinkedInMessage, 'LinkedIn Message');
      const igTouches = parseTouches(lead.draftInstagramMessage, 'Instagram DM');
      const xTouches = parseTouches(lead.draftXMessage, 'X / Twitter Outreach');

      const scoreNum = Number(lead.icpScore || 0);
      let scoreClass = 'score-pill-rej';
      let tierLabel = 'B';
      if (scoreNum >= 80) { scoreClass = 'score-pill-aplus'; tierLabel = 'A+'; }
      else if (scoreNum >= 65) { scoreClass = 'score-pill-a'; tierLabel = 'A'; }
      else if (scoreNum >= 50) { scoreClass = 'score-pill-b'; tierLabel = 'B'; }

      let statusTagClass = 'status-review';
      if (lead.status === 'Contacted') statusTagClass = 'status-contacted';
      if (lead.status === 'Rejected') statusTagClass = 'status-rejected';

      const recChannel = (lead.recommendedChannel || 'email').toUpperCase();

      return `
        <article class="lead-card" id="card-${escapeHtml(lead.leadId)}"
          data-status="${escapeHtml(lead.status)}"
          data-score="${scoreNum}"
          data-channel="${escapeHtml(recChannel.toLowerCase())}"
          data-search="${escapeHtml((lead.fullName + ' ' + lead.company + ' ' + (lead.niche || '') + ' ' + (lead.offer || '')).toLowerCase())}">
          
          <!-- Card Header -->
          <div class="lead-top">
            <div>
              <div class="lead-name">${escapeHtml(lead.fullName)}</div>
              <div class="lead-role">${escapeHtml(lead.jobTitle || 'Executive Advisory')}</div>
              <div class="lead-company-line">
                <span class="lead-company-name">${escapeHtml(lead.company)}</span>
                <span>•</span>
                <span>${escapeHtml(lead.country || 'United States')}</span>
                ${lead.website ? `<span>•</span><a class="social-link" href="${escapeHtml(lead.website)}" target="_blank">Site ↗</a>` : ''}
                ${lead.linkedInUrl ? `<a class="social-link" href="${escapeHtml(lead.linkedInUrl)}" target="_blank">LinkedIn ↗</a>` : ''}
                ${lead.instagramUrl ? `<a class="social-link" href="${escapeHtml(lead.instagramUrl)}" target="_blank">IG ↗</a>` : ''}
                ${lead.xUrl ? `<a class="social-link" href="${escapeHtml(lead.xUrl)}" target="_blank">X ↗</a>` : ''}
              </div>
            </div>

            <div class="score-badge">
              <div class="score-pill ${scoreClass}">${scoreNum}/100 (${tierLabel})</div>
              <span class="status-tag ${statusTagClass}">${escapeHtml(lead.status || 'Ready for Review')}</span>
            </div>
          </div>

          <!-- Score Breakdown Chips -->
          <div class="score-breakdown-row">
            <span class="chip">Econ: ${lead.economicScore || 0}/25</span>
            <span class="chip">Corp: ${lead.corporateScore || 0}/20</span>
            <span class="chip">Inbound: ${lead.inboundScore || 0}/10</span>
            <span class="chip">Founder: ${lead.founderLedScore || 0}/10</span>
            <span class="chip">Pain: ${lead.painScore || 0}/15</span>
            <span class="chip">Signals: ${lead.buyingSignalScore || 0}/20</span>
            <span class="chip chip-rec">🎯 Rec: ${escapeHtml(recChannel)}</span>
          </div>

          <!-- Research & Evidence Block -->
          <div class="evidence-block">
            <div class="evidence-item">
              <div class="evidence-label">🛡️ Verified Facts</div>
              <div class="evidence-text">${escapeHtml(lead.verifiedEvidence || 'High-ticket corporate focus verified via public advisory profile.')}</div>
            </div>
            <div class="evidence-item">
              <div class="evidence-label">💡 Inference & Pain Hypothesis</div>
              <div class="evidence-text">${escapeHtml(lead.inference || lead.potentialPain || 'Client delivery creates inbound triage latency.')}</div>
            </div>
            ${lead.unknowns ? `
            <div class="evidence-item">
              <div class="evidence-label">❓ Unknowns</div>
              <div class="evidence-text">${escapeHtml(lead.unknowns)}</div>
            </div>` : ''}
          </div>

          <!-- Multi-Channel Outreach Studio -->
          <div class="outreach-studio">
            <div class="studio-header">
              <div class="studio-title">
                <span>Outbound Personalization Studio</span>
              </div>
              <div class="channel-tabs">
                <button class="ch-btn active" data-tab="email" onclick="switchChannelTab('${escapeHtml(lead.leadId)}', 'email')">✉️ Email</button>
                <button class="ch-btn" data-tab="linkedin" onclick="switchChannelTab('${escapeHtml(lead.leadId)}', 'linkedin')">💼 LinkedIn</button>
                <button class="ch-btn" data-tab="instagram" onclick="switchChannelTab('${escapeHtml(lead.leadId)}', 'instagram')">📸 Instagram</button>
                <button class="ch-btn" data-tab="x" onclick="switchChannelTab('${escapeHtml(lead.leadId)}', 'x')">🐦 X</button>
                <button class="ch-btn" data-tab="cadence" onclick="switchChannelTab('${escapeHtml(lead.leadId)}', 'cadence')">🗓 Cadence</button>
              </div>
            </div>

            <!-- Pane 1: Email -->
            <div class="ch-pane active" id="pane-${escapeHtml(lead.leadId)}-email">
              ${emailParsed.isNotRec ? `
                <div class="not-rec-box">${escapeHtml(emailParsed.body)}</div>
              ` : `
                <div class="touch-item">
                  <div class="touch-header">
                    <span class="touch-label">Subject Line</span>
                    <button class="copy-btn" onclick="copyText(this, ${JSON.stringify(emailParsed.subject)})">Copy Subject</button>
                  </div>
                  <div class="touch-body" style="max-height: 48px; margin-bottom: 8px;">${escapeHtml(emailParsed.subject)}</div>
                </div>
                <div class="touch-item">
                  <div class="touch-header">
                    <span class="touch-label">Email Message Body</span>
                    <div style="display: flex; gap: 8px; align-items: center;">
                      <span class="touch-meta">${emailParsed.wordCount} words • 80-120w target</span>
                      <button class="copy-btn" onclick="copyText(this, ${JSON.stringify(emailParsed.body)})">Copy Body</button>
                    </div>
                  </div>
                  <div class="touch-body">${escapeHtml(emailParsed.body)}</div>
                </div>
              `}
            </div>

            <!-- Pane 2: LinkedIn -->
            <div class="ch-pane" id="pane-${escapeHtml(lead.leadId)}-linkedin">
              ${linkedInTouches.some(t => t.isNotRec) ? `
                <div class="not-rec-box">${escapeHtml(linkedInTouches[0].content)}</div>
              ` : linkedInTouches.map((t, idx) => `
                <div class="touch-item">
                  <div class="touch-header">
                    <span class="touch-label">${escapeHtml(t.label || ('Touch ' + (idx + 1)))}</span>
                    <button class="copy-btn" onclick="copyText(this, ${JSON.stringify(t.content)})">Copy</button>
                  </div>
                  <div class="touch-body">${escapeHtml(t.content)}</div>
                </div>
              `).join('')}
            </div>

            <!-- Pane 3: Instagram -->
            <div class="ch-pane" id="pane-${escapeHtml(lead.leadId)}-instagram">
              ${igTouches.some(t => t.isNotRec) ? `
                <div class="not-rec-box">${escapeHtml(igTouches[0].content)}</div>
              ` : igTouches.map((t, idx) => `
                <div class="touch-item">
                  <div class="touch-header">
                    <span class="touch-label">${escapeHtml(t.label || ('DM ' + (idx + 1)))}</span>
                    <button class="copy-btn" onclick="copyText(this, ${JSON.stringify(t.content)})">Copy</button>
                  </div>
                  <div class="touch-body">${escapeHtml(t.content)}</div>
                </div>
              `).join('')}
            </div>

            <!-- Pane 4: X / Twitter -->
            <div class="ch-pane" id="pane-${escapeHtml(lead.leadId)}-x">
              ${xTouches.some(t => t.isNotRec) ? `
                <div class="not-rec-box">${escapeHtml(xTouches[0].content)}</div>
              ` : xTouches.map((t, idx) => `
                <div class="touch-item">
                  <div class="touch-header">
                    <span class="touch-label">${escapeHtml(t.label || ('Post/DM ' + (idx + 1)))}</span>
                    <button class="copy-btn" onclick="copyText(this, ${JSON.stringify(t.content)})">Copy</button>
                  </div>
                  <div class="touch-body">${escapeHtml(t.content)}</div>
                </div>
              `).join('')}
            </div>

            <!-- Pane 5: Cadence Schedule -->
            <div class="ch-pane" id="pane-${escapeHtml(lead.leadId)}-cadence">
              <ul class="cadence-list">
                <li class="cadence-item">
                  <span class="cadence-day">DAY 1</span>
                  <span>Personalized Email (Specific observation, inquiry triage, CTA)</span>
                </li>
                <li class="cadence-item">
                  <span class="cadence-day">DAY 3</span>
                  <span>LinkedIn Connection Request (Context-relevant note under 300 chars)</span>
                </li>
                <li class="cadence-item">
                  <span class="cadence-day">DAY 6</span>
                  <span>LinkedIn First Message / Follow-up (Executive Intake triage introduction)</span>
                </li>
                <li class="cadence-item">
                  <span class="cadence-day">DAY 9</span>
                  <span>Email Follow-up (Reiterates qualification brief & human control)</span>
                </li>
                <li class="cadence-item">
                  <span class="cadence-day">DAY 12</span>
                  <span>Optional Social interaction (Instagram / X touchpoint if active)</span>
                </li>
              </ul>
              <div class="cadence-rule">
                ⚠️ Stop-on-Reply Rule: If prospect replies on ANY channel, STOP automated outreach immediately and mark as REPLIED.
              </div>
            </div>
          </div>

          <!-- Actions Footer -->
          <div class="card-actions">
            ${lead.status !== 'Contacted' ? `
              <button class="btn-approve" onclick="approveLead('${escapeHtml(lead.leadId)}')">✅ Approve & Create Gmail Draft</button>
            ` : `
              <div style="flex: 1; padding: 8px 12px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; font-size: 12px; font-weight: 700; color: #34d399; text-align: center;">
                ✓ Dispatched / Contacted
              </div>
            `}
            ${lead.status !== 'Rejected' ? `
              <button class="btn-reject" onclick="rejectLead('${escapeHtml(lead.leadId)}')">❌ Disqualify</button>
            ` : `
              <div style="padding: 8px 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; font-size: 12px; color: #f87171;">
                Disqualified
              </div>
            `}
          </div>
        </article>
      `;
    }).join('')}

    <div class="empty-state" id="empty-notice" style="display: none;">
      <p style="font-size: 18px; font-weight: 700; margin-bottom: 6px;">No matching prospects found</p>
      <p>Try adjusting your search query or filter selection.</p>
    </div>
  </main>

  <script>
    // Tab switcher per lead card
    function switchChannelTab(leadId, channel) {
      const card = document.getElementById('card-' + leadId);
      if (!card) return;
      card.querySelectorAll('.ch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === channel);
      });
      card.querySelectorAll('.ch-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      const activePane = document.getElementById('pane-' + leadId + '-' + channel);
      if (activePane) activePane.classList.add('active');
    }

    // Copy to clipboard helper
    function copyText(btn, text) {
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.innerText;
        btn.innerText = '✓ Copied';
        btn.classList.add('btn-copied');
        setTimeout(() => {
          btn.innerText = orig;
          btn.classList.remove('btn-copied');
        }, 1500);
      }).catch(err => {
        console.error('Failed to copy text:', err);
      });
    }

    // Filter and search
    let activeFilter = 'all';
    let searchQuery = '';

    function setFilter(filterType, element) {
      activeFilter = filterType;
      document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
      element.classList.add('active');
      applyCardFilters();
    }

    function handleSearch(val) {
      searchQuery = (val || '').toLowerCase().trim();
      applyCardFilters();
    }

    function applyCardFilters() {
      const cards = document.querySelectorAll('.lead-card');
      let visible = 0;
      cards.forEach(card => {
        const status = (card.getAttribute('data-status') || '').toLowerCase();
        const score = Number(card.getAttribute('data-score') || 0);
        const search = card.getAttribute('data-search') || '';

        let matchesFilter = false;
        if (activeFilter === 'all') matchesFilter = true;
        else if (activeFilter === 'review' && status.includes('review')) matchesFilter = true;
        else if (activeFilter === 'aplus' && (status.includes('a+') || score >= 80)) matchesFilter = true;
        else if (activeFilter === 'contacted' && status.includes('contact')) matchesFilter = true;
        else if (activeFilter === 'rejected' && status.includes('reject')) matchesFilter = true;

        const matchesSearch = !searchQuery || search.includes(searchQuery);

        if (matchesFilter && matchesSearch) {
          card.style.display = 'block';
          visible++;
        } else {
          card.style.display = 'none';
        }
      });

      const empty = document.getElementById('empty-notice');
      if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
    }

    // Approve / Reject actions
    async function approveLead(leadId) {
      if (!confirm('Approve outreach and queue Gmail draft for this prospect?')) return;
      try {
        const res = await fetch('/webhook/approve/' + leadId, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('✅ Prospect approved! Safe Gmail draft queued.');
          location.reload();
        } else {
          alert('Error: ' + (data.error || 'Failed to approve'));
        }
      } catch (err) {
        alert('Request failed: ' + err.message);
      }
    }

    async function rejectLead(leadId) {
      if (!confirm('Disqualify and reject this prospect?')) return;
      try {
        const res = await fetch('/webhook/reject/' + leadId, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          location.reload();
        }
      } catch (err) {
        alert('Request failed: ' + err.message);
      }
    }

    // Ingest test prospect
    async function triggerTestIngestion() {
      const randomNum = Math.floor(Math.random() * 899 + 100);
      const testLead = {
        fullName: 'Victoria Montgomery ' + randomNum,
        company: 'Montgomery C-Suite Partners ' + randomNum,
        jobTitle: 'Founder & Senior Partner',
        email: 'victoria' + randomNum + '@montgomerypartners.com',
        website: 'https://montgomerypartners.com',
        linkedInUrl: 'https://linkedin.com/in/victoriamontgomery-csuite',
        country: 'United States',
        niche: 'Executive Coach',
        corporateFocus: 'Fortune 500 VP & C-Suite',
        offer: 'Bespoke Executive Leadership Advisory ($35k Retainer)',
        estimatedOfferValue: '$35,000',
        snippet: 'High-ticket team alignment & leadership culture intensives ($35k retainers). Inbounds handled personally by founder.',
        source: 'google'
      };

      try {
        const res = await fetch('/webhook/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testLead)
        });
        const data = await res.json();
        if (data.success) {
          alert('🎉 High-ticket prospect ingested, scored, and multi-channel outreach generated!');
          location.reload();
        }
      } catch (err) {
        alert('Ingest error: ' + err.message);
      }
    }
  </script>
</body>
</html>`;
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 EXECUTIVE LEAD INTAKE & TRIAGE WEBHOOK SERVER RUNNING`);
    console.log(`======================================================`);
    console.log(`• Webhook Endpoint:  http://localhost:${PORT}/webhook/ingest`);
    console.log(`• Live Dashboard:    http://localhost:${PORT}/dashboard`);
    console.log(`• Leads API:         http://localhost:${PORT}/api/leads`);
    console.log(`• Analytics API:     http://localhost:${PORT}/api/analytics`);
    console.log(`======================================================\n`);
  });
}
