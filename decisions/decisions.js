/* ─────────────────────────────────────────────
   Decision journal — log a call with your reasoning and confidence,
   then grade it on a review date so you learn how calibrated you are.
───────────────────────────────────────────── */
const STORAGE_KEY = 'personal-os-decisions-v1';
const DEFAULT_REVIEW_DAYS = 90;
const CONFIDENCE_STEPS = [50, 60, 70, 80, 90, 95];
const VERDICTS = [
  { key: 'right', label: 'Right call' },
  { key: 'mixed', label: 'Mixed' },
  { key: 'wrong', label: 'Wrong call' },
];

let state;
let expandedId = null;

async function boot() {
  state = await loadState(STORAGE_KEY, {});
  if (!Array.isArray(state.decisions)) state.decisions = [];
}

function persist() {
  saveState(STORAGE_KEY, state);
}

function find(id) {
  return state.decisions.find(d => d.id === id);
}

function isDue(d) {
  return !d.verdict && d.reviewOn && d.reviewOn <= todayISO();
}

/* ── Actions ── */
function onAddKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const title = e.target.value.trim();
  if (!title) return;
  const d = {
    id: uid(), title, decidedOn: todayISO(), context: '', expected: '', confidence: 70,
    reviewOn: addDaysISO(todayISO(), DEFAULT_REVIEW_DAYS), outcome: '', verdict: null, lessons: '', reviewedOn: null,
  };
  state.decisions.unshift(d);
  expandedId = d.id;
  persist();
  render();
  document.querySelector(`.decision[data-id="${d.id}"] textarea`)?.focus();
}

function toggleExpand(id) {
  expandedId = expandedId === id ? null : id;
  render();
}

// Text fields persist without re-rendering so typing isn't interrupted.
function setField(id, field, value) {
  const d = find(id);
  if (!d) return;
  d[field] = field === 'confidence' ? Number(value) : value;
  persist();
  if (field === 'reviewOn' || field === 'confidence' || field === 'title') render();
}

function setVerdict(id, verdict) {
  const d = find(id);
  if (!d) return;
  d.verdict = d.verdict === verdict ? null : verdict;
  d.reviewedOn = d.verdict ? todayISO() : null;
  persist();
  render();
}

function deleteDecision(id) {
  const d = find(id);
  if (!d || !confirm(`Delete "${d.title}"? This can't be undone.`)) return;
  state.decisions = state.decisions.filter(x => x.id !== id);
  persist();
  render();
}

/* ── Render ── */
const iconChevron = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,2 10,7 4,12"/></svg>`;
const iconTrash = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,3 12,3"/><path d="M5,3V2h3v1"/><path d="M2,3l1,9h7l1-9"/><line x1="5" y1="6" x2="5" y2="9"/><line x1="8" y1="6" x2="8" y2="9"/></svg>`;
const iconPlus = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="6.5" y1="1.5" x2="6.5" y2="11.5"/><line x1="1.5" y1="6.5" x2="11.5" y2="6.5"/></svg>`;

function shortDate(iso) {
  return iso ? parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function metaLine(d) {
  if (d.verdict) return `${VERDICTS.find(v => v.key === d.verdict).label} · ${d.confidence}% confident`;
  if (isDue(d)) return `<span class="decision-due">Review due</span> · ${d.confidence}% confident`;
  return `${d.confidence}% confident · review ${shortDate(d.reviewOn)}`;
}

function field(d, key, label, placeholder) {
  return `
    <label class="decision-field">
      <span class="decision-label">${label}</span>
      <textarea class="decision-textarea" rows="2" placeholder="${placeholder}"
        oninput="autoGrow(this); setField('${d.id}','${key}',this.value)">${escapeHtml(d[key] || '')}</textarea>
    </label>`;
}

function renderDecision(d) {
  const open = expandedId === d.id;
  return `
    <div class="decision row ${open ? 'open' : ''}" data-id="${d.id}">
      <div class="decision-header" onclick="toggleExpand('${d.id}')">
        <span class="chevron ${open ? 'open' : ''}">${iconChevron}</span>
        <span class="decision-title-wrap">
          <span class="decision-title">${escapeHtml(d.title)}</span>
          <span class="decision-meta">${shortDate(d.decidedOn)} · ${metaLine(d)}</span>
        </span>
      </div>
      ${open ? `
        <div class="decision-body">
          <label class="decision-field">
            <span class="decision-label">Decision</span>
            <input class="decision-input" value="${escapeHtml(d.title)}" onchange="setField('${d.id}','title',this.value.trim()||'Untitled')">
          </label>
          ${field(d, 'context', 'Why — what I know and what I\'m weighing', 'The facts, the options, the tradeoff…')}
          ${field(d, 'expected', 'What I expect to happen', 'Be specific enough to be proven wrong')}
          <div class="decision-inline">
            <label class="decision-field">
              <span class="decision-label">Confidence</span>
              <select class="decision-select" onchange="setField('${d.id}','confidence',this.value)">
                ${CONFIDENCE_STEPS.map(c => `<option value="${c}" ${c === d.confidence ? 'selected' : ''}>${c}%</option>`).join('')}
              </select>
            </label>
            <label class="decision-field">
              <span class="decision-label">Review on</span>
              <input class="decision-input" type="date" value="${d.reviewOn || ''}" onchange="setField('${d.id}','reviewOn',this.value)">
            </label>
          </div>

          <div class="decision-review ${isDue(d) || d.verdict ? '' : 'later'}">
            <div class="decision-review-title">Review</div>
            ${field(d, 'outcome', 'What actually happened', '')}
            <div class="decision-field">
              <span class="decision-label">Verdict</span>
              <div class="decision-verdicts">
                ${VERDICTS.map(v => `<button class="decision-verdict ${d.verdict === v.key ? 'active' : ''}" onclick="setVerdict('${d.id}','${v.key}')">${v.label}</button>`).join('')}
              </div>
            </div>
            ${field(d, 'lessons', 'What I\'d do differently', '')}
          </div>

          <div class="decision-actions">
            <button class="icon-btn del" title="Delete decision" onclick="deleteDecision('${d.id}')">${iconTrash}</button>
          </div>
        </div>
      ` : ''}
    </div>`;
}

// Calibration: were you right about as often as you felt you would be?
function calibrationLine() {
  const reviewed = state.decisions.filter(d => d.verdict);
  if (!reviewed.length) return '';
  const score = reviewed.reduce((n, d) => n + (d.verdict === 'right' ? 1 : d.verdict === 'mixed' ? 0.5 : 0), 0);
  const hit = Math.round(score / reviewed.length * 100);
  const conf = Math.round(reviewed.reduce((n, d) => n + d.confidence, 0) / reviewed.length);
  const gap = hit - conf;
  const read = Math.abs(gap) < 10 ? 'well calibrated' : gap < 0 ? 'overconfident' : 'underconfident';
  return `${reviewed.length} reviewed · right ${hit}% of the time at ${conf}% average confidence — ${read}`;
}

function group(label, list, extraClass = '') {
  if (!list.length) return '';
  return `
    <section class="decision-group ${extraClass}">
      <div class="section-header"><span class="section-label">${label}</span><span class="section-count">${list.length}</span></div>
      ${list.map(renderDecision).join('')}
    </section>`;
}

function render() {
  const due = state.decisions.filter(isDue).sort((a, b) => a.reviewOn.localeCompare(b.reviewOn));
  const open = state.decisions.filter(d => !d.verdict && !isDue(d)).sort((a, b) => (a.reviewOn || '').localeCompare(b.reviewOn || ''));
  const reviewed = state.decisions.filter(d => d.verdict).sort((a, b) => (b.reviewedOn || '').localeCompare(a.reviewedOn || ''));
  const calib = calibrationLine();

  document.getElementById('app').innerHTML = `
    <header class="header">
      <div class="header-row">
        <div>
          <div class="eyebrow">Think it through</div>
          <h1 class="page-title">Decisions</h1>
        </div>
        <div class="today-label">${getTodayLabel()}</div>
      </div>
      ${calib ? `<div class="decision-calibration">${calib}</div>` : ''}
    </header>

    <div class="arcade-divider"></div>

    <div class="decision-add-row">
      <span class="decision-add-icon">${iconPlus}</span>
      <input class="decision-add-input" placeholder="Log a decision… (e.g. Pass on Acme Series B)" onkeydown="onAddKey(event)">
    </div>

    ${state.decisions.length ? `
      ${group('Due for review', due, 'due')}
      ${group('Open', open)}
      ${group('Reviewed', reviewed)}
    ` : `<div class="empty-state"><p>Log a decision when you make it. In ${DEFAULT_REVIEW_DAYS} days it comes back here to grade.</p></div>`}
  `;
  document.querySelectorAll('.decision-textarea').forEach(autoGrow);
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

boot().then(render);
