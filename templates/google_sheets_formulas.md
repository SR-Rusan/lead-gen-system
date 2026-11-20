# Google Sheets Operational Dashboard Setup & Formula Reference

This document outlines the spreadsheet architecture, formulas, and filter views to turn your Google Sheet (`GOOGLE_SHEET_ID: 1LvSouAG9b0dF5ndwqp7HckefIaBYZV4ePlm0L7_lIqw`) into a real-time operational dashboard.

---

## 1. Sheet Architecture (2 Tabs)

- **Tab 1: `Master_Prospects`**
  - Master operational database holding all 50 columns.
  - Receives leads from Make.com Scenario 1 and updates via Scenarios 2–7.
- **Tab 2: `Funnel_Analytics`**
  - Live summary of qualification rates, pipeline velocity, channel ROI, and conversion ratios.

---

## 2. Tab 2 Formulas (`Funnel_Analytics`)

Place these formulas in Tab 2 to dynamically calculate your business funnel metrics:

### Total Volume Metrics
- **Total Ingested Leads:**
  `=COUNTA(Master_Prospects!A2:A)`
- **A+ Prospects (Score >= 80):**
  `=COUNTIF(Master_Prospects!V2:V, ">=80")`
- **A Prospects (Score 65–79):**
  `=COUNTIFS(Master_Prospects!V2:V, ">=65", Master_Prospects!V2:V, "<80")`
- **B / Nurture Prospects (Score 50–64):**
  `=COUNTIFS(Master_Prospects!V2:V, ">=50", Master_Prospects!V2:V, "<65")`
- **Rejected Prospects (Score < 50):**
  `=COUNTIF(Master_Prospects!V2:V, "<50") - COUNTBLANK(Master_Prospects!V2:V)`
- **Ready for Review Queue:**
  `=COUNTIF(Master_Prospects!AN2:AN, "Ready for Review")`
- **Total Contacted:**
  `=COUNTIF(Master_Prospects!AN2:AN, "Contacted") + COUNTIF(Master_Prospects!AN2:AN, "Follow-up") + COUNTIF(Master_Prospects!AN2:AN, "Replied") + COUNTIF(Master_Prospects!AN2:AN, "Call Booked") + COUNTIF(Master_Prospects!AN2:AN, "Won")`

### Conversion & Velocity Metrics
- **Qualification Rate (%):**
  `=(COUNTIF(Master_Prospects!V2:V, ">=50") / COUNTA(Master_Prospects!A2:A)) * 100`
- **Inbound Reply Rate (%):**
  `=(COUNTIF(Master_Prospects!AS2:AS, "Yes") / B7) * 100` *(where B7 is Total Contacted)*
- **Positive Response Rate (%):**
  `=(COUNTIF(Master_Prospects!AT2:AT, "Yes") / COUNTIF(Master_Prospects!AS2:AS, "Yes")) * 100`
- **Sales Call Booking Rate (%):**
  `=(COUNTIF(Master_Prospects!AU2:AU, "Yes") / B7) * 100`
- **Proposal Rate (%):**
  `=(COUNTIF(Master_Prospects!AV2:AV, "Yes") / COUNTIF(Master_Prospects!AU2:AU, "Yes")) * 100`
- **Client Close Rate (%):**
  `=(COUNTIF(Master_Prospects!AW2:AW, "Won") / COUNTIF(Master_Prospects!AV2:AV, "Yes")) * 100`
- **Overall Lead-to-Client Rate (%):**
  `=(COUNTIF(Master_Prospects!AW2:AW, "Won") / COUNTA(Master_Prospects!A2:A)) * 100`

---

## 3. Recommended Filter Views in `Master_Prospects`

To operate without feeling overwhelmed by 50 columns, create these **Filter Views** in Google Sheets (`Data -> Filter Views -> Create New Filter View`):

1. **🌟 A+ Ready for Review**
   - Filter `Status (Column AN)` = `Ready for Review`
   - Sort `ICP Score (Column V)` = `Z -> A (Descending)`
2. **📬 Contacted & Awaiting Reply**
   - Filter `Status (Column AN)` = `Contacted`
   - Filter `Response (Column AS)` = `Empty`
3. **⏰ Follow-ups Due (>4 Days)**
   - Filter `Status (Column AN)` = `Contacted`
   - Filter `Date Contacted (Column AP)` = `Date is before -> Exact date -> [4 days ago]`
4. **🏆 Active Opportunities**
   - Filter `Status (Column AN)` = `Call Booked` OR `Proposal`

---

## 4. Conditional Formatting Rules

Apply these rules to **Column AN (`Status`)**:
- Value equals `A+` -> Background: `#D1E7DD` (Soft Green), Text: `#0F5132`
- Value equals `Ready for Review` -> Background: `#FFF3CD` (Soft Amber), Text: `#664D03`
- Value equals `Approved` -> Background: `#CFF4FC` (Soft Blue), Text: `#055160`
- Value equals `Call Booked` -> Background: `#D8B4FE` (Soft Purple), Text: `#581C87`
- Value equals `Won` -> Background: `#86EFAC` (Emerald Green), Text: `#14532D`
- Value equals `Rejected` -> Background: `#F8D7DA` (Soft Red), Text: `#842029`
