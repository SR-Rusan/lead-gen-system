/**
 * The leads dashboard page. Static shell; all lead data is fetched from /api/leads and rendered with
 * textContent (lead data comes from scraped websites, so it is never inserted as HTML).
 */
export function renderDashboard(opts: { canLogout: boolean; gmailConnected: boolean; draftsTo: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Leads · Axioms Digital</title>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=3">
<link rel="icon" type="image/png" sizes="512x512" href="/favicon.png?v=3">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--ink:#252B31;--ink2:#4A5157;--grey:#707879;--faint:#9AA0A3;--line:#E6E3EC;--soft:#F6F4F9;--p:#8B6CB8;--p-dark:#74579F;--on-p:#fff;--bg:#fff;--warn:#A4513F;color-scheme:light}
:root[data-theme="dark"]{--ink:#E9E7EE;--ink2:#C2C4C8;--grey:#959A9E;--faint:#6E7377;--line:#2B2F36;--soft:#1B1E23;--p:#A88DD3;--p-dark:#BBA4DE;--on-p:#16181C;--bg:#121418;--warn:#E09A86;color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#E9E7EE;--ink2:#C2C4C8;--grey:#959A9E;--faint:#6E7377;--line:#2B2F36;--soft:#1B1E23;--p:#A88DD3;--p-dark:#BBA4DE;--on-p:#16181C;--bg:#121418;--warn:#E09A86;color-scheme:dark}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}
a{color:inherit}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
.serif{font-family:"Instrument Serif",Georgia,serif;font-weight:400}

header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:28px 32px 18px;border-bottom:1px solid var(--line)}
.brand{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--p);font-family:"JetBrains Mono",monospace}
h1{font-size:44px;line-height:1;letter-spacing:-.01em;margin-top:6px}
h1 i{color:var(--p)}
.counts{color:var(--grey);font-size:13px;margin-top:10px}
.top-actions{display:flex;gap:6px;align-items:center}
.btn{border:1px solid var(--line);background:var(--bg);border-radius:8px;padding:8px 14px;cursor:pointer;font-size:14px;transition:background .15s,border-color .15s}
.btn:hover{background:var(--soft)}
.btn:active{transform:translateY(1px)}
.btn:focus-visible,.tab:focus-visible,.row:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--p);outline-offset:1px}
.btn.primary{background:var(--p);border-color:var(--p);color:var(--on-p);font-weight:500}
.btn.primary:hover{background:var(--p-dark)}
.btn.quiet{border-color:transparent;color:var(--grey)}
.btn.quiet:hover{color:var(--warn);background:transparent}
.btn[disabled]{opacity:.45;cursor:not-allowed}

.bar{display:flex;gap:18px;align-items:center;justify-content:space-between;padding:0 32px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.tabs{display:flex;gap:22px;overflow-x:auto}
.tab{background:none;border:0;padding:14px 0 12px;border-bottom:2px solid transparent;cursor:pointer;color:var(--grey);white-space:nowrap;font-size:14px}
.tab b{font-weight:500;font-family:"JetBrains Mono",monospace;font-size:12px;margin-left:4px}
.tab.on{color:var(--ink);border-bottom-color:var(--p)}
.search{border:1px solid var(--line);border-radius:8px;padding:7px 12px;width:260px;max-width:100%;font-size:14px;background:var(--bg);color:var(--ink)}

main{display:grid;grid-template-columns:minmax(300px,380px) 1fr;min-height:calc(100dvh - 170px)}
.list{border-right:1px solid var(--line);overflow-y:auto;max-height:calc(100dvh - 170px)}
.row{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:14px 20px 14px 30px;border:0;border-bottom:1px solid var(--line);border-left:2px solid transparent;cursor:pointer;background:var(--bg);color:var(--ink);width:100%;text-align:left}
.row:hover{background:var(--soft)}
.row.on{background:var(--soft);border-left-color:var(--p)}
.row .name{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .sub{grid-column:1;color:var(--grey);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .score{grid-row:1/3;grid-column:2;align-self:center;text-align:right;font-family:"JetBrains Mono",monospace;font-size:13px;color:var(--ink2)}
.row .score small{display:block;font-size:11px;color:var(--faint)}
.empty{padding:40px 30px;color:var(--grey)}

.detail{padding:28px 40px 60px;overflow-y:auto;max-height:calc(100dvh - 170px)}
.back{display:none}
.d-name{font-size:38px;line-height:1.05}
.d-company{color:var(--grey);margin-top:6px}
.links{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:14px;font-size:13px}
.links a{color:var(--ink2);text-decoration:none;border-bottom:1px solid var(--line)}
.links a:hover{border-color:var(--p);color:var(--ink)}
.section{margin-top:30px}
.label{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--p);margin-bottom:10px}
.fit{display:flex;gap:14px;align-items:baseline}
.fit .num{font-family:"Instrument Serif",serif;font-size:40px;line-height:1;color:var(--p)}
.fit p{color:var(--ink2);max-width:62ch}
ul.facts{list-style:none;display:grid;gap:6px;max-width:72ch}
ul.facts li{padding-left:14px;position:relative;color:var(--ink2);font-size:14px}
ul.facts li:before{content:"";position:absolute;left:0;top:.65em;width:5px;height:1px;background:var(--faint)}
.field{display:grid;gap:5px;margin-bottom:12px;max-width:720px}
.field span{font-size:12px;color:var(--grey)}
.field input,.field textarea,.field select{border:1px solid var(--line);border-radius:8px;padding:9px 12px;background:var(--bg);color:var(--ink);width:100%}
.field textarea{min-height:300px;resize:vertical;line-height:1.6}
.field textarea.notes{min-height:90px}
.row-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;max-width:720px}
.hint{font-size:13px;color:var(--grey)}
.wc{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--faint);text-align:right}
.status-line{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.pill{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--ink2);border:1px solid var(--line);border-radius:6px;padding:2px 8px}
.progress{display:flex;align-items:center;gap:12px;padding:12px 32px;border-bottom:1px solid var(--line);background:var(--soft);font-size:13px;color:var(--ink2)}
.progress[hidden]{display:none}
.progress .dot{width:8px;height:8px;border-radius:50%;background:var(--p);animation:pulse 1.2s ease-in-out infinite}
.progress.done .dot{animation:none;background:var(--ink2)}
@keyframes pulse{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.progress .dot{animation:none}}
.bulk{padding:14px 20px 14px 30px;border-bottom:1px solid var(--line);display:grid;gap:8px}
.sent-today{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--grey)}
.look{border-left:2px solid var(--warn);padding-left:14px}
.look .label{color:var(--warn)}
.pill.good{border-color:var(--p);color:var(--p)}
.pill.bad{border-color:var(--warn);color:var(--warn)}
.sig{color:var(--p)}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:8px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100% - 32px)}
.toast.show{opacity:1}

@media (max-width:860px){
  header{padding:20px 16px 14px;flex-wrap:wrap}
  h1{font-size:36px}
  .bar{padding:0 16px}
  .progress{padding:10px 16px}
  .top-actions{width:100%}
  .search{width:100%;margin-bottom:10px}
  main{grid-template-columns:1fr}
  .list,.detail{max-height:none}
  .row{padding:14px 16px}
  .detail{padding:20px 16px 48px;display:none}
  body.reading .list{display:none}
  body.reading .detail{display:block}
  .back{display:inline-block;margin-bottom:16px}
}
</style>
</head>
<body>
<header>
  <div>
    <div class="brand">Axioms Digital</div>
    <h1 class="serif">Leads <i>to work</i></h1>
    <div class="counts mono" id="counts">Loading…</div>
    <div class="sent-today" id="sent-today"></div>
  </div>
  <div class="top-actions">
    <button class="btn primary" id="find" type="button">Find leads</button>
    <button class="btn" id="theme" type="button" aria-label="Switch light or dark mode">Dark</button>
    <button class="btn" id="sync" type="button" title="Reads rusan@ Sent and Inbox: marks sent leads Contacted, replies Replied, bounces Lost">Check inbox</button>
    <button class="btn" id="refresh" type="button">Refresh</button>
    ${opts.canLogout ? '<form method="POST" action="/logout"><button class="btn quiet" type="submit">Sign out</button></form>' : ''}
  </div>
</header>
<div class="progress" id="progress" hidden>
  <span class="dot" aria-hidden="true"></span>
  <span id="progress-text" class="mono">Starting…</span>
  <button class="btn quiet" id="stop" type="button">Stop</button>
</div>
<div class="bar">
  <nav class="tabs" id="tabs" aria-label="Lead groups"></nav>
  <input class="search" id="search" type="search" placeholder="Search name, company, email" aria-label="Search leads">
</div>
<main>
  <section class="list" id="list" aria-label="Leads"></section>
  <section class="detail" id="detail" aria-live="polite"></section>
</main>
<div class="toast" id="toast" role="status"></div>

<script>
const GMAIL = ${opts.gmailConnected ? 'true' : 'false'};
const DRAFTS_TO = ${JSON.stringify(opts.draftsTo)};
const GROUPS = [
  { id: 'review', label: 'To review', statuses: ['A+','A','B','Ready for Review','Qualified','Raw','Researching'] },
  { id: 'look', label: 'Needs a look', statuses: null, test: (l) => Boolean(l.needsLook) && !l.emailsSent && ['A+','A','B','Ready for Review','Qualified','Approved'].includes(l.status) },
  { id: 'drafted', label: 'Drafted', statuses: ['Approved'] },
  { id: 'due', label: 'Follow-up due', statuses: null, test: (l) => l.next && l.next.step > 0 && l.next.due && l.next.due <= today() },
  { id: 'contacted', label: 'Contacted', statuses: ['Contacted','Follow-up'] },
  { id: 'replied', label: 'Replied', statuses: ['Replied','Positive','Call Booked','Proposal'] },
  { id: 'won', label: 'Won', statuses: ['Won'] },
  { id: 'closed', label: 'Not a fit', statuses: ['Rejected','Lost','Nurture'] },
  { id: 'all', label: 'All', statuses: null },
];
const STATUS_OPTIONS = [
  ['Ready for Review','To review'],['Approved','Drafted in Gmail'],['Contacted','Sent / contacted'],['Follow-up','Followed up'],
  ['Replied','Replied'],['Positive','Interested'],['Call Booked','Call booked'],['Proposal','Proposal sent'],['Won','Won'],['Lost','Lost'],['Rejected','Not a fit'],
];
let VERIFIER = false, BACKUP = true;
function today() { return new Date().toISOString().split('T')[0]; }
let leads = [], group = 'review', query = '', selected = null, loaded = false;
const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
  return n;
}
function safeUrl(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } }
function groupOf(l) { const g = GROUPS.find((g) => g.statuses && g.statuses.includes(l.status)); return g ? g.id : 'review'; }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3800); }
function displayName(l) { return l.fullName && l.fullName !== l.company ? l.fullName : (l.company || l.fullName || l.website); }
function splitDraft(t) { const lines = String(t || '').split('\\n'); if (/^subject:/i.test(lines[0] || '')) return { subject: lines[0].replace(/^subject:\\s*/i, '').trim(), body: lines.slice(1).join('\\n').trim() }; return { subject: '', body: String(t || '').trim() }; }
function words(s) { return (s.trim().match(/\\S+/g) || []).length; }

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}
async function load(keepId) {
  const data = await api('/api/leads');
  leads = data.leads.sort((a, b) => (b.icpScore || 0) - (a.icpScore || 0));
  VERIFIER = Boolean(data.verifier);
  if (keepId) selected = keepId;
  loaded = true;
  render();
}

function render() {
  const inGroup = (l, g) => g.test ? g.test(l) : g.statuses ? groupOf(l) === g.id : true;
  const counts = Object.fromEntries(GROUPS.map((g) => [g.id, leads.filter((l) => inGroup(l, g)).length]));
  $('counts').textContent = counts.review + ' to review · ' + counts.contacted + ' contacted · ' + counts.due + ' follow-ups due · ' + counts.replied + ' replied';
  $('tabs').replaceChildren(...GROUPS.map((g) => el('button', { class: 'tab' + (g.id === group ? ' on' : ''), type: 'button', onclick: () => { group = g.id; selected = null; document.body.classList.remove('reading'); render(); } }, g.label, el('b', { text: String(counts[g.id]) }))));

  const q = query.toLowerCase();
  const g = GROUPS.find((x) => x.id === group) || GROUPS[0];
  const shown = leads.filter((l) => inGroup(l, g) && (!q || [l.fullName, l.company, l.email, l.website].join(' ').toLowerCase().includes(q)));
  if (!shown.some((l) => l.leadId === selected) && window.innerWidth > 860) selected = shown[0] ? shown[0].leadId : null;

  const bulk = group === 'due' && shown.length
    ? el('div', { class: 'bulk' }, el('button', { class: 'btn primary', type: 'button', onclick: (e) => sendAllDue(e.currentTarget, shown.length) }, 'Send all due (' + shown.length + ')'), el('p', { class: 'hint', text: 'Short nudges, threaded under your first email, spaced a few seconds apart.' }))
    : null;
  const backupBox = group === 'due' ? el('label', { class: 'bulk hint', style: 'display:flex;gap:8px;align-items:center;cursor:pointer' },
      el('input', { type: 'checkbox', checked: BACKUP ? 'checked' : false, onchange: (e) => setBackup(e.currentTarget.checked) }),
      'If I forget, send due follow-ups automatically at 11 pm Dhaka') : null;
  $('list').replaceChildren(...(bulk ? [bulk] : []), ...(backupBox ? [backupBox] : []), ...(shown.length ? shown.map((l) => el('button', { class: 'row' + (l.leadId === selected ? ' on' : ''), type: 'button', onclick: () => { selected = l.leadId; document.body.classList.add('reading'); render(); window.scrollTo(0, 0); } },
    el('span', { class: 'name' }, l.recentBusinessSignal ? el('span', { class: 'sig', title: l.recentBusinessSignal, text: '● ' }) : null, displayName(l)),
    el('span', { class: 'sub', text: [l.company !== displayName(l) ? l.company : '', l.email || 'no email yet', l.country].filter(Boolean).join(' · ') }),
    el('span', { class: 'score', text: String(l.icpScore || 0) }, el('small', { text: l.status === 'Rejected' ? 'not a fit' : (l.status || '') })))) : [el('p', { class: 'empty', text: 'Nothing here.' })]));

  renderDetail(leads.find((l) => l.leadId === selected));
}

function renderDetail(l) {
  const d = $('detail');
  if (!l) { d.replaceChildren(el('p', { class: 'empty', text: 'Pick a lead.' })); return; }
  const draft = splitDraft(l.draftEmail);
  const facts = String(l.verifiedEvidence || '').split(/;\\s*/).map((s) => s.replace(/^VERIFIED FACT:\\s*/i, '').trim()).filter(Boolean).slice(0, 5);
  const links = [
    safeUrl(l.website) && el('a', { href: safeUrl(l.website), target: '_blank', rel: 'noopener', text: l.website.replace(/^https?:\\/\\//, '') + ' ↗' }),
    l.email && el('a', { href: 'mailto:' + encodeURIComponent(l.email), text: l.email }),
    safeUrl(l.linkedInUrl) && el('a', { href: safeUrl(l.linkedInUrl), target: '_blank', rel: 'noopener', text: 'LinkedIn ↗' }),
    safeUrl(l.instagramUrl) && el('a', { href: safeUrl(l.instagramUrl), target: '_blank', rel: 'noopener', text: 'Instagram ↗' }),
  ].filter(Boolean);

  const to = el('input', { type: 'email', value: l.email || '', placeholder: 'name@their-domain.com' });
  const subject = el('input', { type: 'text', value: draft.subject });
  const body = el('textarea', {}); body.value = draft.body;
  const wc = el('div', { class: 'wc', text: words(body.value) + ' words' });
  body.addEventListener('input', () => { wc.textContent = words(body.value) + ' words'; });
  const status = el('select', {}, STATUS_OPTIONS.map(([v, t]) => el('option', { value: v, text: t, selected: (l.status === v || (v === 'Ready for Review' && groupOf(l) === 'review')) ? 'selected' : false })));
  const notes = el('textarea', { class: 'notes' }); notes.value = l.notes || '';

  const fields = () => ({ email: to.value.trim(), draftEmail: (subject.value.trim() ? 'Subject: ' + subject.value.trim() + '\\n' : '') + body.value.trim() });
  async function save(extra, msg) {
    await api('/api/leads/' + encodeURIComponent(l.leadId), Object.assign(fields(), extra || {}));
    toast(msg || 'Saved.');
    await load(l.leadId);
  }
  async function draftInGmail(btn) {
    if (!to.value.trim()) { toast('Add an email address first.'); return; }
    if (l.status === 'Approved' && !confirm('A draft was already made for this lead. Make another one?')) return;
    btn.disabled = true;
    try {
      await api('/api/leads/' + encodeURIComponent(l.leadId), fields());
      const r = await api('/webhook/approve/' + encodeURIComponent(l.leadId), {});
      toast(r.message || 'Done.');
      await load(l.leadId);
    } catch (e) { toast(e.message); btn.disabled = false; }
  }
  async function sendNow(btn) {
    if (!to.value.trim()) { toast('Add an email address first.'); return; }
    const flagged = l.needsLook && fields().draftEmail.trim() === String(l.draftEmail || '').trim();
    if (!confirm(flagged ? 'This email failed a check:\\n\\n' + l.needsLook + '\\n\\nSend it anyway to ' + to.value.trim() + '?' : 'Send this email to ' + to.value.trim() + ' now?')) return;
    btn.disabled = true;
    try {
      await api('/api/leads/' + encodeURIComponent(l.leadId), fields());
      const r = await api('/api/leads/' + encodeURIComponent(l.leadId) + '/send', { override: Boolean(flagged) });
      toast(r.message); await load(l.leadId); loadSendStatus();
    } catch (e) { toast(e.message); btn.disabled = false; }
  }
  const canSend = GMAIL && l.email && !l.emailsSent && !l.sharedInbox && l.emailVerificationStatus !== 'invalid' && groupOf(l) !== 'closed';
  const sendBtn = el('button', { class: 'btn primary', type: 'button', disabled: canSend ? false : 'disabled', title: l.sharedInbox ? 'Shared inbox: not sent, by your rule.' : l.emailsSent ? 'Already sent.' : false, onclick: (e) => sendNow(e.currentTarget) }, 'Send');
  const gmailBtn = el('button', { class: 'btn', type: 'button', disabled: !GMAIL || !l.email || l.emailsSent ? 'disabled' : false, title: l.emailsSent ? 'Already sent. Use the follow-up button below.' : false, onclick: (e) => draftInGmail(e.currentTarget) }, 'Create draft');

  d.replaceChildren(...[
    el('button', { class: 'btn back', type: 'button', onclick: () => { document.body.classList.remove('reading'); selected = null; render(); } }, '← All leads'),
    el('h2', { class: 'd-name serif', text: displayName(l) }),
    el('p', { class: 'd-company', text: [l.company !== displayName(l) ? l.company : '', l.jobTitle, l.country].filter(Boolean).join(' · ') }),
    el('div', { class: 'links' }, links),

    el('div', { class: 'section' }, el('div', { class: 'label', text: 'Fit' }),
      el('div', { class: 'fit' }, el('span', { class: 'num', text: String(l.icpScore || 0) }), el('p', { text: l.qualificationReason || '' }))),
    facts.length ? el('div', { class: 'section' }, el('div', { class: 'label', text: 'From their site' }), el('ul', { class: 'facts' }, facts.map((f) => el('li', { text: f.slice(0, 260) })))) : null,
    l.recentBusinessSignal ? el('div', { class: 'section' }, el('div', { class: 'label', text: 'Buying signals' }), el('ul', { class: 'facts' }, String(l.recentBusinessSignal).split(/;\\s*/).map((f) => el('li', { text: f })))) : null,
    l.leadCaptureMethod ? el('div', { class: 'section' }, el('div', { class: 'label', text: 'How they take inquiries' }), el('p', { class: 'hint', text: l.leadCaptureMethod })) : null,

    l.needsLook && !l.emailsSent ? el('div', { class: 'section look' }, el('div', { class: 'label', text: 'Needs a look' }),
      el('ul', { class: 'facts' }, String(l.needsLook).split(/;\\s*/).map((f) => el('li', { text: f }))),
      el('div', { class: 'row-actions', style: 'margin-top:10px' },
        el('button', { class: 'btn', type: 'button', onclick: () => save({ clearLook: true }, 'Marked as checked.').catch((e) => toast(e.message)) }, 'I checked it, looks fine'),
        el('span', { class: 'hint', text: 'Or edit the email below and press Save.' }))) : null,
    el('div', { class: 'section' }, el('div', { class: 'label', text: 'Email' }),
      el('label', { class: 'field' }, el('span', { text: 'To' }), to),
      l.email ? el('div', { class: 'status-line', style: 'margin:-4px 0 14px' },
        el('span', { class: 'pill' + (l.emailVerificationStatus === 'verified' ? ' good' : l.emailVerificationStatus === 'invalid' ? ' bad' : ''), text: ({ verified: 'address verified', invalid: 'address invalid', 'catch-all': 'catch-all server', unknown: 'could not verify' })[l.emailVerificationStatus] || 'not verified' }),
        l.sharedInbox ? el('span', { class: 'pill bad', text: 'shared inbox' }) : null,
        VERIFIER ? el('button', { class: 'btn', type: 'button', onclick: (e) => { e.currentTarget.disabled = true; api('/api/leads/' + encodeURIComponent(l.leadId) + '/verify', {}).then((r) => { toast(r.message); return load(l.leadId); }).catch((err) => toast(err.message)); } }, 'Check address') : null) : null,
      el('label', { class: 'field' }, el('span', { text: 'Subject' }), subject),
      el('label', { class: 'field' }, el('span', { text: 'Message' }), body, wc),
      el('div', { class: 'row-actions' },
        sendBtn,
        gmailBtn,
        el('button', { class: 'btn', type: 'button', onclick: () => save(null, 'Email saved.').catch((e) => toast(e.message)) }, 'Save'),
        el('button', { class: 'btn quiet', type: 'button', onclick: () => save({ status: 'Rejected' }, 'Moved to Not a fit.').catch((e) => toast(e.message)) }, 'Not a fit')),
      el('p', { class: 'hint', style: 'margin-top:10px', text: !GMAIL ? 'No mailbox is connected.' : !l.email ? 'No email address yet. Add one above, or reach them on LinkedIn.' : 'Send goes out now from rusan@ (a copy lands in Sent). Create draft only saves it to ' + DRAFTS_TO + '.' })),

    (l.emailsSent || ['Contacted', 'Follow-up'].includes(l.status)) ? el('div', { class: 'section' }, el('div', { class: 'label', text: 'Follow-ups' }),
      el('p', { class: 'hint', text: (l.emailsSent ? l.emailsSent + (l.emailsSent === 1 ? ' email' : ' emails') + ' sent, last on ' + String(l.lastSentAt || '').slice(0, 10) : 'Not seen in Sent yet') + (l.followUp1 ? ' · nudge due ' + l.followUp1 + ' · last one due ' + l.followUp2 : '') }),
      l.next && l.next.step > 0
        ? el('div', { class: 'row-actions', style: 'margin-top:10px' },
            el('button', { class: 'btn primary', type: 'button', disabled: l.next.due <= today() ? false : 'disabled', onclick: (e) => { const b = e.currentTarget; if (!confirm('Send follow-up ' + l.next.step + ' to ' + l.email + ' now?')) return; b.disabled = true; api('/api/leads/' + encodeURIComponent(l.leadId) + '/send-followup', {}).then((r) => { toast(r.message); loadSendStatus(); return load(l.leadId); }).catch((err) => { toast(err.message); b.disabled = false; }); } }, 'Send follow-up ' + l.next.step),
            el('button', { class: 'btn', type: 'button', onclick: (e) => { const b = e.currentTarget; b.disabled = true; api('/api/leads/' + encodeURIComponent(l.leadId) + '/followup', {}).then((r) => { toast(r.message); return load(l.leadId); }).catch((err) => { toast(err.message); b.disabled = false; }); } }, 'Save as draft'),
            el('span', { class: 'hint', text: l.next.due <= today() ? 'Due now.' : 'Due ' + l.next.due + '.' }))
        : el('p', { class: 'hint', style: 'margin-top:6px', text: l.next ? l.next.why : '' })) : null,
    el('div', { class: 'section' }, el('div', { class: 'label', text: 'Progress' }),
      el('label', { class: 'field' }, el('span', { text: 'Status' }), status),
      el('label', { class: 'field' }, el('span', { text: 'Notes' }), notes),
      el('div', { class: 'row-actions' }, el('button', { class: 'btn', type: 'button', onclick: () => api('/api/leads/' + encodeURIComponent(l.leadId), { status: status.value, notes: notes.value }).then(() => { toast('Progress saved.'); return load(l.leadId); }).catch((e) => toast(e.message)) }, 'Save progress'))),
  ].filter(Boolean));
}

window.addEventListener('resize', () => { if (loaded && window.innerWidth > 860 && !selected) render(); });
let finding = false;
function progress(text, done) {
  const p = $('progress'); p.hidden = false; p.classList.toggle('done', Boolean(done));
  $('progress-text').textContent = text; $('stop').hidden = Boolean(done);
}
async function findLeads() {
  if (finding) return;
  finding = true; $('find').disabled = true;
  let checked = 0, good = 0, withEmail = 0;
  try {
    const st = await api('/api/finder/status');
    if (!st.ready) throw new Error('The lead finder is not set up on the server yet.');
    if (st.pending === 0) {
      progress('Searching Google for coaches in 3 countries. This takes 1–2 minutes…');
      const s = await api('/api/finder/search', {});
      if (s.pending === 0) { progress('No new coach websites this time. Try again later.', true); return; }
      progress('Found ' + s.pending + ' new websites (searched ' + (s.countries || []).join(', ').toUpperCase() + '). Reading them now…');
    } else {
      progress('Carrying on with ' + st.pending + ' websites from last time…');
    }
    while (finding) {
      const r = await api('/api/finder/next', {});
      checked += r.checked.length;
      const fresh = r.checked.filter((c) => c.status && c.status !== 'Rejected');
      good += fresh.length; withEmail += fresh.filter((c) => c.email).length;
      progress('Checked ' + checked + ' websites · ' + good + (good === 1 ? ' good lead (' : ' good leads (') + withEmail + ' with email) · ' + r.pending + ' left');
      if (fresh.length) await load(selected);
      if (r.pending === 0 || r.checked.length === 0) break;
    }
    progress((finding ? 'Done. ' : 'Stopped. ') + good + (good === 1 ? ' new lead' : ' new leads') + ' added to To review.', true);
    group = 'review'; await load(selected);
  } catch (e) {
    progress('Stopped: ' + e.message, true);
  } finally {
    finding = false; $('find').disabled = false;
  }
}
$('find').addEventListener('click', findLeads);
function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function themeLabel() { $('theme').textContent = isDark() ? 'Light' : 'Dark'; }
$('theme').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) {}
  themeLabel();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeLabel);
themeLabel();
$('stop').addEventListener('click', () => { finding = false; progress('Stopping after the current websites…'); });
$('search').addEventListener('input', (e) => { query = e.target.value; render(); });
async function syncInbox(quiet) {
  const b = $('sync'); b.disabled = true;
  try {
    const r = await api('/api/mailbox/sync', {});
    const bits = [];
    if (r.replies.length) bits.push(r.replies.length + ' new ' + (r.replies.length === 1 ? 'reply' : 'replies') + ': ' + r.replies.join(', '));
    if (r.bounces.length) bits.push(r.bounces.length + ' bounced: ' + r.bounces.join(', '));
    if (r.contacted) bits.push(r.contacted + ' marked contacted');
    if (r.autoReplies.length) bits.push(r.autoReplies.length + ' auto-replies noted');
    if (bits.length || !quiet) toast(bits.length ? bits.join(' · ') : 'Inbox checked. Nothing new.');
    await load(selected);
  } catch (e) { if (!quiet) toast(e.message); }
  finally { b.disabled = false; }
}
$('sync').addEventListener('click', () => syncInbox(false));
async function loadSendStatus() {
  try { const s = await api('/api/send/status'); BACKUP = s.backup !== false; $('sent-today').textContent = 'Sent today: ' + s.first + ' new (limit ' + s.firstCap + ') · ' + s.followUps + ' follow-ups · 11 pm backup ' + (BACKUP ? 'on' : 'off'); } catch (e) {}
}
async function setBackup(on) {
  try { await api('/api/settings/backup', { on }); BACKUP = on; toast(on ? 'Backup on: due follow-ups go out at 11 pm Dhaka if you forget.' : 'Backup off: nothing goes out unless you press Send.'); loadSendStatus(); }
  catch (e) { toast(e.message); render(); }
}
async function sendAllDue(btn, n) {
  if (!confirm('Send ' + n + ' follow-up' + (n === 1 ? '' : 's') + ' now? Each is a short nudge in the same thread.')) return;
  btn.disabled = true; btn.textContent = 'Sending… (about ' + Math.ceil(n * 10 / 60) + ' min)';
  try { const r = await api('/api/followups/send-due', {}); toast(r.message + (r.failed.length ? ' ' + r.failed.join(' · ') : '')); }
  catch (e) { toast(e.message); }
  loadSendStatus(); await load(selected);
}
const qs = new URLSearchParams(location.search); if (qs.get('tab')) group = qs.get('tab');
$('refresh').addEventListener('click', () => load(selected).then(() => toast('Up to date.')).catch((e) => toast(e.message)));
load().then(() => { loadSendStatus(); if (GMAIL) syncInbox(true); }).catch((e) => { $('counts').textContent = 'Could not load leads: ' + e.message; });
</script>
</body>
</html>`;
}
