/* ─────────────────────────────────────────────
   Ideas — a queue of improvements for the weekly Claude run to build.
   The list lives in Supabase (personal-os-ideas-v1, the one row readable
   without sign-in so the run can see it); what got built lives in log.js,
   which only changes through that run's merged pull requests.
───────────────────────────────────────────── */
const STORAGE_KEY = 'personal-os-ideas-v1';
const PULLS_URL = 'https://github.com/coppensdc/personal-os/pulls';
const LOG = Array.isArray(window.IDEAS_LOG) ? window.IDEAS_LOG : [];

let state;
let notesOpenId = null;
let dragging = null;

async function boot() {
  state = await loadState(STORAGE_KEY, {});
  normalize();
}

// Stamp ideas the log says were built, so Home's open count (which doesn't load
// log.js) and the run itself both see them as done.
function normalize() {
  if (!Array.isArray(state.ideas)) state.ideas = [];
  let changed = false;
  LOG.forEach(entry => {
    const idea = entry.ideaId && state.ideas.find(i => i.id === entry.ideaId);
    if (idea && !idea.shipped) { idea.shipped = entry.date; changed = true; }
  });
  if (changed) persist();
}

function persist() {
  saveState(STORAGE_KEY, state);
}

function find(id) {
  return state.ideas.find(i => i.id === id);
}

/* ── Actions ── */
function onAddKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const text = e.target.value.trim();
  if (!text) return;
  state.ideas.push({ id: uid(), text, notes: '', createdAt: new Date().toISOString(), shipped: null });
  persist();
  render();
  document.querySelector('.idea-add-input')?.focus();
}

// Text fields persist without re-rendering so typing isn't interrupted.
function setField(id, field, value) {
  const idea = find(id);
  if (!idea) return;
  idea[field] = value;
  persist();
}

function toggleNotes(id) {
  notesOpenId = notesOpenId === id ? null : id;
  render();
  if (notesOpenId) document.querySelector(`.idea[data-id="${id}"] .idea-notes`)?.focus();
}

function deleteIdea(id) {
  const idea = find(id);
  if (!idea || !confirm(`Delete "${idea.text}"?`)) return;
  state.ideas = state.ideas.filter(i => i.id !== id);
  persist();
  render();
}

// Tap-friendly alternative to dragging — touch devices have no drag handle.
function moveToTop(id) {
  const idea = find(id);
  if (!idea) return;
  state.ideas = [idea, ...state.ideas.filter(i => i !== idea)];
  persist();
  render();
}

/* ── Drag to reorder (top of the list = what Claude builds next) ── */
function onDragStart(e, id) {
  dragging = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  e.target.closest('.idea').classList.add('dragging');
}

function onDragOver(e) {
  if (!dragging) return;
  e.preventDefault();
  const list = document.getElementById('idea-list');
  const el = list.querySelector(`.idea[data-id="${dragging}"]`);
  const after = [...list.querySelectorAll('.idea:not(.dragging)')]
    .find(row => e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2);
  list.insertBefore(el, after || null);
}

function onDrop(e) {
  if (!dragging) return;
  e.preventDefault();
  const order = [...document.querySelectorAll('#idea-list .idea')].map(row => row.dataset.id);
  const byId = Object.fromEntries(state.ideas.map(i => [i.id, i]));
  const shipped = state.ideas.filter(i => i.shipped);
  state.ideas = [...order.map(id => byId[id]).filter(Boolean), ...shipped];
  persist();
}

function onDragEnd() {
  dragging = null;
  render();
}

/* ── Render ── */
const iconPlus = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="6.5" y1="1.5" x2="6.5" y2="11.5"/><line x1="1.5" y1="6.5" x2="11.5" y2="6.5"/></svg>`;
const iconTrash = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,3 12,3"/><path d="M5,3V2h3v1"/><path d="M2,3l1,9h7l1-9"/><line x1="5" y1="6" x2="5" y2="9"/><line x1="8" y1="6" x2="8" y2="9"/></svg>`;
const iconNotes = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="3" x2="11" y2="3"/><line x1="2" y1="6.5" x2="11" y2="6.5"/><line x1="2" y1="10" x2="7.5" y2="10"/></svg>`;
const iconTop = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="1.75" x2="11" y2="1.75"/><line x1="6.5" y1="4.5" x2="6.5" y2="11.5"/><polyline points="3.5,7.5 6.5,4.5 9.5,7.5"/></svg>`;
const iconGrip = `<svg width="10" height="14" viewBox="0 0 10 14"><g fill="currentColor"><circle cx="3" cy="3" r="1.1"/><circle cx="7" cy="3" r="1.1"/><circle cx="3" cy="7" r="1.1"/><circle cx="7" cy="7" r="1.1"/><circle cx="3" cy="11" r="1.1"/><circle cx="7" cy="11" r="1.1"/></g></svg>`;

function shortDate(iso) {
  return iso ? parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function renderIdea(idea, index) {
  const notesOpen = notesOpenId === idea.id;
  return `
    <div class="idea row" data-id="${idea.id}">
      <div class="idea-main">
        <span class="idea-handle" draggable="true" title="Drag to reorder"
          ondragstart="onDragStart(event,'${idea.id}')" ondragend="onDragEnd()">${iconGrip}</span>
        <textarea class="idea-text" rows="1"
          oninput="autoGrow(this)" onchange="setField('${idea.id}','text',this.value.trim()||'Untitled')"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtml(idea.text)}</textarea>
        ${index === 0
          ? '<span class="idea-next">Next up</span>'
          : `<button class="icon-btn reveal-on-hover" title="Move to top" aria-label="Move to top" onclick="moveToTop('${idea.id}')">${iconTop}</button>`}
        <button class="icon-btn ${idea.notes ? 'active' : 'reveal-on-hover'}" title="Details for Claude" aria-label="Details for Claude" onclick="toggleNotes('${idea.id}')">${iconNotes}</button>
        <button class="icon-btn del reveal-on-hover" title="Delete idea" aria-label="Delete idea" onclick="deleteIdea('${idea.id}')">${iconTrash}</button>
      </div>
      ${notesOpen ? `
        <textarea class="idea-notes" rows="2" placeholder="Details for Claude — what's annoying, what you'd expect, examples…"
          oninput="autoGrow(this); setField('${idea.id}','notes',this.value)">${escapeHtml(idea.notes || '')}</textarea>
      ` : ''}
    </div>`;
}

function renderLogEntry(entry) {
  const idea = entry.ideaId ? find(entry.ideaId) : null;
  const source = entry.ideaId ? 'Your idea' : "Claude's pick";
  return `
    <div class="idea-log row">
      <div class="idea-log-title">${escapeHtml(entry.title)}</div>
      ${entry.summary ? `<div class="idea-log-summary">${escapeHtml(entry.summary)}</div>` : ''}
      <div class="idea-log-meta">
        ${shortDate(entry.date)} · ${source}${idea && idea.text !== entry.title ? ` — “${escapeHtml(idea.text)}”` : ''}
        ${entry.pr ? ` · <a href="${escapeHtml(entry.pr)}" target="_blank" rel="noopener">Pull request</a>` : ''}
      </div>
    </div>`;
}

function render() {
  const open = state.ideas.filter(i => !i.shipped);
  const log = [...LOG].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  document.getElementById('app').innerHTML = `
    <header class="header">
      <div class="header-row">
        <div>
          <div class="eyebrow">Make it better</div>
          <h1 class="page-title">Ideas</h1>
        </div>
        <div class="today-label">${getTodayLabel()}</div>
      </div>
      <div class="idea-intro">
        Every Monday Claude builds the top idea, or picks its own improvement when the list is empty,
        and opens a <a href="${PULLS_URL}" target="_blank" rel="noopener">pull request</a> for you to merge or close.
        This list is readable without sign-in, so keep it to feature ideas.
      </div>
    </header>

    <div class="arcade-divider"></div>

    <div class="idea-add-row">
      <span class="idea-add-icon">${iconPlus}</span>
      <input class="idea-add-input" placeholder="Suggest an improvement… (e.g. Show waiting items on Home)" onkeydown="onAddKey(event)">
    </div>

    <section class="idea-group">
      <div class="section-header"><span class="section-label">Up next</span>${open.length ? `<span class="section-count">${open.length}</span>` : ''}</div>
      ${open.length
        ? `<div id="idea-list" ondragover="onDragOver(event)" ondrop="onDrop(event)">${open.map(renderIdea).join('')}</div>`
        : `<div class="empty-state"><p>No ideas queued — Claude will pick something itself this week.</p></div>`}
    </section>

    <section class="idea-group">
      <div class="section-header"><span class="section-label">Shipped</span>${log.length ? `<span class="section-count">${log.length}</span>` : ''}</div>
      ${log.length
        ? log.map(renderLogEntry).join('')
        : `<div class="empty-state"><p>Merged changes will show up here.</p></div>`}
    </section>
  `;
  growAll();
}

// Re-measure once web fonts land (and on resize) — heights taken with the
// fallback font cut long ideas off at one line, notably on phones.
function growAll() {
  document.querySelectorAll('.idea-text, .idea-notes').forEach(autoGrow);
}
document.fonts?.ready.then(growAll);
window.addEventListener('resize', growAll);

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

boot().then(render);
watchState(STORAGE_KEY, {}, fresh => {
  state = fresh;
  normalize();
  render();
}, { isBusy: () => pageIsBusy() || !!dragging });
