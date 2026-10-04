/* ─────────────────────────────────────────────
   Review — do it any time (Monday is the default). Give open to-dos a day this
   week, push the rest to next week, re-plan what slipped, decide on what's been
   lingering, and go through Follow-ups. Writes only plan fields (see
   shared/js/plan.js), lastReviewAt, and — for lingering items — deletes, into
   To Do's own blob; To Do's Summary reads all of it.
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

function waitingDays(item) {
  return item.waiting && item.waitingSince ? daysBetweenISO(item.waitingSince, todayISO()) : 0;
}

/* ── Actions ── */
function findItem(blockId, section, id) {
  const block = todos.blocks.find(b => b.id === blockId);
  return block ? listOf(block, section).find(i => i.id === id) : null;
}

function update(blockId, section, id, fn) {
  const item = findItem(blockId, section, id);
  if (!item) return;
  fn(item);
  persist();
  render();
}

function setPlan(blockId, section, id, iso) {
  update(blockId, section, id, item => {
    item.plannedFor = item.plannedFor === iso ? null : iso; // clicking the active day un-plans
    if (item.plannedFor) bringItemBack(item);
  });
}

function clearPlan(blockId, section, id) {
  update(blockId, section, id, item => { item.plannedFor = null; });
}

function pushItem(blockId, section, id) {
  update(blockId, section, id, pushItemToNextWeek);
}

function bringBack(blockId, section, id) {
  update(blockId, section, id, bringItemBack);
}

// "Push the rest": every item in the block's list still without a day this week.
function pushUnplanned(blockId) {
  const block = todos.blocks.find(b => b.id === blockId);
  if (!block) return;
  listOf(block, 'today').filter(i => inBlockList(i) && !plannedThisWeek(i)).forEach(pushItemToNextWeek);
  persist();
  render();
}

function deleteItem(blockId, section, id) {
  const block = todos.blocks.find(b => b.id === blockId);
  const item = block && findItem(blockId, section, id);
  if (!item || !confirm(`Delete "${item.text}"? It won't go to Done.`)) return;
  block[section] = listOf(block, section).filter(i => i.id !== id);
  persist();
  render();
}

function finishReview() {
  todos.lastReviewAt = todayISO();
  persist();
  render();
}

/* ── Buckets ── */
function plannedThisWeek(item) {
  const days = weekDays();
  return !!item.plannedFor && item.plannedFor >= days[0] && item.plannedFor <= days[6];
}

// Today items that belong in their block's own section (not slipped/lingering/pushed).
function inBlockList(item) {
  return !isBehind(item) && !isLingering(item) && !isPushed(item);
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
  if (section === 'today') {
    const age = itemAgeDays(item);
    if (age >= 7) parts.push(`<span class="${age >= LINGER_DAYS ? 'hot' : ''}">Open ${age}d</span>`);
  }
  if (item.deferCount) parts.push(`<span class="${item.deferCount >= LINGER_PUSHES ? 'hot' : ''}">Pushed ${item.deferCount}×</span>`);
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
  const args = `'${block.id}','${section}','${item.id}'`;
  const planned = item.plannedFor && opts.days.includes(item.plannedFor);
  const actions = opts.pushed
    ? `<button class="review-link" onclick="bringBack(${args})">Bring back</button>`
    : `${renderDayPicker(block.id, section, item, opts.days)}
       <button class="review-link" title="Week of ${formatShortDate(nextPlanWeekISO())}" onclick="pushItem(${args})">Next week</button>
       ${opts.canDelete
         ? `<button class="review-link" onclick="deleteItem(${args})">Delete</button>`
         : `<button class="review-link ${item.plannedFor ? '' : 'hidden'}" onclick="clearPlan(${args})">Unplan</button>`}`;
  return `
    <div class="review-row row ${planned ? 'planned' : ''}">
      <div class="review-text-wrap">
        <div class="review-text">${escapeHtml(item.text)}</div>
        ${renderMeta(entry, opts)}
      </div>
      <div class="review-actions">${actions}</div>
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

function renderSection(title, hint, entries, opts, emptyText, extra = '') {
  return `
    <section class="review-section">
      <div class="section-header">
        <span class="review-section-title">${title}</span>
        <span class="section-count">${entries.length}</span>
      </div>
      ${hint || extra ? `<div class="review-hint-row">${hint ? `<p class="review-hint">${hint}</p>` : ''}${extra}</div>` : ''}
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
  const pushed = all.filter(e => isPushed(e.item));
  const lingering = all.filter(e => e.section === 'today' && isLingering(e.item))
    .sort((a, b) => itemAgeDays(b.item) - itemAgeDays(a.item));
  const followups = all.filter(e => e.section === 'followups' && !isBehind(e.item) && !isPushed(e.item))
    .sort((a, b) => (a.item.waitingSince || '9999').localeCompare(b.item.waitingSince || '9999'));
  const blockEntries = all.filter(e => e.section === 'today' && inBlockList(e.item));
  const unplanned = blockEntries.filter(e => !plannedThisWeek(e.item)).length;

  app.innerHTML = `
    <header class="header">
      <div class="header-row">
        <div>
          <div class="eyebrow">Week of ${formatShortDate(days[0])}</div>
          <h1 class="page-title">Review</h1>
        </div>
        <div class="today-label">${todos.lastReviewAt ? `Last reviewed ${formatShortDate(todos.lastReviewAt)}` : 'Not reviewed yet'}</div>
      </div>
    </header>

    <div class="arcade-divider"></div>

    ${renderWeekStrip(days)}

    ${slipped.length ? renderSection('Slipped',
      'Planned for a day that has passed and still open. Pick a new day, push it, or unplan it.',
      slipped, { days, showBlock: true }, '') : ''}

    ${lingering.length ? renderSection('Lingering',
      `Open ${LINGER_DAYS}+ days or pushed ${LINGER_PUSHES}+ times. Another push won't fix it — do it, schedule it, hand it off, or delete it.`,
      lingering, { days, showBlock: true, canDelete: true }, '') : ''}

    ${todos.blocks.map(block => {
      const entries = blockEntries.filter(e => e.block === block);
      const open = entries.filter(e => !plannedThisWeek(e.item)).length;
      return renderSection(escapeHtml(block.name),
        entries.length ? (open ? `${open} without a day` : 'Every item has a day') : '',
        entries, { days, showBlock: false }, 'Nothing to plan',
        open ? `<button class="review-link review-bulk" onclick="pushUnplanned('${block.id}')">Push the rest to next week</button>` : '');
    }).join('')}

    ${renderSection('Follow-ups',
      "Things you are waiting on, oldest first. Pick a day to chase each one, or close it out in To Do's if it is resolved.",
      followups, { days, showBlock: 'plain' }, 'Nothing waiting on anyone')}

    ${pushed.length ? `
      <details class="review-pushed" open>
        <summary>Pushed to next week <span class="section-count">${pushed.length}</span></summary>
        <div class="review-list">${pushed.map(e => renderRow(e, { days, showBlock: true, pushed: true })).join('')}</div>
      </details>
    ` : ''}

    <div class="review-finish">
      ${todos.lastReviewAt === todayISO()
        ? `<span class="review-finish-done">Reviewed today${unplanned ? ` · ${unplanned} left without a day` : ''}</span>`
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
