/* ─────────────────────────────────────────────
   State & persistence
───────────────────────────────────────────── */
const STORAGE_KEY = 'personal-os-notepad-v1';

let state;

async function boot() {
  state = await loadState(STORAGE_KEY, {});
  migrateToSections();
}

function persist() {
  saveState(STORAGE_KEY, state);
}

// Pre-formatting notes were saved as plain text with real newlines. Anything
// that already contains one of our formatting tags is left alone.
function migrateToHtml(text) {
  if (/<(b|strong|i|em|u|ul|ol|li|br|div)\b/i.test(text)) return text;
  return escapeHtml(text).replace(/\n/g, '<br>');
}

// Pre-sections saves are a single `text` blob. Keys off the old shape's
// presence (`sections` missing), not the new one's — see CLAUDE.md's
// migration note on loadState's shallow merge.
function migrateToSections() {
  if (Array.isArray(state.sections)) return;
  state.sections = [newSection('Notes', migrateToHtml(state.text || ''))];
  delete state.text;
  persist();
}

function newSection(title, html = '') {
  return { id: uid(), title, html, open: true, updatedAt: new Date().toISOString() };
}

function findSection(id) {
  return state.sections.find(s => s.id === id);
}

/* ─────────────────────────────────────────────
   Icons
───────────────────────────────────────────── */
const iconBold = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 2h3.2a2.3 2.3 0 0 1 0 4.6H3.5z"/><path d="M3.5 6.6h3.6a2.4 2.4 0 0 1 0 4.8H3.5z"/></svg>`;

const iconItalic = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="7.5" y1="2" x2="4.5" y2="11"/><line x1="4" y1="2" x2="8" y2="2"/><line x1="3" y1="11" x2="7" y2="11"/></svg>`;

const iconUnderline = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 2v4.5a3.5 3.5 0 0 0 7 0V2"/><line x1="2.5" y1="11.5" x2="10.5" y2="11.5"/></svg>`;

const iconBulletList = `<svg width="13" height="13" viewBox="0 0 13 13"><circle cx="2" cy="3" r="0.9" fill="currentColor"/><circle cx="2" cy="6.5" r="0.9" fill="currentColor"/><circle cx="2" cy="10" r="0.9" fill="currentColor"/><line x1="5" y1="3" x2="11.5" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="6.5" x2="11.5" y2="6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="10" x2="11.5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const iconNumberedList = `<svg width="13" height="13" viewBox="0 0 13 13"><text x="0.3" y="4.1" font-size="4" font-family="sans-serif" fill="currentColor">1</text><text x="0.3" y="7.6" font-size="4" font-family="sans-serif" fill="currentColor">2</text><text x="0.3" y="11.1" font-size="4" font-family="sans-serif" fill="currentColor">3</text><line x1="5" y1="3" x2="11.5" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="6.5" x2="11.5" y2="6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="10" x2="11.5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const iconChevron = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,2 10,7 4,12"/></svg>`;

const iconTrash = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,3 12,3"/><path d="M5,3V2h3v1"/><path d="M2,3l1,9h7l1-9"/><line x1="5" y1="6" x2="5" y2="9"/><line x1="8" y1="6" x2="8" y2="9"/></svg>`;

const iconGrip = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="3.5" cy="2.5" r="1.15"/><circle cx="8.5" cy="2.5" r="1.15"/><circle cx="3.5" cy="6" r="1.15"/><circle cx="8.5" cy="6" r="1.15"/><circle cx="3.5" cy="9.5" r="1.15"/><circle cx="8.5" cy="9.5" r="1.15"/></svg>`;

const iconPlus = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="6.5" y1="1.5" x2="6.5" y2="11.5"/><line x1="1.5" y1="6.5" x2="11.5" y2="6.5"/></svg>`;

const TOOLS = [
  { cmd: 'bold', icon: iconBold, title: 'Bold (Ctrl+B)' },
  { cmd: 'italic', icon: iconItalic, title: 'Italic (Ctrl+I)' },
  { cmd: 'underline', icon: iconUnderline, title: 'Underline (Ctrl+U)' },
  { sep: true },
  { cmd: 'insertUnorderedList', icon: iconBulletList, title: 'Bullet list' },
  { cmd: 'insertOrderedList', icon: iconNumberedList, title: 'Numbered list' },
];

/* ─────────────────────────────────────────────
   Actions
───────────────────────────────────────────── */
// Formatting commands act on whichever section editor has the selection,
// so one toolbar serves every section.
function activeEditor() {
  const el = document.activeElement;
  return el && el.classList.contains('notepad-editor') ? el : null;
}

function onEditorInput(el) {
  const sec = findSection(el.dataset.id);
  if (!sec) return;
  sec.html = el.innerHTML;
  sec.updatedAt = new Date().toISOString();
  persist();
  const label = document.querySelector(`.notepad-section[data-id="${sec.id}"] .notepad-section-edited`);
  if (label) label.textContent = formatEdited(sec.updatedAt);
}

function applyCmd(cmd) {
  const editor = activeEditor();
  if (!editor) return;
  document.execCommand(cmd, false, null);
  onEditorInput(editor);
  updateToolbarState();
  editor.focus();
}

function updateToolbarState() {
  const editing = !!activeEditor();
  document.querySelectorAll('.notepad-tool').forEach(btn => {
    let active = false;
    if (editing) { try { active = document.queryCommandState(btn.dataset.cmd); } catch (e) {} }
    btn.classList.toggle('active', active);
  });
}

function toggleSection(id) {
  const sec = findSection(id);
  if (!sec) return;
  sec.open = !sec.open;
  persist();
  render();
  if (sec.open) document.querySelector(`.notepad-editor[data-id="${id}"]`)?.focus();
}

function setAllOpen(open) {
  state.sections.forEach(s => { s.open = open; });
  persist();
  render();
}

function onTitleChange(id, value) {
  const sec = findSection(id);
  if (!sec) return;
  const title = value.trim() || 'Untitled';
  if (title === sec.title) return;
  sec.title = title;
  persist();
}

function onTitleKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
}

function onAddSectionKey(e) {
  if (e.key !== 'Enter') return;
  // Focus jumps to the new section's editor mid-keydown — without this the
  // Enter's default action lands there as a stray blank line.
  e.preventDefault();
  const title = e.target.value.trim();
  if (!title) return;
  const sec = newSection(title);
  state.sections.push(sec);
  persist();
  render();
  document.querySelector(`.notepad-editor[data-id="${sec.id}"]`)?.focus();
}

function deleteSection(id) {
  const sec = findSection(id);
  if (!sec) return;
  const hasContent = sec.html.replace(/<[^>]*>|&nbsp;|\s/g, '') !== '';
  if (hasContent && !confirm(`Delete "${sec.title}" and all its notes? This can't be undone.`)) return;
  state.sections = state.sections.filter(s => s.id !== id);
  persist();
  render();
}

/* ── Drag to reorder sections (grip handle in each header) ── */
let sectionDragging = null;

function onSectionDragStart(e, id) {
  sectionDragging = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  e.target.closest('.notepad-section').classList.add('dragging');
}

function onSectionDragEnd(e) {
  sectionDragging = null;
  document.querySelectorAll('.notepad-section').forEach(el => el.classList.remove('dragging', 'drop-target'));
}

function onSectionDragOver(e, id) {
  if (!sectionDragging || sectionDragging === id) return;
  e.preventDefault();
  document.querySelectorAll('.notepad-section').forEach(el =>
    el.classList.toggle('drop-target', el.dataset.id === id));
}

function onSectionDrop(e, targetId) {
  if (!sectionDragging || sectionDragging === targetId) return;
  e.preventDefault();
  const from = state.sections.findIndex(s => s.id === sectionDragging);
  const [moved] = state.sections.splice(from, 1);
  const to = state.sections.findIndex(s => s.id === targetId);
  state.sections.splice(to, 0, moved);
  sectionDragging = null;
  persist();
  render();
}

/* ─────────────────────────────────────────────
   Render
───────────────────────────────────────────── */
function formatEdited(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return 'Edited ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return 'Edited ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderSection(sec) {
  return `
    <section class="notepad-section row ${sec.open ? 'open' : ''}" data-id="${sec.id}"
      ondragover="onSectionDragOver(event,'${sec.id}')" ondrop="onSectionDrop(event,'${sec.id}')">
      <div class="notepad-section-header">
        <button class="notepad-section-toggle" onclick="toggleSection('${sec.id}')"
          title="${sec.open ? 'Collapse' : 'Expand'}" aria-expanded="${sec.open}">
          <span class="chevron ${sec.open ? 'open' : ''}">${iconChevron}</span>
        </button>
        <input class="notepad-section-title" value="${escapeHtml(sec.title)}" aria-label="Section title"
          onchange="onTitleChange('${sec.id}', this.value)" onkeydown="onTitleKey(event)">
        <span class="notepad-section-edited">${formatEdited(sec.updatedAt)}</span>
        <button class="icon-btn del reveal-on-hover" title="Delete section" onclick="deleteSection('${sec.id}')">${iconTrash}</button>
        <span class="notepad-section-handle reveal-on-hover" title="Drag to reorder" draggable="true"
          ondragstart="onSectionDragStart(event,'${sec.id}')" ondragend="onSectionDragEnd(event)">${iconGrip}</span>
      </div>
      ${sec.open ? `
        <div class="notepad-editor" contenteditable="true" data-id="${sec.id}"
          data-placeholder="Write anything…"
          oninput="onEditorInput(this)" onkeyup="updateToolbarState()" onmouseup="updateToolbarState()"
          onblur="updateToolbarState()">${sec.html}</div>
      ` : ''}
    </section>
  `;
}

function render() {
  const app = document.getElementById('app');
  const anyOpen = state.sections.some(s => s.open);
  app.innerHTML = `
    <header class="header">
      <div class="header-row">
        <div>
          <div class="eyebrow">Quick capture</div>
          <h1 class="page-title">Notepad</h1>
        </div>
        <div class="today-label">${getTodayLabel()}</div>
      </div>
    </header>

    <div class="arcade-divider"></div>

    <div class="notepad-toolbar">
      ${TOOLS.map(t => t.sep
        ? `<span class="notepad-toolbar-sep"></span>`
        : `<button class="icon-btn notepad-tool" data-cmd="${t.cmd}" title="${t.title}"
             onmousedown="event.preventDefault()" onclick="applyCmd('${t.cmd}')">${t.icon}</button>`
      ).join('')}
      ${state.sections.length ? `
        <button class="notepad-collapse-all" onclick="setAllOpen(${!anyOpen})">
          ${anyOpen ? 'Collapse all' : 'Expand all'}
        </button>` : ''}
    </div>

    <div class="notepad-sections">
      ${state.sections.length
        ? state.sections.map(renderSection).join('')
        : `<div class="empty-state">No sections yet — add one below.</div>`}
    </div>

    <div class="notepad-add-row">
      <span class="notepad-add-icon">${iconPlus}</span>
      <input class="notepad-add-input" placeholder="Add a section…" onkeydown="onAddSectionKey(event)">
    </div>
  `;
}

document.addEventListener('selectionchange', () => {
  if (activeEditor()) updateToolbarState();
});

/* ─────────────────────────────────────────────
   Boot
───────────────────────────────────────────── */
boot().then(render);
