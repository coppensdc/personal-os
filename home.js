/* ─────────────────────────────────────────────
   Home: quick capture into To Do's, decisions-due count, app password
───────────────────────────────────────────── */
const TODOS_KEY = 'personal-os-todos-v1';
const DECISIONS_KEY = 'personal-os-decisions-v1';
const LAST_BLOCK_KEY = 'personal-os-capture-block'; // per-device convenience only

document.getElementById('today-label').textContent = getTodayLabel();

function setMsg(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ''; }, 3000);
}

async function loadBlocks() {
  renderBlocks(await loadState(TODOS_KEY, {}));
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

async function loadDecisionsDue() {
  renderDecisionsDue(await loadState(DECISIONS_KEY, {}));
}

function renderDecisionsDue(data) {
  const el = document.getElementById('home-decisions-desc');
  if (!el.dataset.defaultText) el.dataset.defaultText = el.textContent;
  const due = (data.decisions || []).filter(d => !d.verdict && d.reviewOn && d.reviewOn <= todayISO()).length;
  el.textContent = due ? `${due} due for review` : el.dataset.defaultText;
  el.classList.toggle('home-due', !!due);
}

async function savePassword() {
  const input = document.getElementById('home-password');
  if (input.value.length < 8) { setMsg('home-password-msg', 'Use at least 8 characters.'); return; }
  await authReady;
  const { error } = await sb.auth.updateUser({ password: input.value });
  input.value = '';
  setMsg('home-password-msg', error ? error.message : 'Password saved.');
}

loadBlocks();
loadDecisionsDue();
watchState(TODOS_KEY, {}, renderBlocks);
watchState(DECISIONS_KEY, {}, renderDecisionsDue);
