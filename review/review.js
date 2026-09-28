/* ─────────────────────────────────────────────
   Weekly review — read-only view over To Do's data
   (never writes, so it can't clobber To Do's from a stale tab)
───────────────────────────────────────────── */
const TODOS_KEY = 'personal-os-todos-v1';
const STALE_DAYS = 14;
const WAITING_NUDGE_DAYS = 5; // matches To Do's

let todos;
let weekOffset = 0; // 0 = this week, -1 = last week, …

async function boot() {
  todos = await loadState(TODOS_KEY, {});
  if (!Array.isArray(todos.blocks)) todos.blocks = [];
}

/* ── Week math (Monday–Sunday, local time, YYYY-MM-DD strings) ── */
function weekRange(offset) {
  const today = new Date();
  const mondayShift = (today.getDay() + 6) % 7; // Sun=6, Mon=0
  const start = addDaysISO(todayISO(), -mondayShift + offset * 7);
  return { start, end: addDaysISO(start, 6) };
}

function shortDate(iso) {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function weekdayOf(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleDateString('en-US', { weekday: 'short' });
}

/* ── Collect ── */
function doneInWeek({ start, end }) {
  return todos.blocks.map(block => ({
    block,
    items: (block.done || [])
      .filter(i => i.completedAt && isoDate(new Date(i.completedAt)) >= start && isoDate(new Date(i.completedAt)) <= end)
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt)),
  })).filter(g => g.items.length);
}

function openItems(filter) {
  const out = [];
  todos.blocks.forEach(block => (block.today || []).forEach(item => { if (filter(item)) out.push({ block, item }); }));
  return out;
}

function ageDays(item) {
  return item.createdAt ? daysBetweenISO(isoDate(new Date(item.createdAt)), todayISO()) : 0;
}

function waitingDays(item) {
  return item.waitingSince ? daysBetweenISO(item.waitingSince, todayISO()) : 0;
}

/* ── Actions ── */
function shiftWeek(delta) {
  weekOffset = Math.min(0, weekOffset + delta);
  render();
}

function copyAsText() {
  const range = weekRange(weekOffset);
  const groups = doneInWeek(range);
  const lines = [`Week of ${shortDate(range.start)} – ${shortDate(range.end)}`, ''];
  if (!groups.length) lines.push('Nothing completed.');
  groups.forEach(({ block, items }) => {
    lines.push(`${block.name} (${items.length})`);
    items.forEach(i => lines.push(`- ${i.text}${i.note ? ` — ${i.note}` : ''}`));
    lines.push('');
  });
  const text = lines.join('\n').trim();
  const done = () => flashButton('Copied');
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  done();
}

function flashButton(label) {
  const btn = document.getElementById('review-copy');
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = label;
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

/* ── Render ── */
const iconLeft = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="8.5,2 4,6.5 8.5,11"/></svg>`;
const iconRight = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4.5,2 9,6.5 4.5,11"/></svg>`;

function blockName(block) {
  return `<span class="review-block-name" ${block.color ? `style="color:${escapeHtml(block.color)}"` : ''}>${escapeHtml(block.name)}</span>`;
}

function renderOpenList(entries, labelFn, empty) {
  if (!entries.length) return `<div class="review-empty">${empty}</div>`;
  return entries.map(({ block, item }) => `
    <div class="review-row row">
      <span class="review-text">${escapeHtml(item.text)}</span>
      <span class="review-meta">${labelFn(item)}</span>
      <span class="review-tag">${escapeHtml(block.name)}</span>
    </div>`).join('');
}

function render() {
  const range = weekRange(weekOffset);
  const groups = doneInWeek(range);
  const doneCount = groups.reduce((n, g) => n + g.items.length, 0);
  const isThisWeek = weekOffset === 0;

  const stale = openItems(i => ageDays(i) >= STALE_DAYS).sort((a, b) => ageDays(b.item) - ageDays(a.item));
  const waiting = openItems(i => i.waiting).sort((a, b) => waitingDays(b.item) - waitingDays(a.item));

  document.getElementById('app').innerHTML = `
    <header class="header">
      <div class="header-row">
        <div>
          <div class="eyebrow">Look back</div>
          <h1 class="page-title">Weekly review</h1>
        </div>
        <div class="page-metric">${doneCount}<span class="review-metric-label"> done</span></div>
      </div>
    </header>

    <div class="arcade-divider"></div>

    <div class="review-weekbar">
      <button class="icon-btn" title="Previous week" onclick="shiftWeek(-1)">${iconLeft}</button>
      <span class="review-week-label">${isThisWeek ? 'This week' : weekOffset === -1 ? 'Last week' : 'Week of'} · ${shortDate(range.start)} – ${shortDate(range.end)}</span>
      <button class="icon-btn" title="Next week" onclick="shiftWeek(1)" ${isThisWeek ? 'disabled' : ''}>${iconRight}</button>
      <button class="review-copy" id="review-copy" onclick="copyAsText()" ${doneCount ? '' : 'hidden'}>Copy as text</button>
    </div>

    <section class="review-section">
      <div class="section-header"><span class="section-label">Done</span><span class="section-count">${doneCount}</span></div>
      ${groups.length ? groups.map(({ block, items }) => `
        <div class="review-group">
          <div class="review-group-title">${blockName(block)}<span class="section-count">${items.length}</span></div>
          ${items.map(i => `
            <div class="review-row row">
              <span class="review-day">${weekdayOf(i.completedAt)}</span>
              <span class="review-text">${escapeHtml(i.text)}${i.note ? `<span class="review-note">${escapeHtml(i.note)}</span>` : ''}</span>
            </div>`).join('')}
        </div>`).join('') : `<div class="review-empty">Nothing marked done ${isThisWeek ? 'yet this week' : 'that week'}.</div>`}
    </section>

    ${isThisWeek ? `
      <section class="review-section">
        <div class="section-header"><span class="section-label">Waiting on others</span><span class="section-count">${waiting.length}</span></div>
        ${renderOpenList(waiting, i => {
          const d = waitingDays(i);
          return `<span class="${d >= WAITING_NUDGE_DAYS ? 'review-hot' : ''}">${d ? `${d}d` : 'Today'}</span>`;
        }, 'Nothing waiting.')}
      </section>

      <section class="review-section">
        <div class="section-header"><span class="section-label">Sitting in Today for ${STALE_DAYS}+ days</span><span class="section-count">${stale.length}</span></div>
        <p class="review-hint">Do it, schedule it, move it to Backlog, or delete it.</p>
        ${renderOpenList(stale, i => `${ageDays(i)}d`, 'Nothing stale. Good.')}
      </section>
    ` : ''}
  `;
}

boot().then(render);
