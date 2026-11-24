# System Re-Activation & Restart Guide

This document contains everything needed to resume, host, run, and operate the **Executive Lead Intake & Triage System** after a laptop restart or closing the session.

---

## 1. Fast Restart Commands (When You Re-Open the App)

Run these two commands to bring all services back online:

### Command 1: Start n8n Local Automation Engine (Port 5678)
```bash
cd "~/Documents/Google anti-gravity projects/lead-gen-system"
N8N_PORT=5678 N8N_HOST=localhost N8N_WEBHOOK_URL=http://localhost:5678/ ~/node/bin/n8n start
```

### Command 2: Start Webhook Server & Live Command Dashboard (Port 3001)
```bash
cd "~/Documents/Google anti-gravity projects/lead-gen-system"
npm run server
```

---

## 2. Live Access Points

Once started, your live control endpoints are:

* 📊 **Live Dashboard**: [http://localhost:3001/dashboard](http://localhost:3001/dashboard)
* ⚡ **n8n Automation Console**: [http://localhost:5678](http://localhost:5678)
* 📬 **Inbound Webhook API**: `http://localhost:3001/webhook/ingest`
* 📈 **Live Master Google Sheet**: [Master_Prospects Google Sheet](https://docs.google.com/spreadsheets/d/YOUR_GOOGLE_SHEET_ID/edit)
* 📄 **Presentation & Architecture Blueprint**: `docs/Executive_Lead_Intake_System_Presentation_Blueprint.md`

---

## 3. What Was Built & Saved in This Project

Everything has been committed to disk in your workspace directory (`~/Documents/Google anti-gravity projects/lead-gen-system`):

1. **Multi-Channel Personalization Engine**:
   * [`src/outreach/personalization.ts`](../src/outreach/personalization.ts): Single personalization layer generating Email (80–120w, A/B CTA testing), LinkedIn (3 touches), Instagram (2 touches), X (3 touches), or `not_recommended` tags. Includes Pre-Flight Validation (`validateOutreach`).
   * [`src/ai/prompts.ts`](../src/ai/prompts.ts): `SYSTEM_PROMPT_OMNI_PERSONALIZATION` enforcing Executive Lead Intake positioning ($10k–$50k deals, calendar defense, human approval).
   * [`src/ai/openrouter.ts`](../src/ai/openrouter.ts): OpenRouter integration with automated model fallback (`nvidia/nemotron-3-super-120b`, Claude 3.5 Sonnet, GPT-4o).
2. **6-Tier Deduplication & 0–100 ICP Scoring**:
   * [`src/dedup/dedup-engine.ts`](../src/dedup/dedup-engine.ts) & [`src/scoring/scoring-engine.ts`](../src/scoring/scoring-engine.ts).
3. **n8n Blueprint Workflows**:
   * [`n8n-workflows/executive_lead_triage_master.json`](../n8n-workflows/executive_lead_triage_master.json): Master intake, dedup, scoring, and 4-channel drafting workflow.
   * [`n8n-workflows/executive_lead_approval_dispatcher.json`](../n8n-workflows/executive_lead_approval_dispatcher.json): Human review approval & Gmail draft queue.
4. **Live Command Dashboard**:
   * [`src/webhook-server.ts`](../src/webhook-server.ts): Renders real-time KPI stats, search bar, status filter tabs, per-card multi-channel studio with copy buttons, and 1-click approve/reject buttons.
5. **Presentation Blueprint for Friends/Peers**:
   * [`docs/Executive_Lead_Intake_System_Presentation_Blueprint.md`](Executive_Lead_Intake_System_Presentation_Blueprint.md).

---

## 4. Useful Operational CLI Scripts

* **Run Test Personalization Engine**:
  `npx ts-node scripts/test_personalization_engine.ts`
* **Re-build n8n Workflows**:
  `node scripts/build_n8n_workflows.js`
* **Re-Sync Database to Google Sheet**:
  `npx ts-node scripts/batch_update_sheet.ts`
