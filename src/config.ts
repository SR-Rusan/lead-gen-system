import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const CONFIG = {
  // AI / OpenRouter Configuration
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    // Stage 1: Ultra-fast and cheap model for high-volume triage/scoring ($0.15 / 1M tokens)
    modelFast: process.env.OPENROUTER_MODEL_FAST || 'openai/gpt-4o-mini',
    // Stage 2: Strong reasoning model for deep prospect research and evidence extraction
    modelResearch: process.env.OPENROUTER_MODEL_RESEARCH || 'anthropic/claude-3.5-haiku',
    // Stage 3: High-capacity fallback or complex cases
    modelFallback: process.env.OPENROUTER_MODEL_FALLBACK || 'openai/gpt-4o-mini',
    timeoutMs: parseInt(process.env.OPENROUTER_TIMEOUT_MS || '30000', 10),
    maxRetries: 3,
  },

  // Discovery / Scraping APIs
  apify: {
    token: process.env.APIFY_TOKEN || '',
    // Verified free/low-cost actors for public search & profiles
    googleSearchActor: process.env.APIFY_ACTOR_GOOGLE || 'apify/google-search-scraper',
    linkedinScraperActor: process.env.APIFY_ACTOR_LINKEDIN || 'curious_coder/linkedin-post-search-scraper',
    instagramActor: process.env.APIFY_ACTOR_INSTAGRAM || 'apify/instagram-profile-scraper',
    xActor: process.env.APIFY_ACTOR_X || 'apidojo/tweet-scraper',
    maxResultsPerQuery: parseInt(process.env.APIFY_MAX_RESULTS || '15', 10),
  },

  serper: {
    apiKey: process.env.SERPER_API_KEY || '',
    baseUrl: 'https://google.serper.dev/search',
    countries: ['us', 'gb', 'ca', 'au'],
    numResults: 20,
  },

  // Google Sheets Master Database
  google: {
    sheetId: process.env.GOOGLE_SHEET_ID || '1LvSouAG9b0dF5ndwqp7HckefIaBYZV4ePlm0L7_lIqw',
    sheetTabName: process.env.GOOGLE_SHEET_TAB_NAME || 'Master_Prospects',
    analyticsTabName: process.env.GOOGLE_SHEET_ANALYTICS_TAB || 'Funnel_Analytics',
    credentialsDir: process.env.GDRIVE_CREDS_DIR || '/Users/rusan/.config/gdrive',
  },

  // Human-in-the-Loop Telegram Notifications & Approval
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enableApprovalButtons: true,
  },

  // Gmail Dispatch (Safe draft generation or human-approved sending)
  gmail: {
    userEmail: process.env.GMAIL_USER_EMAIL || '',
    appPassword: process.env.GMAIL_APP_PASSWORD || '',
    fromName: process.env.GMAIL_FROM_NAME || 'Executive Lead Intake',
    draftModeOnly: process.env.GMAIL_DRAFT_MODE !== 'false', // Defaults to TRUE for safety!
  },

  // Make.com Integration Endpoints (eu2.make.com)
  make: {
    baseUrl: 'https://eu2.make.com/api/v2',
    apiKey: process.env.MAKE_API_KEY || '',
    organizationId: process.env.MAKE_ORGANIZATION_ID || '',
    teamId: process.env.MAKE_TEAM_ID || '',
    webhooks: {
      ingestion: process.env.MAKE_WEBHOOK_INGESTION_URL || '',
      qualification: process.env.MAKE_WEBHOOK_QUALIFICATION_URL || '',
      approval: process.env.MAKE_WEBHOOK_APPROVAL_URL || '',
      dispatch: process.env.MAKE_WEBHOOK_DISPATCH_URL || '',
    },
  },

  // Scoring Thresholds (Section 5)
  thresholds: {
    aPlus: 80, // A+ Prospect (Immediate priority)
    a: 65,     // A Prospect (Qualified)
    b: 50,     // B / Nurture
    // Below 50 is Rejected
  },

  // Operational Guardrails & Business Settings (Section 24, 28)
  limits: {
    dailyOutreachTarget: parseInt(process.env.DAILY_OUTREACH_TARGET || '10', 10),
    maxResearchPerDay: parseInt(process.env.MAX_RESEARCH_PER_DAY || '25', 10),
    maxProspectsPerRun: parseInt(process.env.MAX_PROSPECTS_PER_RUN || '50', 10),
  },

  // Target ICP Keywords and Geographic Focus (Section 4, 26)
  targetAudience: {
    niches: [
      'Executive Coach',
      'Leadership Coach',
      'Leadership Development Consultant',
      'Corporate Leadership Trainer',
      'High-Ticket Advisory Firm',
    ],
    targetCountries: ['United States', 'United Kingdom', 'Canada', 'Australia'],
    minEstimatedDealValueUsd: 10000,
  },
};
