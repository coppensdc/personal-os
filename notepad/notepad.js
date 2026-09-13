/* ─────────────────────────────────────────────
   State & persistence
───────────────────────────────────────────── */
const STORAGE_KEY = 'personal-os-notepad-v1';

let state;

function boot() {
  state = loadState(STORAGE_KEY, { text: '' });
}

function persist() {
  saveState(STORAGE_KEY, state);
}

/* ─────────────────────────────────────────────
   Actions
───────────────────────────────────────────── */
function onInput(el) {
  state.text = el.value;
  persist();
}

/* ─────────────────────────────────────────────
   Render
───────────────────────────────────────────── */
function render() {
  const app = document.getElementById('app');
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

    <textarea
      class="notepad-textarea"
      placeholder="A freeform scratchpad — jot anything down, nothing here is structured."
      oninput="onInput(this)"
    >${escapeHtml(state.text)}</textarea>
  `;
}

/* ─────────────────────────────────────────────
   Boot
───────────────────────────────────────────── */
boot();
render();
