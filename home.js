/* ─────────────────────────────────────────────
   Home: quick capture into To Do's, open ideas count, app password
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

loadBlocks();
loadIdeasCount();
watchState(TODOS_KEY, {}, renderBlocks);
watchState(IDEAS_KEY, {}, renderIdeasCount);
