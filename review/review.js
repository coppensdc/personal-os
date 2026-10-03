/* ─────────────────────────────────────────────
   Monday review — give each open to-do a day this week, re-plan what slipped,
   and go through Follow-ups. Writes item.plannedFor (YYYY-MM-DD or null) and
   the top-level lastReviewAt into To Do's own blob; To Do's Summary reads both.
───────────────────────────────────────────── */
const TODOS_KEY = 'personal-os-todos-v1';
const WAITING_NUDGE_DAYS = 5; // matches To Do's
const OPEN_SECTIONS = ['today', 'followups'];

let todos;

async function boot() {
  todos = await loadState(TODOS_KEY, {});
  normalize();
}

// Read-side guards only — To Do's owns migrations; this page never reshapes the blob.
function normalize() {
  if (!Array.isArray(todos.blocks)) todos.blocks = [];
}

function listOf(block, section) {
  return Array.isArray(block[section]) ? block[section] : [];
}

function persist() {
  saveState(TODOS_KEY, todos);
}

/* ── Dates ── */
function formatShortDate(iso) {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDueLabel(iso) {
  const today = todayISO();
  if (iso === today) return 'Due today';
  if (iso === addDaysISO(today, 1)) return 'Due tomorrow';
  if (iso < today) return 'Was due ' + formatShortDate(iso);
  return 'Due ' + formatShortDate(iso);
}

function weekDays() {
  const start = planWeekStartISO();
  return [0, 1, 2, 3, 4, 5, 6].map(n => addDaysISO(start, n));
}

function isBehind(item) {
  return !!item.plannedFor && item.plannedFor < todayISO();
}

function waitingDays(item) {
  return item.waiting && item.waitingSince ? daysBetweenISO(item.waitingSince, todayISO()) : 0;
}

/* ── Actions ── */
function findItem(blockId, section, id) {
  const block = todos.blocks.find(b => b.id === blockId);
  return block ? listOf(block, section).find(i => i.id === id) : null;
}

function setPlan(blockId, section, id, iso) {
  const item = findItem(blockId, section, id);
  if (!item) return;
  item.plannedFor = item.plannedFor === iso ? null : iso; // clicking the active day un-plans
  persist();
  render();
}

function clearPlan(blockId, section, id) {
  const item = findItem(blockId, section, id);
  if (!item) return;
  item.plannedFor = null;
  persist();
  render();
}

function finishReview() {
  todos.lastReviewAt = todayISO();
  persist();
  render();
}

/* ── Render ── */
function renderDayPicker(blockId, section, item, days) {
  const today = todayISO();
  const btns = days.map(d => `
    <button class="review-day ${item.plannedFor === d && d >= today ? 'active' : ''} ${d === today ? 'today' : ''}"
            ${d < today ? 'disabled' : ''} title="${formatShortDate(d)}"
            onclick="setPlan('${blockId}','${section}','${item.id}','${d}')">${weekdayShort(d)}</button>
  `).join('');
  return `<div class="review-days">${btns}</div>`;
}

function renderMeta(entry, { showBlock, days }) {
  const { block, section, item } = entry;
  const parts = [];
  if (showBlock) parts.push(`<span>${escapeHtml(block.name)}${section === 'followups' && showBlock !== 'plain' ? ' · Follow-up' : ''}</span>`);
  if (isBehind(item)) parts.push(`<span class="hot">Planned ${weekdayShort(item.plannedFor)} ${formatShortDate(item.plannedFor)}</span>`);
  else if (item.plannedFor && !days.includes(item.plannedFor)) parts.push(`<span>Planned ${formatShortDate(item.plannedFor)}</span>`);
  if (section === 'followups') {
    const d = waitingDays(item);
    if (item.waitingSince) parts.push(`<span class="${d >= WAITING_NUDGE_DAYS ? 'hot' : ''}">Waiting ${d}d</span>`);
  }
  if (item.dueDate) parts.push(`<span class="${item.dueDate <= addDaysISO(todayISO(), 1) ? 'hot' : ''}">${formatDueLabel(item.dueDate)}</span>`);
  if (item.priority) parts.push('<span class="hot">Priority</span>');
  return parts.length ? `<div class="review-meta">${parts.join('<span class="sep">·</span>')}</div>` : '';
}

function renderRow(entry, opts) {
  const { block, section, item } = entry;
  const planned = item.plannedFor && opts.days.includes(item.plannedFor);
  return `
    <div class="review-row row ${planned ? 'planned' : ''}">
      <div class="review-text-wrap">
        <div class="review-text">${escapeHtml(item.text)}</div>
        ${renderMeta(entry, opts)}
      </div>
      <div class="review-actions">
        ${renderDayPicker(block.id, section, item, opts.days)}
        <button class="review-clear ${item.plannedFor ? '' : 'hidden'}" title="${isBehind(item) ? 'Let it go — unplan' : 'Unplan'}"
                onclick="clearPlan('${block.id}','${section}','${item.id}')">Unplan</button>
      </div>
    </div>
  `;
}

function renderWeekStrip(days) {
  const today = todayISO();
  const counts = Object.fromEntries(days.map(d => [d, { open: 0, done: 0 }]));
  todos.blocks.forEach(b => {
    OPEN_SECTIONS.forEach(s => listOf(b, s).forEach(i => { if (counts[i.plannedFor]) counts[i.plannedFor].open++; }));
    listOf(b, 'done').forEach(i => { if (counts[i.plannedFor]) counts[i.plannedFor].done++; });
  });
  return `
    <div class="review-week">
      ${days.map(d => {
        const c = counts[d];
        const total = c.open + c.done;
        const slipped = d < today && c.open;
        return `
          <div class="review-week-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}">
            <span class="review-week-name">${weekdayShort(d)} ${parseISODate(d).getDate()}</span>
            <span class="review-week-count ${slipped ? 'hot' : ''}">${total || '–'}</span>
            <span class="review-week-sub">${slipped ? `${c.open} slipped` : c.done ? `${c.done} done` : '&nbsp;'}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSection(title, hint, entries, opts, emptyText) {
  return `
    <section class="review-section">
      <div class="section-header">
        <span class="review-section-title">${title}</span>
        <span class="section-count">${entries.length}</span>
      </div>
      ${hint ? `<p class="review-hint">${hint}</p>` : ''}
      <div class="review-list">
        ${entries.length ? entries.map(e => renderRow(e, opts)).join('') : `<div class="empty-state review-empty">${emptyText}</div>`}
      </div>
    </section>
  `;
}

function render() {
  const app = document.getElementById('app');
  const days = weekDays();
  const all = [];
  todos.blocks.forEach(block => OPEN_SECTIONS.forEach(section =>
    listOf(block, section).forEach(item => all.push({ block, section, item }))));

  const slipped = all.filter(e => isBehind(e.item));
  const followups = all.filter(e => e.section === 'followups' && !isBehind(e.item))
    .sort((a, b) => (a.item.waitingSince || '9999').localeCompare(b.item.waitingSince || '9999'));
  const todayEntries = all.filter(e => e.section === 'today' && !isBehind(e.item));
  const unplanned = todayEntries.filter(e => !e.item.plannedFor).length;

  const reviewedThisWeek = todos.lastReviewAt && planWeekStartISO(todos.lastReviewAt) >= days[0];

  app.innerHTML = `
    <header class="header">
      <div class="header-row">
        <div>
          <div class="eyebrow">Week of ${formatShortDate(days[0])}</div>
          <h1 class="page-title">Monday review</h1>
        </div>
        <div class="today-label">${todos.lastReviewAt ? `Last reviewed ${formatShortDate(todos.lastReviewAt)}` : 'Not reviewed yet'}</div>
      </div>
    </header>

    <div class="arcade-divider"></div>

    ${renderWeekStrip(days)}

    ${slipped.length ? renderSection('Slipped',
      'Planned for a day that has passed and still open. Pick a new day, or unplan it if it no longer matters this week.',
      slipped, { days, showBlock: true }, '') : ''}

    ${todos.blocks.map(block => {
      const entries = todayEntries.filter(e => e.block === block);
      const open = entries.filter(e => !e.item.plannedFor).length;
      return renderSection(escapeHtml(block.name),
        entries.length ? (open ? `${open} without a day` : 'Every item has a day') : '',
        entries, { days, showBlock: false }, 'Nothing open');
    }).join('')}

    ${renderSection('Follow-ups',
      "Things you are waiting on, oldest first. Pick a day to chase each one, or close it out in To Do's if it is resolved.",
      followups, { days, showBlock: 'plain' }, 'Nothing waiting on anyone')}

    <div class="review-finish">
      ${reviewedThisWeek
        ? `<span class="review-finish-done">Reviewed ${formatShortDate(todos.lastReviewAt)}${unplanned ? ` · ${unplanned} left without a day` : ''}</span>`
        : `<button class="review-finish-btn" onclick="finishReview()">Finish review</button>
           ${unplanned ? `<span class="review-finish-note">${unplanned} to-do${unplanned === 1 ? '' : 's'} still without a day — fine if that is on purpose.</span>` : ''}`}
      <a class="review-back" href="../todos/index.html">Back to To Do's</a>
    </div>
  `;
}

/* ── Boot ── */
boot().then(render);
watchState(TODOS_KEY, {}, fresh => {
  todos = fresh;
  normalize();
  render();
});
