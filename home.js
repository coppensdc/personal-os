/* ─────────────────────────────────────────────
   Home: quick capture into To Do's, today's to-do glance, review status,
   open ideas count, app password
───────────────────────────────────────────── */
const TODOS_KEY = 'personal-os-todos-v1';
const IDEAS_KEY = 'personal-os-ideas-v1';
const LAST_BLOCK_KEY = 'personal-os-capture-block'; // per-device convenience only

document.getElementById('today-label').textContent = getTodayLabel();

function setMsg(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ''; }, 3000);
}

async function loadTodos() {
  renderTodos(await loadState(TODOS_KEY, {}));
}

function renderTodos(todos) {
  renderBlocks(todos);
  renderTodosGlance(todos);
  renderReviewStatus(todos);
}

function renderBlocks(todos) {
  const select = document.getElementById('home-capture-block');
  const blocks = Array.isArray(todos.blocks) ? todos.blocks : [];
  let last = null;
  try { last = localStorage.getItem(LAST_BLOCK_KEY); } catch (e) {}
  select.innerHTML = blocks.map(b =>
    `<option value="${escapeHtml(b.id)}" ${b.id === last ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
  document.getElementById('home-capture').hidden = !blocks.length;
}

// Same rules as To Do's Summary: planned today, slipped (planned for a past day),
// due today/tomorrow or overdue — open items only, Today and Follow-ups.
function renderTodosGlance(todos) {
  const el = document.getElementById('home-todos-desc');
  if (!el.dataset.defaultText) el.dataset.defaultText = el.textContent;
  const today = todayISO(), tomorrow = addDaysISO(today, 1);
  let planned = 0, slipped = 0, due = 0;
  (todos.blocks || []).forEach(b => ['today', 'followups'].forEach(section =>
    (Array.isArray(b[section]) ? b[section] : []).forEach(i => {
      if (i.plannedFor === today) planned++;
      if (isBehind(i)) slipped++;
      if (i.dueDate && i.dueDate <= tomorrow) due++;
    })));
  const parts = [];
  if (planned) parts.push(`${planned} planned today`);
  if (slipped) parts.push(`<span class="hot">${slipped} slipped</span>`);
  if (due) parts.push(`${due} due soon`);
  if (parts.length) el.innerHTML = parts.join(' · ');
  else el.textContent = el.dataset.defaultText;
}

// Mirrors needsReview() in todos.js: a weekend review counts for the week after.
function renderReviewStatus(todos) {
  const el = document.getElementById('home-review-desc');
  if (!el.dataset.defaultText) el.dataset.defaultText = el.textContent;
  const last = todos.lastReviewAt;
  if (!last || planWeekStartISO(last) < planWeekStartISO()) {
    const week = parseISODate(planWeekStartISO()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    el.innerHTML = `<span class="hot">Not done for the week of ${week} yet</span>`;
  } else {
    el.textContent = el.dataset.defaultText;
  }
}

async function captureTodo() {
  const input = document.getElementById('home-capture-input');
  const text = input.value.trim();
  if (!text) return;
  const blockId = document.getElementById('home-capture-block').value;
  // Re-read at submit time so a to-do added elsewhere since page load isn't lost.
  const todos = await loadState(TODOS_KEY, {});
  const block = (todos.blocks || []).find(b => b.id === blockId);
  if (!block) { setMsg('home-capture-msg', 'That block no longer exists — reload.'); return; }
  if (!Array.isArray(block.today)) block.today = [];
  block.today.unshift({
    id: uid(), text, complete: false, priority: false, waiting: false, dueDate: null,
    notes: '', subtasks: [], subtasksOpen: false, createdAt: new Date().toISOString(),
  });
  saveState(TODOS_KEY, todos);
  try { localStorage.setItem(LAST_BLOCK_KEY, blockId); } catch (e) {}
  input.value = '';
  input.focus();
  setMsg('home-capture-msg', `Added to ${block.name}`);
}

async function loadIdeasCount() {
  renderIdeasCount(await loadState(IDEAS_KEY, {}));
}

// `shipped` is stamped onto ideas by the Ideas page when it sees them in ideas/log.js.
function renderIdeasCount(data) {
  const el = document.getElementById('home-ideas-desc');
  if (!el.dataset.defaultText) el.dataset.defaultText = el.textContent;
  const open = (data.ideas || []).filter(i => !i.shipped).length;
  el.textContent = open ? `${open} open · Claude builds one a week` : el.dataset.defaultText;
}

async function savePassword() {
  const input = document.getElementById('home-password');
  if (input.value.length < 8) { setMsg('home-password-msg', 'Use at least 8 characters.'); return; }
  await authReady;
  const { error } = await sb.auth.updateUser({ password: input.value });
  input.value = '';
  setMsg('home-password-msg', error ? error.message : 'Password saved.');
}

loadTodos();
loadIdeasCount();
watchState(TODOS_KEY, {}, renderTodos);
watchState(IDEAS_KEY, {}, renderIdeasCount);
