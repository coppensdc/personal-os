/* ─────────────────────────────────────────────
   State & persistence
───────────────────────────────────────────── */
const STORAGE_KEY = 'personal-os-todos-v1';

const FONT_SIZES = { sm: '.75rem', md: '.8125rem', lg: '.875rem' };

const BLOCK_COLORS = [
  { hex: '#F26B43', label: 'Coral' },
  { hex: '#C98A2E', label: 'Amber' },
  { hex: '#3E8E85', label: 'Teal' },
  { hex: '#5B7C99', label: 'Slate' },
  { hex: '#8B5FA8', label: 'Plum' },
  { hex: '#8A9A5B', label: 'Olive' },
  { hex: '#C15B7C', label: 'Rose' }
];

const DEFAULT_STATE = {
  gridCols: 2,
  fontSize: 'md',
  summaryOrder: [],
  blocks: [
    { id: 'personal', name: 'Work', color: null, today: [], followups: [], done: [], followupsOpen: true, doneOpen: false },
    { id: 'work', name: 'Personal', color: null, today: [], followups: [], done: [], followupsOpen: true, doneOpen: false }
  ]
};

// Open (not done) lists in each block. Follow-ups hold things already handed off —
// waiting on a reply, a team review, or someone you delegated to.
const OPEN_SECTIONS = ['today', 'followups'];

let state;
let dragging = null;
let blockDragging = null;
let summaryDragging = null;
let pendingComplete = null;
let openPopoverId = null;

async function boot() {
  state = await loadState(STORAGE_KEY, DEFAULT_STATE);
  normalizeState();
}

// Shared by boot and by remote changes from another device (watchState below).
function normalizeState() {
  migrateToBlocks();
  state.blocks.forEach(b => {
    if (!b.today) b.today = [];
    if (!b.followups) b.followups = [];
    if (!b.done) b.done = [];
    if (b.followupsOpen === undefined) b.followupsOpen = true;
  });
  if (!Array.isArray(state.summaryOrder)) state.summaryOrder = [];
  migrateBacklogToToday();
  migrateWaitingToFollowups();
  backfillItemDates();
}

// Backlog was removed 2026-10-01. Keys off the old backlog/backlogOpen keys being
// present: any items in it are appended to the bottom of that block's Today list,
// then the keys are dropped (a tab still on older code may re-add them; this re-runs).
function migrateBacklogToToday() {
  let changed = false;
  state.blocks.forEach(b => {
    if (!('backlog' in b) && !('backlogOpen' in b)) return;
    if (Array.isArray(b.backlog)) b.today.push(...b.backlog);
    delete b.backlog;
    delete b.backlogOpen;
    changed = true;
  });
  if (changed) persist();
}

// Before Follow-ups existed, "Waiting for answer" was a flag on a Today item.
// Keys off that old shape (a waiting item outside followups), so it also catches
// anything a tab still running the old code flags later.
function migrateWaitingToFollowups() {
  let changed = false;
  state.blocks.forEach(b => {
    const waiting = b.today.filter(i => i.waiting);
    if (!waiting.length) return;
    b.today = b.today.filter(i => !i.waiting);
    b.followups.push(...waiting);
    changed = true;
  });
  if (changed) persist();
}

// Items created before createdAt/waitingSince existed. createdAt is recovered
// from the id (uid() starts with a base-36 timestamp); waitingSince can't be
// recovered, so an already-waiting item starts counting from today.
function backfillItemDates() {
  let changed = false;
  state.blocks.forEach(b => [...OPEN_SECTIONS, 'done'].forEach(section => {
    b[section].forEach(item => {
      if (!item.createdAt) { item.createdAt = idTimestamp(item.id) || new Date().toISOString(); changed = true; }
      if (item.waiting && !item.waitingSince) { item.waitingSince = todayISO(); changed = true; }
    });
  }));
  if (changed) persist();
}

const WAITING_NUDGE_DAYS = 5;

function waitingDays(item) {
  return item.waiting && item.waitingSince ? daysBetweenISO(item.waitingSince, todayISO()) : 0;
}

// One-time upgrade from the old hardcoded personal/work columns to the blocks array.
// Note: loadState() shallow-merges saved data over DEFAULT_STATE, so state.blocks can
// already be populated (from the default) even on an old-format save that predates
// blocks entirely — so the migration check must key off the old personal/work shape,
// not off state.blocks being present, or a real old save gets silently replaced by
// two empty default blocks.
function migrateToBlocks() {
  const hasOldFormat = state.personal && typeof state.personal === 'object';
  if (!hasOldFormat) return;
  const personal = state.personal || { today: [], backlog: [], done: [], backlogOpen: false, doneOpen: false };
  const work = state.work || { today: [], backlog: [], done: [], backlogOpen: false, doneOpen: false };
  state.blocks = [
    { id: 'personal', name: 'Work', today: personal.today || [], backlog: personal.backlog || [], done: personal.done || [], backlogOpen: !!personal.backlogOpen, doneOpen: !!personal.doneOpen },
    { id: 'work', name: 'Personal', today: work.today || [], backlog: work.backlog || [], done: work.done || [], backlogOpen: !!work.backlogOpen, doneOpen: !!work.doneOpen }
  ];
  delete state.personal;
  delete state.work;
  delete state.workPct;
  delete state.colWidthPct;
  persist();
}

function getBlock(id) {
  return state.blocks.find(b => b.id === id);
}

function persist() {
  saveState(STORAGE_KEY, state);
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ─────────────────────────────────────────────
   SVG icons
───────────────────────────────────────────── */
const iconChevron = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,2 10,7 4,12"/></svg>`;

const iconFlag = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 1.5v10"/><path d="M3 2h6.5l-2 2.25L9.5 6.5H3"/></svg>`;

const iconTrash = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,3 12,3"/><path d="M5,3V2h3v1"/><path d="M2,3l1,9h7l1-9"/><line x1="5" y1="6" x2="5" y2="9"/><line x1="8" y1="6" x2="8" y2="9"/></svg>`;

const iconPlus = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="6.5" y1="1.5" x2="6.5" y2="11.5"/><line x1="1.5" y1="6.5" x2="11.5" y2="6.5"/></svg>`;

const iconHourglass = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 1.5h8"/><path d="M2.5 11.5h8"/><path d="M3.25 1.5c0 3 2.25 3.5 2.25 5s-2.25 2-2.25 5"/><path d="M9.75 1.5c0 3-2.25 3.5-2.25 5s2.25 2 2.25 5"/></svg>`;

const iconGrip = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="3.5" cy="2.5" r="1.15"/><circle cx="8.5" cy="2.5" r="1.15"/><circle cx="3.5" cy="6" r="1.15"/><circle cx="8.5" cy="6" r="1.15"/><circle cx="3.5" cy="9.5" r="1.15"/><circle cx="8.5" cy="9.5" r="1.15"/></svg>`;

const iconKebab = `<svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><circle cx="6.5" cy="2.75" r="1.15"/><circle cx="6.5" cy="6.5" r="1.15"/><circle cx="6.5" cy="10.25" r="1.15"/></svg>`;

const iconCalendar = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="10" height="9" rx="1"/><path d="M1.5 5.25h10"/><path d="M4 1v2"/><path d="M9 1v2"/></svg>`;

const iconUndo = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4.5,2 1.5,5 4.5,8"/><path d="M1.5 5h6a3.5 3.5 0 0 1 0 7H5"/></svg>`;

const iconNote = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="1.5" width="10" height="10" rx="1"/><path d="M4 4.75h5"/><path d="M4 7h5"/><path d="M4 9.25h3"/></svg>`;

/* ─────────────────────────────────────────────
   Due-date helpers (plain YYYY-MM-DD string math — avoids Date/timezone pitfalls)
───────────────────────────────────────────── */
// Due today, tomorrow, or already past (overdue items shouldn't drop out of the Summary).
function isDueSoon(dueDate) {
  if (!dueDate) return false;
  return dueDate <= addDaysISO(todayISO(), 1);
}

function formatShortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDueLabel(iso) {
  const today = todayISO();
  if (iso === today) return 'Due today';
  if (iso === addDaysISO(today, 1)) return 'Due tomorrow';
  if (iso < today) return 'Was due ' + formatShortDate(iso);
  return 'Due ' + formatShortDate(iso);
}

/* ─────────────────────────────────────────────
   Blocks (add / rename / delete)
───────────────────────────────────────────── */
function handleAddBlockKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.target;
  addBlock(input.value);
  input.value = '';
}

function addBlock(name) {
  name = (name || '').trim();
  if (!name) return;
  state.blocks.push({ id: uid(), name, color: null, today: [], followups: [], done: [], followupsOpen: true, doneOpen: false });
  persist();
  render();
}

function renameBlock(colKey, inputEl) {
  const block = getBlock(colKey);
  if (!block) return;
  const name = inputEl.value.trim();
  if (!name) { inputEl.value = block.name; return; }
  if (name === block.name) return;
  block.name = name;
  persist();
}

function setGridCols(n) {
  if (state.gridCols === n) return;
  state.gridCols = n;
  persist();
  render();
}

function setFontSize(size) {
  if (state.fontSize === size || !FONT_SIZES[size]) return;
  state.fontSize = size;
  persist();
  render();
}

function deleteBlock(colKey) {
  const block = getBlock(colKey);
  if (!block) return;
  const total = block.today.length + block.followups.length + block.done.length;
  const msg = total > 0
    ? `Delete "${block.name}"? This removes ${total} to-do${total === 1 ? '' : 's'} (including its Done history) permanently.`
    : `Delete "${block.name}"?`;
  if (!confirm(msg)) return;
  state.blocks = state.blocks.filter(b => b.id !== colKey);
  persist();
  render();
}

/* ─────────────────────────────────────────────
   Actions
───────────────────────────────────────────── */
function addItem(colKey, section, text) {
  text = text.trim();
  if (!text) return;
  const item = { id: uid(), text, complete: false, priority: false, waiting: false, dueDate: null, notes: '', subtasks: [], subtasksOpen: false, createdAt: new Date().toISOString() };
  if (section === 'followups') markFollowup(item, true);
  getBlock(colKey)[section].unshift(item);
  persist();
  render();
}

function handleAddKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.target;
  const col = input.dataset.col, section = input.dataset.section;
  addItem(col, section, input.value);
  input.value = '';
  const fresh = document.querySelector(`.todo-add-input[data-col="${col}"][data-section="${section}"]`);
  if (fresh) fresh.focus();
}

function toggleComplete(colKey, section, id) {
  openCompleteModal(colKey, section, id);
}

function openCompleteModal(colKey, section, id) {
  const item = getBlock(colKey)[section].find(i => i.id === id);
  if (!item) return;
  pendingComplete = { colKey, section, id };

  const overlay = document.createElement('div');
  overlay.className = 'todo-modal-overlay';
  overlay.id = 'todo-modal-overlay';
  overlay.innerHTML = `
    <div class="todo-modal" role="dialog" aria-modal="true">
      <div class="todo-modal-title">Mark done</div>
      <div class="todo-modal-item">${escapeHtml(item.text)}</div>
      <textarea class="todo-modal-note" id="todo-modal-note" placeholder="What did you actually do? (optional)"></textarea>
      <div class="todo-modal-actions">
        <button class="todo-modal-cancel" onclick="closeCompleteModal()">Cancel</button>
        <button class="todo-modal-save" onclick="confirmComplete()">Mark done</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeCompleteModal(); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onModalKeydown);
  document.getElementById('todo-modal-note').focus();
}

function onModalKeydown(event) {
  if (event.key === 'Escape') closeCompleteModal();
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) confirmComplete();
}

function closeCompleteModal() {
  const overlay = document.getElementById('todo-modal-overlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', onModalKeydown);
  pendingComplete = null;
}

function confirmComplete() {
  if (!pendingComplete) return;
  const { colKey, section, id } = pendingComplete;
  const note = document.getElementById('todo-modal-note').value.trim();
  const col = getBlock(colKey);
  const idx = col[section].findIndex(i => i.id === id);
  if (idx === -1) { closeCompleteModal(); return; }
  const [item] = col[section].splice(idx, 1);
  item.complete = true;
  item.note = note;
  item.completedAt = new Date().toISOString();
  col.done.unshift(item);
  persist();
  closeCompleteModal();
  render();
}

function toggleDone(colKey) {
  getBlock(colKey).doneOpen = !getBlock(colKey).doneOpen;
  persist();
  render();
}

function deleteDoneItem(colKey, id) {
  const block = getBlock(colKey);
  block.done = block.done.filter(i => i.id !== id);
  persist();
  render();
}

function formatDoneDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function togglePriority(colKey, section, id) {
  const item = getBlock(colKey)[section].find(i => i.id === id);
  if (!item) return;
  item.priority = !item.priority;
  persist();
  render();
}

function setDueDate(colKey, section, id, value) {
  const item = getBlock(colKey)[section].find(i => i.id === id);
  if (!item) return;
  item.dueDate = value || null;
  persist();
  render();
}

function onNotesChange(colKey, section, id, val) {
  const item = getBlock(colKey)[section].find(i => i.id === id);
  if (!item) return;
  item.notes = val;
  persist();
}

// An item in Follow-ups carries waiting + waitingSince (the day it went in); both are
// cleared when it moves back out, so the "since" date restarts if it's handed off again.
function markFollowup(item, on) {
  if (on) {
    item.waiting = true;
    if (!item.waitingSince) item.waitingSince = todayISO();
  } else {
    item.waiting = false;
    delete item.waitingSince;
  }
}

function moveItem(colKey, fromSection, id, toSection) {
  const block = getBlock(colKey);
  const idx = block[fromSection].findIndex(i => i.id === id);
  if (idx === -1) return;
  const [item] = block[fromSection].splice(idx, 1);
  markFollowup(item, toSection === 'followups');
  block[toSection].unshift(item);
  if (toSection === 'followups') block.followupsOpen = true;
  persist();
  render();
}

function deleteItem(colKey, section, id) {
  const block = getBlock(colKey);
  block[section] = block[section].filter(i => i.id !== id);
  persist();
  render();
}

function onTextChange(colKey, section, id, val) {
  const item = getBlock(colKey)[section].find(i => i.id === id);
  if (!item || item.text === val) return;
  item.text = val;
  persist();
  render();
}

/* ─────────────────────────────────────────────
   Sub-tasks
───────────────────────────────────────────── */
function toggleSubtasks(colKey, section, id) {
  const item = getBlock(colKey)[section].find(i => i.id === id);
  if (!item) return;
  item.subtasksOpen = !item.subtasksOpen;
  persist();
  render();
}

function addSubtaskUI(colKey, section, id) {
  const item = getBlock(colKey)[section].find(i => i.id === id);
  if (!item) return;
  if (!item.subtasks) item.subtasks = [];
  item.subtasksOpen = true;
  persist();
  render();
  const input = document.querySelector(`.todo-subtask-input[data-parent="${id}"]`);
  if (input) input.focus();
  // Deferred so this doesn't catch the very click that just opened the section.
  setTimeout(() => watchForEmptySubtasksClose(colKey, section, id), 0);
}

// Collapses the sub-tasks section back down if it was opened via "Add sub-task"
// and left empty — fires once, on the next click outside that to-do's row.
function watchForEmptySubtasksClose(colKey, section, id) {
  const handler = (event) => {
    const row = document.querySelector(`.todo-item[data-id="${id}"]`);
    if (row && row.contains(event.target)) return;
    document.removeEventListener('click', handler, true);
    const item = getBlock(colKey)[section].find(i => i.id === id);
    if (!item || !item.subtasksOpen) return;
    if (item.subtasks && item.subtasks.length) return;
    item.subtasksOpen = false;
    persist();
    render();
  };
  document.addEventListener('click', handler, true);
}

function handleSubAddKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.target;
  const { col, section, parent } = input.dataset;
  addSubtask(col, section, parent, input.value);
  input.value = '';
}

function addSubtask(colKey, section, parentId, text) {
  text = text.trim();
  if (!text) return;
  const item = getBlock(colKey)[section].find(i => i.id === parentId);
  if (!item) return;
  if (!item.subtasks) item.subtasks = [];
  item.subtasks.push({ id: uid(), text, complete: false });
  item.subtasksOpen = true;
  persist();
  render();
  const fresh = document.querySelector(`.todo-subtask-input[data-parent="${parentId}"]`);
  if (fresh) fresh.focus();
}

function toggleSubtaskComplete(colKey, section, parentId, subId) {
  const item = getBlock(colKey)[section].find(i => i.id === parentId);
  const sub = item && (item.subtasks || []).find(s => s.id === subId);
  if (!sub) return;
  sub.complete = !sub.complete;
  persist();
  render();
}

function onSubTextChange(colKey, section, parentId, subId, val) {
  const item = getBlock(colKey)[section].find(i => i.id === parentId);
  const sub = item && (item.subtasks || []).find(s => s.id === subId);
  if (sub) { sub.text = val; persist(); }
}

function deleteSubtask(colKey, section, parentId, subId) {
  const item = getBlock(colKey)[section].find(i => i.id === parentId);
  if (!item) return;
  item.subtasks = (item.subtasks || []).filter(s => s.id !== subId);
  persist();
  render();
}

/* ─────────────────────────────────────────────
   Popover helper — shared by the item menu and the block color picker.
   Appended to <body> (not nested in the row/header) so it's never clipped
   by an ancestor's layout, positioned off the anchor button's own rect.
───────────────────────────────────────────── */
let popoverAnchor = null;

function openPopover(popoverId, anchorEl, innerHtml, extraClass) {
  if (openPopoverId === popoverId) { closePopover(); return; }
  closePopover();
  openPopoverId = popoverId;
  popoverAnchor = anchorEl;
  anchorEl.classList.add('menu-open');

  const catcher = document.createElement('div');
  catcher.className = 'todo-item-menu-catcher';
  catcher.onclick = closePopover;

  const menu = document.createElement('div');
  menu.className = 'todo-item-menu' + (extraClass ? ' ' + extraClass : '');
  menu.id = 'todo-item-menu';
  menu.innerHTML = innerHtml;

  document.body.appendChild(catcher);
  document.body.appendChild(menu);

  repositionPopover();

  document.addEventListener('keydown', onMenuKeydown);
}

// Recomputes the popover's position off its anchor — called after opening,
// and again after its content changes size (e.g. the notes editor expanding)
// so a taller menu doesn't run off the bottom of the viewport.
function repositionPopover() {
  const menu = document.getElementById('todo-item-menu');
  if (!menu || !popoverAnchor) return;
  const btnRect = popoverAnchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = btnRect.right - menuRect.width;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
  let top = btnRect.bottom + 4;
  if (top + menuRect.height > window.innerHeight - 8) top = btnRect.top - menuRect.height - 4;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function closePopover() {
  const menu = document.getElementById('todo-item-menu');
  if (menu) menu.remove();
  document.querySelectorAll('.todo-item-menu-catcher').forEach(el => el.remove());
  document.querySelectorAll('.menu-open').forEach(el => el.classList.remove('menu-open'));
  document.removeEventListener('keydown', onMenuKeydown);
  openPopoverId = null;
  popoverAnchor = null;
}

function onMenuKeydown(event) {
  if (event.key === 'Escape') closePopover();
}

/* ─────────────────────────────────────────────
   Item menu (priority / waiting / add sub-task / delete, behind a kebab button)
───────────────────────────────────────────── */
function toggleItemMenu(event, colKey, section, id) {
  event.stopPropagation();
  const item = getBlock(colKey)[section].find(i => i.id === id);
  if (!item) return;
  const html = `
    <button class="todo-menu-item ${item.priority ? 'active' : ''}" onclick="togglePriority('${colKey}','${section}','${id}');closePopover();">${iconFlag}<span>Priority</span></button>
    ${section === 'followups'
      ? `<button class="todo-menu-item" onclick="moveItem('${colKey}','followups','${id}','today');closePopover();">${iconUndo}<span>Move back to Today</span></button>`
      : `<button class="todo-menu-item" onclick="moveItem('${colKey}','${section}','${id}','followups');closePopover();">${iconHourglass}<span>Move to Follow-ups</span></button>`}
    <label class="todo-menu-item todo-menu-date ${item.dueDate ? 'active' : ''}">
      ${iconCalendar}<span>Due date</span>
      <input type="date" class="todo-date-input" value="${item.dueDate || ''}"
             onclick="event.stopPropagation()" onchange="setDueDate('${colKey}','${section}','${id}',this.value)">
    </label>
    <div class="todo-menu-notes">
      <button class="todo-menu-item ${item.notes ? 'active' : ''}" onclick="event.stopPropagation();toggleNotesEditor(this)">${iconNote}<span>Notes</span></button>
      <textarea class="todo-notes-menu-textarea" placeholder="Notes…"
                onclick="event.stopPropagation()"
                onchange="onNotesChange('${colKey}','${section}','${id}',this.value)"
                onblur="onNotesChange('${colKey}','${section}','${id}',this.value)"
      >${escapeHtml(item.notes || '')}</textarea>
    </div>
    <button class="todo-menu-item" onclick="addSubtaskUI('${colKey}','${section}','${id}');closePopover();">${iconPlus}<span>Add sub-task</span></button>
    <button class="todo-menu-item del" onclick="deleteItem('${colKey}','${section}','${id}');closePopover();">${iconTrash}<span>Delete</span></button>
  `;
  openPopover('item:' + id, event.currentTarget, html);
}

// Notes stay collapsed inside the item menu until "Notes" is clicked — the popover
// already disappears on any outside click (see openPopover's catcher), so an
// emptied-out notes box needs no special-case close handling of its own.
function toggleNotesEditor(btn) {
  const wrap = btn.nextElementSibling;
  if (!wrap) return;
  const opening = !wrap.classList.contains('open');
  wrap.classList.toggle('open', opening);
  if (opening) wrap.focus();
  repositionPopover();
}

/* ─────────────────────────────────────────────
   Block color picker
───────────────────────────────────────────── */
function toggleBlockColorPicker(event, colKey) {
  event.stopPropagation();
  const block = getBlock(colKey);
  if (!block) return;
  const swatches = BLOCK_COLORS.map(c => `
    <button class="todo-color-swatch ${block.color === c.hex ? 'active' : ''}" style="--swatch:${c.hex}"
            title="${c.label}" onclick="setBlockColor('${colKey}','${c.hex}');closePopover();"></button>
  `).join('');
  const html = `
    <div class="todo-color-grid">${swatches}</div>
    <button class="todo-menu-item" onclick="setBlockColor('${colKey}', null);closePopover();"><span>Default (no color)</span></button>
  `;
  openPopover('color:' + colKey, event.currentTarget, html, 'todo-color-menu');
}

function setBlockColor(colKey, hex) {
  const block = getBlock(colKey);
  if (!block) return;
  block.color = hex;
  persist();
  render();
}

function toggleFollowups(colKey) {
  getBlock(colKey).followupsOpen = !getBlock(colKey).followupsOpen;
  persist();
  render();
}

/* ─────────────────────────────────────────────
   Drag & drop (reorder + move between today/follow-ups, across blocks)
───────────────────────────────────────────── */
function onDragStart(event) {
  const row = event.currentTarget;
  dragging = { id: row.dataset.id, col: row.dataset.col };
  row.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', row.dataset.id);
}

function onDragEnd(event) {
  event.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.todo-list.drag-over').forEach(el => el.classList.remove('drag-over'));
  dragging = null;
  render();
}

function onDragOver(event) {
  event.preventDefault();
  const list = event.currentTarget;
  if (!dragging) return;
  list.classList.add('drag-over');
  const emptyMsg = list.querySelector('.todo-backlog-empty');
  if (emptyMsg) emptyMsg.remove();
  const draggingEl = document.querySelector(`.todo-item[data-id="${dragging.id}"]`);
  if (!draggingEl) return;
  const afterEl = getDragAfterElement(list, event.clientY);
  if (afterEl == null) list.appendChild(draggingEl);
  else list.insertBefore(draggingEl, afterEl);
}

function onDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

function onDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  if (!dragging) return;
  reconcileBlocksFromDom(dragging.col, event.currentTarget.dataset.col);
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.todo-item:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

// Rebuilds today/followups for one or two blocks (source + destination, when an item was
// dragged across blocks) purely from the current DOM order — the dragged item's own
// data-col/data-section attributes go stale the moment onDragOver physically relocates
// its element into a different list, so lookups here go through a global by-id map
// spanning every block instead of trusting those attributes.
function reconcileBlocksFromDom(sourceCol, targetCol) {
  const byId = new Map();
  state.blocks.forEach(b => OPEN_SECTIONS.forEach(section => b[section].forEach(it => byId.set(it.id, it))));
  const cols = sourceCol === targetCol ? [sourceCol] : [sourceCol, targetCol];
  cols.forEach(colKey => {
    const block = getBlock(colKey);
    if (!block) return;
    OPEN_SECTIONS.forEach(section => {
      const els = [...document.querySelectorAll(`#list-${colKey}-${section} .todo-item`)];
      block[section] = els.map(el => byId.get(el.dataset.id)).filter(Boolean);
      // Dragging into or out of Follow-ups stamps or clears its "since" date.
      const isFollowups = section === 'followups';
      block[section].forEach(it => { if (!!it.waiting !== isFollowups) markFollowup(it, isFollowups); });
    });
  });
  persist();
  render();
}

/* ─────────────────────────────────────────────
   Block drag & drop (reorder blocks themselves via a grip handle)
───────────────────────────────────────────── */
function onBlockDragStart(event) {
  const handle = event.currentTarget;
  blockDragging = handle.dataset.col;
  const section = handle.closest('.todo-column');
  if (section) section.classList.add('block-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', blockDragging);
  event.stopPropagation();
}

function onBlockDragEnd(event) {
  document.querySelectorAll('.todo-column.block-dragging').forEach(el => el.classList.remove('block-dragging'));
  document.querySelectorAll('.todo-column.block-drag-over').forEach(el => el.classList.remove('block-drag-over'));
  blockDragging = null;
}

function onBlockDragOver(event) {
  if (!blockDragging) return;
  event.preventDefault();
  event.stopPropagation();
  const section = event.currentTarget;
  if (section.dataset.blockId === blockDragging) return;
  document.querySelectorAll('.todo-column.block-drag-over').forEach(el => el.classList.remove('block-drag-over'));
  section.classList.add('block-drag-over');
}

function onBlockDragLeave(event) {
  event.currentTarget.classList.remove('block-drag-over');
}

function onBlockDrop(event) {
  if (!blockDragging) return;
  event.preventDefault();
  event.stopPropagation();
  const section = event.currentTarget;
  section.classList.remove('block-drag-over');
  const targetId = section.dataset.blockId;
  const draggedId = blockDragging;
  blockDragging = null;
  if (draggedId === targetId) return;
  const fromIdx = state.blocks.findIndex(b => b.id === draggedId);
  if (fromIdx === -1) return;
  const [moved] = state.blocks.splice(fromIdx, 1);
  const toIdx = state.blocks.findIndex(b => b.id === targetId);
  if (toIdx === -1) { state.blocks.splice(fromIdx, 0, moved); return; }
  state.blocks.splice(toIdx, 0, moved);
  persist();
  render();
}

function jumpToBlock(colKey) {
  const el = document.getElementById(`col-${colKey}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 900);
}

/* ─────────────────────────────────────────────
   Auto-growing text (lets to-do text wrap instead of truncating)
───────────────────────────────────────────── */
function autoGrowTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function initAutoGrow() {
  document.querySelectorAll('.todo-textarea').forEach(autoGrowTextarea);
}

/* ─────────────────────────────────────────────
   Render
───────────────────────────────────────────── */
function renderRow(colKey, section, item) {
  const subtasks = item.subtasks || [];
  const subDone = subtasks.filter(s => s.complete).length;
  const hasSubtasks = subtasks.length > 0;
  const subtasksOpen = !!item.subtasksOpen;

  return `
    <div class="todo-item" draggable="true" data-id="${item.id}" data-col="${colKey}" data-section="${section}"
         ondragstart="onDragStart(event)" ondragend="onDragEnd(event)">
      <div class="todo-row">
        <div class="todo-check ${item.complete ? 'checked' : ''} ${item.priority ? 'priority' : ''}"
             onclick="toggleComplete('${colKey}','${section}','${item.id}')"></div>
        <div class="todo-text-wrap">
          <textarea
            class="todo-text todo-textarea ${item.complete ? 'done' : ''} ${item.priority ? 'priority' : ''}"
            rows="1"
            placeholder="${section === 'followups' ? 'Follow-up…' : 'To-do…'}"
            onmousedown="event.stopPropagation()"
            onclick="event.stopPropagation()"
            oninput="autoGrowTextarea(this)"
            onchange="onTextChange('${colKey}','${section}','${item.id}',this.value)"
            onblur="onTextChange('${colKey}','${section}','${item.id}',this.value)"
            onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}"
          >${escapeHtml(item.text)}</textarea>
          ${section === 'followups' ? renderFollowupMeta(item) : ''}
        </div>
        ${hasSubtasks ? `
          <button class="todo-subtoggle" onclick="event.stopPropagation();toggleSubtasks('${colKey}','${section}','${item.id}')">
            <span class="chevron ${subtasksOpen ? 'open' : ''}">${iconChevron}</span>${subDone}/${subtasks.length}
          </button>
        ` : ''}
        <button class="icon-btn todo-kebab reveal-on-hover ${item.priority || item.dueDate || item.notes ? 'active' : ''}" title="More"
                onclick="toggleItemMenu(event,'${colKey}','${section}','${item.id}')">${iconKebab}</button>
      </div>
      ${hasSubtasks || subtasksOpen ? `
        <div class="todo-subtasks" style="display:${subtasksOpen ? 'block' : 'none'}">
          ${subtasks.map(sub => renderSubRow(colKey, section, item.id, sub)).join('')}
          <div class="todo-subtask-add">
            <input class="todo-subtask-input" placeholder="Add a sub-task…"
                   data-col="${colKey}" data-section="${section}" data-parent="${item.id}"
                   onkeydown="handleSubAddKeydown(event)" />
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// "Since Sep 28 · 4d · Due Oct 3" under a follow-up's text — the age goes coral once
// it's worth chasing, the due date once it's today, tomorrow, or past.
function renderFollowupMeta(item) {
  const days = waitingDays(item);
  const parts = [];
  if (item.waitingSince) parts.push(`<span>Since ${formatShortDate(item.waitingSince)}</span>`);
  if (days >= 1) parts.push(`<span class="${days >= WAITING_NUDGE_DAYS ? 'stale' : ''}">${days}d</span>`);
  if (item.dueDate) parts.push(`<span class="${isDueSoon(item.dueDate) ? 'stale' : ''}">${formatDueLabel(item.dueDate)}</span>`);
  return `<div class="todo-followup-meta">${parts.join('<span class="sep">·</span>')}</div>`;
}

function renderSubRow(colKey, section, parentId, sub) {
  return `
    <div class="todo-subrow" data-id="${sub.id}">
      <div class="todo-check sub ${sub.complete ? 'checked' : ''}"
           onclick="toggleSubtaskComplete('${colKey}','${section}','${parentId}','${sub.id}')"></div>
      <textarea
        class="todo-text todo-textarea sub ${sub.complete ? 'done' : ''}"
        rows="1"
        placeholder="Sub to-do…"
        onmousedown="event.stopPropagation()"
        onclick="event.stopPropagation()"
        oninput="autoGrowTextarea(this)"
        onchange="onSubTextChange('${colKey}','${section}','${parentId}','${sub.id}',this.value)"
        onblur="onSubTextChange('${colKey}','${section}','${parentId}','${sub.id}',this.value)"
        onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}"
      >${escapeHtml(sub.text)}</textarea>
      <button class="icon-btn del reveal-on-hover" title="Delete"
              onclick="event.stopPropagation();deleteSubtask('${colKey}','${section}','${parentId}','${sub.id}')">${iconTrash}</button>
    </div>
  `;
}

function renderDoneRow(colKey, item) {
  return `
    <div class="todo-row row" data-id="${item.id}">
      <div class="todo-check checked static"></div>
      <div class="todo-done-content">
        <div class="todo-text done">${escapeHtml(item.text)}</div>
        ${item.note ? `<div class="todo-done-note">${escapeHtml(item.note)}</div>` : ''}
      </div>
      <span class="todo-done-date">${formatDoneDate(item.completedAt)}</span>
      <button class="icon-btn del reveal-on-hover" title="Delete"
              onclick="deleteDoneItem('${colKey}','${item.id}')">${iconTrash}</button>
    </div>
  `;
}

function renderColumn(colKey) {
  const col = getBlock(colKey);
  const openCount = col.today.filter(i => !i.complete).length;
  const followupsOpen = col.followupsOpen;
  const doneCount = col.done.length;
  const doneOpen = col.doneOpen;
  const colorVars = col.color ? `--block-color:${col.color};--block-tint:${hexToRgba(col.color, 0.07)};` : '';

  return `
    <section class="todo-column" id="col-${colKey}" data-block-id="${colKey}" style="${colorVars}"
              ondragover="onBlockDragOver(event)" ondrop="onBlockDrop(event)" ondragleave="onBlockDragLeave(event)">
      <div class="todo-col-header">
        <input class="todo-col-title-input" value="${escapeHtml(col.name)}"
               onblur="renameBlock('${colKey}', this)"
               onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}" />
        <div class="todo-col-header-right">
          <span class="todo-block-handle reveal-on-hover" title="Drag to reorder" draggable="true" data-col="${colKey}"
                ondragstart="onBlockDragStart(event)" ondragend="onBlockDragEnd(event)">${iconGrip}</span>
          <button class="icon-btn del reveal-on-hover" title="Delete block"
                  onclick="deleteBlock('${colKey}')">${iconTrash}</button>
          <button class="todo-block-color-dot" style="${col.color ? `--swatch:${col.color}` : ''}" title="Block color"
                  onclick="toggleBlockColorPicker(event,'${colKey}')"></button>
        </div>
      </div>

      <div class="todo-col-count section-count" id="count-${colKey}">${openCount} open</div>

      <div class="todo-quick-add">
        <input class="todo-add-input" placeholder="Add a to-do…" data-col="${colKey}" data-section="today"
               onkeydown="handleAddKeydown(event)" />
      </div>

      <div class="todo-list" id="list-${colKey}-today" data-col="${colKey}" data-section="today"
           ondragover="onDragOver(event)" ondrop="onDrop(event)" ondragleave="onDragLeave(event)">
        ${col.today.map(item => renderRow(colKey, 'today', item)).join('')}
      </div>

      <button class="todo-backlog-toggle" onclick="toggleFollowups('${colKey}')">
        <span class="chevron ${followupsOpen ? 'open' : ''}">${iconChevron}</span>
        Follow-ups
        <span class="section-count">${col.followups.length}</span>
      </button>

      <div class="todo-backlog-wrap" style="display:${followupsOpen ? 'block' : 'none'}">
        <div class="todo-quick-add">
          <input class="todo-add-input" placeholder="Waiting on someone? Add a follow-up…" data-col="${colKey}" data-section="followups"
                 onkeydown="handleAddKeydown(event)" />
        </div>
        <div class="todo-list" id="list-${colKey}-followups" data-col="${colKey}" data-section="followups"
             ondragover="onDragOver(event)" ondrop="onDrop(event)" ondragleave="onDragLeave(event)">
          ${col.followups.length === 0
            ? '<div class="todo-backlog-empty">Nothing waiting on anyone</div>'
            : col.followups.map(item => renderRow(colKey, 'followups', item)).join('')}
        </div>
      </div>

      <button class="todo-backlog-toggle" onclick="toggleDone('${colKey}')">
        <span class="chevron ${doneOpen ? 'open' : ''}">${iconChevron}</span>
        Done
        <span class="section-count">${doneCount}</span>
      </button>

      <div class="todo-backlog-wrap" style="display:${doneOpen ? 'block' : 'none'}">
        <div class="todo-list" id="list-${colKey}-done">
          ${col.done.length === 0
            ? '<div class="todo-backlog-empty">Nothing done yet</div>'
            : col.done.map(item => renderDoneRow(colKey, item)).join('')}
        </div>
      </div>
    </section>
  `;
}

/* ─────────────────────────────────────────────
   Summary — open items across every block, grouped by why they're here:
   Flagged first, then Due (overdue/today/tomorrow), then To chase (stale follow-ups).
   Each item lands in the first group it qualifies for, so it's listed once.
───────────────────────────────────────────── */
function collectImportantItems() {
  const groups = { flagged: [], due: [], chase: [] };
  state.blocks.forEach(block => {
    OPEN_SECTIONS.forEach(section => {
      block[section].forEach(item => {
        const entry = { colKey: block.id, colName: block.name, section, item };
        if (item.priority) groups.flagged.push(entry);
        else if (isDueSoon(item.dueDate)) groups.due.push(entry);
        else if (waitingDays(item) >= WAITING_NUDGE_DAYS) groups.chase.push(entry);
      });
    });
  });
  const byDue = (a, b) => {
    const da = a.item.dueDate || '9999-99-99';
    const db = b.item.dueDate || '9999-99-99';
    return da < db ? -1 : da > db ? 1 : 0;
  };
  groups.flagged.sort(byDue);
  groups.due.sort(byDue);
  groups.chase.sort((a, b) => waitingDays(b.item) - waitingDays(a.item));

  // Manual drag order (state.summaryOrder, an array of item ids) applies to Flagged only.
  // Items never manually placed — including newly flagged ones — fall in after it,
  // still in due-date order among themselves.
  const byId = new Map(groups.flagged.map(entry => [entry.item.id, entry]));
  const ordered = (state.summaryOrder || []).map(id => byId.get(id)).filter(Boolean);
  const orderedIds = new Set(ordered.map(entry => entry.item.id));
  groups.flagged = [...ordered, ...groups.flagged.filter(entry => !orderedIds.has(entry.item.id))];
  return groups;
}

// At most one label per row: the most urgent reason. Coral only when it needs action.
function summaryLabel(item) {
  if (isDueSoon(item.dueDate)) return { text: formatDueLabel(item.dueDate), soon: true };
  const days = waitingDays(item);
  if (days >= WAITING_NUDGE_DAYS) return { text: `Waiting ${days}d`, soon: true };
  if (item.dueDate) return { text: formatDueLabel(item.dueDate), soon: false };
  return null;
}

function renderImportantRow({ colKey, colName, section, item }, group) {
  const flagged = !!item.priority;
  const label = summaryLabel(item);
  return `
    <div class="todo-row todo-important-row" data-id="${item.id}">
      ${group === 'flagged' ? `<span class="todo-important-handle reveal-on-hover" title="Drag to reorder" draggable="true" data-id="${item.id}"
            ondragstart="onSummaryDragStart(event)" ondragend="onSummaryDragEnd(event)">${iconGrip}</span>` : ''}
      <div class="todo-check ${flagged ? 'priority' : ''} ${item.complete ? 'checked' : ''}"
           onclick="toggleComplete('${colKey}','${section}','${item.id}')"></div>
      <textarea
        class="todo-text todo-textarea"
        rows="1"
        onmousedown="event.stopPropagation()"
        onclick="event.stopPropagation()"
        oninput="autoGrowTextarea(this)"
        onchange="onTextChange('${colKey}','${section}','${item.id}',this.value)"
        onblur="onTextChange('${colKey}','${section}','${item.id}',this.value)"
        onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault();}"
      >${escapeHtml(item.text)}</textarea>
      ${label ? `<span class="todo-important-due ${label.soon ? 'soon' : ''}">${label.text}</span>` : ''}
      <button class="todo-important-tag" onclick="jumpToBlock('${colKey}')" title="Jump to block">
        ${escapeHtml(colName)}${section === 'followups' && group !== 'chase' ? ' · Follow-up' : ''}
      </button>
    </div>
  `;
}

const SUMMARY_GROUPS = [
  { key: 'flagged', label: 'Flagged' },
  { key: 'due',     label: 'Due' },
  { key: 'chase',   label: 'To chase' },
];

function renderImportant() {
  const groups = collectImportantItems();
  const total = SUMMARY_GROUPS.reduce((n, g) => n + groups[g.key].length, 0);
  const body = SUMMARY_GROUPS.filter(g => groups[g.key].length).map(g => `
    <div class="todo-important-group">
      <div class="todo-important-group-label">${g.label} <span class="todo-important-group-count">${groups[g.key].length}</span></div>
      <div class="todo-important-list" data-group="${g.key}"
           ${g.key === 'flagged' ? 'ondragover="onSummaryDragOver(event)" ondrop="onSummaryDrop(event)" ondragleave="onSummaryDragLeave(event)"' : ''}>
        ${groups[g.key].map(entry => renderImportantRow(entry, g.key)).join('')}
      </div>
    </div>
  `).join('');
  return `
    <section class="todo-important">
      <div class="todo-important-header">
        <span class="todo-important-icon">${iconFlag}</span>
        <span class="todo-important-title">Summary</span>
        <span class="section-count">${total}</span>
      </div>
      ${total === 0
        ? '<div class="todo-backlog-empty">Nothing flagged, due soon, or waiting too long</div>'
        : body}
    </section>
  `;
}

/* ─────────────────────────────────────────────
   Summary drag & drop (manual reorder of the Flagged group)
───────────────────────────────────────────── */
function onSummaryDragStart(event) {
  const handle = event.currentTarget;
  summaryDragging = handle.dataset.id;
  const row = handle.closest('.todo-important-row');
  if (row) row.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', summaryDragging);
  event.stopPropagation();
}

function onSummaryDragEnd(event) {
  document.querySelectorAll('.todo-important-row.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.todo-important-list.drag-over').forEach(el => el.classList.remove('drag-over'));
  summaryDragging = null;
  render();
}

function onSummaryDragOver(event) {
  if (!summaryDragging) return;
  event.preventDefault();
  const list = event.currentTarget;
  list.classList.add('drag-over');
  const draggingEl = document.querySelector(`.todo-important-row[data-id="${summaryDragging}"]`);
  if (!draggingEl) return;
  const afterEl = getSummaryDragAfterElement(list, event.clientY);
  if (afterEl == null) list.appendChild(draggingEl);
  else list.insertBefore(draggingEl, afterEl);
}

function onSummaryDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

function onSummaryDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  if (!summaryDragging) return;
  summaryDragging = null;
  reconcileSummaryOrderFromDom();
}

function getSummaryDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.todo-important-row:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

// Persists the current on-screen row order as the manual summary order. Only the ids
// visible in the list right now are recorded — items that later stop qualifying (done,
// unflagged, no longer due soon) simply drop out next render, and any id that shows up
// again later has lost its old manual position (collectImportantItems() treats it as new).
function reconcileSummaryOrderFromDom() {
  const list = document.querySelector('.todo-important-list[data-group="flagged"]');
  if (!list) return;
  state.summaryOrder = [...list.querySelectorAll('.todo-important-row')].map(el => el.dataset.id);
  persist();
  render();
}

function renderRows() {
  const cols = state.gridCols || 2;
  let html = '';
  for (let i = 0; i < state.blocks.length; i += cols) {
    const group = state.blocks.slice(i, i + cols);
    html += `
      <div class="todo-columns">
        ${group.map(b => renderColumn(b.id)).join('')}
      </div>
    `;
  }
  return html;
}

function renderViewControls() {
  const cols = state.gridCols || 2;
  const size = state.fontSize || 'md';
  return `
    <div class="todo-view-controls">
      <div class="todo-toggle-group" title="Columns">
        ${[2, 3, 4].map(n => `<button class="todo-toggle-btn ${cols === n ? 'active' : ''}" onclick="setGridCols(${n})">${n}</button>`).join('')}
      </div>
      <div class="todo-toggle-group" title="Text size">
        ${[['sm', 'S'], ['md', 'M'], ['lg', 'L']].map(([key, label]) =>
          `<button class="todo-toggle-btn ${size === key ? 'active' : ''}" onclick="setFontSize('${key}')">${label}</button>`
        ).join('')}
      </div>
    </div>
  `;
}

function render() {
  closePopover();
  const app = document.getElementById('app');
  app.classList.toggle('todo-cols-3', state.gridCols === 3);
  app.classList.toggle('todo-cols-4', state.gridCols === 4);
  app.style.setProperty('--todo-font-size', FONT_SIZES[state.fontSize] || FONT_SIZES.md);
  app.innerHTML = `
    <header class="header">
      <div class="header-row">
        <div>
          <div class="eyebrow">Today</div>
          <h1 class="page-title">To Do's</h1>
        </div>
        <div class="todo-header-right">
          <div class="today-label">${getTodayLabel()}</div>
          ${renderViewControls()}
        </div>
      </div>
    </header>

    <div class="arcade-divider"></div>

    ${renderImportant()}

    <div class="todo-blocks" id="todo-blocks">
      ${renderRows()}
    </div>

    <div class="todo-add-block-row">
      <span class="todo-add-block-icon">${iconPlus}</span>
      <input class="todo-add-block-input" placeholder="Add a block…" onkeydown="handleAddBlockKeydown(event)" />
    </div>
  `;
  initAutoGrow();
}

/* ─────────────────────────────────────────────
   Boot
───────────────────────────────────────────── */
boot().then(render);
// Mark-done modal and drags hold item ids across renders — wait for them to finish.
watchState(STORAGE_KEY, DEFAULT_STATE, fresh => {
  state = fresh;
  normalizeState();
  render();
}, { isBusy: () => pageIsBusy() || !!pendingComplete || !!(dragging || blockDragging || summaryDragging) });
