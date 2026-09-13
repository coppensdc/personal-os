/* ─────────────────────────────────────────────
   State & persistence
───────────────────────────────────────────── */
const STORAGE_KEY = 'personal-os-rocks-v1';

let rocks = [];
let expandedIds = new Set();

function boot() {
  const d = loadState(STORAGE_KEY, { rocks: [], expandedIds: [] });
  rocks = d.rocks || [];
  expandedIds = new Set(d.expandedIds || []);
}

function persist() {
  saveState(STORAGE_KEY, { rocks, expandedIds: [...expandedIds] });
}

/* ─────────────────────────────────────────────
   Computed helpers
───────────────────────────────────────────── */
function rockProgress(rock) {
  const total = rock.milestones.length;
  if (!total) return { done: 0, total: 0, pct: 0 };
  const done = rock.milestones.filter(m => m.complete).length;
  return { done, total, pct: Math.round(done / total * 100) };
}

function overallStats() {
  const totalRocks = rocks.length;
  const completeRocks = rocks.filter(r => r.status === 'complete').length;
  const allM = rocks.flatMap(r => r.milestones);
  const totalM = allM.length;
  const doneM = allM.filter(m => m.complete).length;
  const pct = totalM ? Math.round(doneM / totalM * 100) : 0;
  return { totalRocks, completeRocks, totalM, doneM, pct };
}

const STATUS_ORDER = ['on-track', 'off-track', 'complete'];
const STATUS_LABELS = {
  'on-track':  'On track',
  'off-track': 'Off track',
  'complete':  'Complete'
};
const STATUS_CLASSES = {
  'on-track':  'status-coral',
  'off-track': 'status-amber',
  'complete':  'status-neutral'
};

/* ─────────────────────────────────────────────
   SVG icons
───────────────────────────────────────────── */
const iconChevron = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,2 10,7 4,12"/></svg>`;

const iconPlus = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/></svg>`;

const iconTrash = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,3 12,3"/><path d="M5,3V2h3v1"/><path d="M2,3l1,9h7l1-9"/><line x1="5" y1="6" x2="5" y2="9"/><line x1="8" y1="6" x2="8" y2="9"/></svg>`;

const iconRock = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18l5-9 4 5 3-4 6 8H3z"/></svg>`;

/* ─────────────────────────────────────────────
   Actions
───────────────────────────────────────────── */
function addRock() {
  const rock = { id: uid(), title: '', status: 'on-track', milestones: [] };
  rocks.push(rock);
  expandedIds.add(rock.id);
  persist();
  render();
  setTimeout(() => {
    const el = document.querySelector(`[data-rock="${rock.id}"] .rock-title-input`);
    if (el) el.focus();
  }, 0);
}

function deleteRock(id) {
  if (!confirm('Delete this rock and all its milestones?')) return;
  rocks = rocks.filter(r => r.id !== id);
  expandedIds.delete(id);
  persist();
  render();
}

function cycleStatus(id) {
  const rock = rocks.find(r => r.id === id);
  if (!rock) return;
  const idx = STATUS_ORDER.indexOf(rock.status);
  rock.status = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
  persist();
  const status = document.querySelector(`[data-rock="${id}"] .status`);
  if (status) {
    status.className = `status ${STATUS_CLASSES[rock.status]}`;
    status.innerHTML = `<span class="status-dot"></span>${STATUS_LABELS[rock.status]}`;
  }
}

function toggleExpand(id) {
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
  persist();
  render();
}

function addMilestone(rockId) {
  const rock = rocks.find(r => r.id === rockId);
  if (!rock) return;
  const m = { id: uid(), title: '', complete: false, dueDate: '' };
  rock.milestones.push(m);
  persist();
  render();
  setTimeout(() => {
    const el = document.querySelector(`[data-milestone="${m.id}"] .milestone-title-input`);
    if (el) el.focus();
  }, 0);
}

function deleteMilestone(rockId, mId) {
  const rock = rocks.find(r => r.id === rockId);
  if (!rock) return;
  rock.milestones = rock.milestones.filter(m => m.id !== mId);
  persist();
  render();
}

function toggleMilestone(rockId, mId) {
  const rock = rocks.find(r => r.id === rockId);
  if (!rock) return;
  const m = rock.milestones.find(m => m.id === mId);
  if (!m) return;
  m.complete = !m.complete;
  persist();
  const row = document.querySelector(`[data-milestone="${mId}"]`);
  if (row) {
    const check = row.querySelector('.m-check');
    const titleInput = row.querySelector('.milestone-title-input');
    if (check) check.classList.toggle('checked', m.complete);
    if (titleInput) titleInput.classList.toggle('done', m.complete);
  }
  refreshProgressBars(rockId);
}

function refreshProgressBars(rockId) {
  const rock = rocks.find(r => r.id === rockId);
  if (!rock) return;
  const { done, total, pct } = rockProgress(rock);
  const card = document.querySelector(`[data-rock="${rockId}"]`);
  if (card) {
    const fill = card.querySelector('.mini-bar-fill');
    const count = card.querySelector('.mini-count');
    if (fill) fill.style.width = pct + '%';
    if (count) count.textContent = total ? `${done}/${total}` : '';
  }
  refreshOverviewStats();
}

function refreshOverviewStats() {
  const s = overallStats();
  const metric = document.getElementById('page-metric');
  const fill = document.getElementById('overview-fill');
  const counts = document.getElementById('counts-line');
  if (metric) metric.textContent = s.pct + '%';
  if (fill) fill.style.width = s.pct + '%';
  if (counts) counts.textContent = `${s.completeRocks}/${s.totalRocks} rocks complete   ${s.doneM}/${s.totalM} milestones done`;
}

/* ─────────────────────────────────────────────
   Inline edit handlers
───────────────────────────────────────────── */
function onRockTitleChange(id, val) {
  const rock = rocks.find(r => r.id === id);
  if (rock) { rock.title = val; persist(); }
}

function onMilestoneTitleChange(rockId, mId, val) {
  const rock = rocks.find(r => r.id === rockId);
  if (!rock) return;
  const m = rock.milestones.find(m => m.id === mId);
  if (m) { m.title = val; persist(); }
}

function onMilestoneDueChange(rockId, mId, val) {
  const rock = rocks.find(r => r.id === rockId);
  if (!rock) return;
  const m = rock.milestones.find(m => m.id === mId);
  if (m) { m.dueDate = val; persist(); }
}

/* ─────────────────────────────────────────────
   Render functions
───────────────────────────────────────────── */
function renderMilestone(rockId, m) {
  return `
    <div class="milestone-row" data-milestone="${m.id}">
      <div class="m-check ${m.complete ? 'checked' : ''}"
           onclick="toggleMilestone('${rockId}','${m.id}')"></div>
      <input
        class="milestone-title-input ${m.complete ? 'done' : ''}"
        type="text"
        value="${escapeHtml(m.title)}"
        placeholder="Milestone title"
        onclick="event.stopPropagation()"
        onchange="onMilestoneTitleChange('${rockId}','${m.id}',this.value)"
        onblur="onMilestoneTitleChange('${rockId}','${m.id}',this.value)"
        onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}"
      />
      <input
        class="milestone-due-input"
        type="text"
        value="${escapeHtml(m.dueDate || '')}"
        placeholder="Due date"
        onclick="event.stopPropagation()"
        onchange="onMilestoneDueChange('${rockId}','${m.id}',this.value)"
        onblur="onMilestoneDueChange('${rockId}','${m.id}',this.value)"
        onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}"
      />
      <button
        class="icon-btn del reveal-on-hover"
        title="Delete milestone"
        onclick="event.stopPropagation();deleteMilestone('${rockId}','${m.id}')"
      >${iconTrash}</button>
    </div>
  `;
}

function renderRock(rock) {
  const open = expandedIds.has(rock.id);
  const { done, total, pct } = rockProgress(rock);
  const sc = STATUS_CLASSES[rock.status] || 'badge-green';
  const sl = STATUS_LABELS[rock.status] || 'On Track';

  const progressHtml = total > 0
    ? `<div class="rock-progress-mini">
         <div class="progress-bar mini"><div class="progress-bar-fill mini-bar-fill" style="width:${pct}%"></div></div>
         <span class="mini-count">${done}/${total}</span>
       </div>`
    : `<div class="rock-progress-mini"><span class="mini-count"></span></div>`;

  const milestonesHtml = open ? `
    <div class="milestones-wrap">
      ${rock.milestones.length === 0
        ? '<div class="milestones-empty">No milestones yet — add one below</div>'
        : rock.milestones.map(m => renderMilestone(rock.id, m)).join('')
      }
      <button class="add-milestone-btn" onclick="addMilestone('${rock.id}')">
        ${iconPlus} Add milestone
      </button>
    </div>
  ` : '';

  return `
    <div class="rock-card row ${open ? 'open' : ''}" data-rock="${rock.id}">
      <div class="rock-header" onclick="handleHeaderClick(event,'${rock.id}')">
        <div class="chevron">${iconChevron}</div>
        <div class="rock-title-wrap">
          <input
            class="rock-title-input"
            type="text"
            value="${escapeHtml(rock.title)}"
            placeholder="Rock title"
            onchange="onRockTitleChange('${rock.id}',this.value)"
            onblur="onRockTitleChange('${rock.id}',this.value)"
            onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}"
            onclick="event.stopPropagation()"
          />
        </div>
        <div class="rock-right">
          ${progressHtml}
          <span class="status ${sc}"
                title="Click to cycle status"
                onclick="event.stopPropagation();cycleStatus('${rock.id}')"
          ><span class="status-dot"></span>${sl}</span>
          <button class="icon-btn del reveal-on-hover"
                  title="Delete rock"
                  onclick="event.stopPropagation();deleteRock('${rock.id}')"
          >${iconTrash}</button>
        </div>
      </div>
      ${milestonesHtml}
    </div>
  `;
}

function handleHeaderClick(event, rockId) {
  if (event.target.closest('input') ||
      event.target.closest('button') ||
      event.target.closest('.status')) return;
  toggleExpand(rockId);
}

function render() {
  const s = overallStats();
  const app = document.getElementById('app');

  app.innerHTML = `
    <header class="header">
      <div class="header-row">
        <div>
          <div class="eyebrow">${getQuarterLabel()}</div>
          <h1 class="page-title">Rocks</h1>
        </div>
        <div class="page-metric" id="page-metric">${s.pct}%</div>
      </div>
      <div class="metric-block">
        <div class="progress-bar"><div class="progress-bar-fill" id="overview-fill" style="width:${s.pct}%"></div></div>
        <div class="counts-line" id="counts-line">${s.completeRocks}/${s.totalRocks} rocks complete&nbsp;&nbsp;&nbsp;${s.doneM}/${s.totalM} milestones done</div>
      </div>
    </header>

    <div class="arcade-divider"></div>

    <div class="section-header">
      <span class="section-label">This quarter</span>
      <span class="section-count">${rocks.length} rock${rocks.length !== 1 ? 's' : ''}</span>
    </div>

    <div class="rocks-list">
      ${rocks.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">${iconRock}</div>
          <h3>No rocks for this quarter</h3>
          <p>Rocks are your 90-day priorities — the critical things that move your business forward.</p>
        </div>
      ` : rocks.map(renderRock).join('')}
    </div>

    <button class="add-item-btn" onclick="addRock()">
      ${iconPlus} Add rock
    </button>
  `;
}

/* ─────────────────────────────────────────────
   Boot
───────────────────────────────────────────── */
boot();
render();
