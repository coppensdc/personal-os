/* ─────────────────────────────────────────────
   State & persistence
───────────────────────────────────────────── */
const STORAGE_KEY = 'personal-os-notepad-v1';

let state;

async function boot() {
  state = await loadState(STORAGE_KEY, { text: '' });
  state.text = migrateToHtml(state.text);
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

/* ─────────────────────────────────────────────
   Icons
───────────────────────────────────────────── */
const iconBold = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 2h3.2a2.3 2.3 0 0 1 0 4.6H3.5z"/><path d="M3.5 6.6h3.6a2.4 2.4 0 0 1 0 4.8H3.5z"/></svg>`;

const iconItalic = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="7.5" y1="2" x2="4.5" y2="11"/><line x1="4" y1="2" x2="8" y2="2"/><line x1="3" y1="11" x2="7" y2="11"/></svg>`;

const iconUnderline = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 2v4.5a3.5 3.5 0 0 0 7 0V2"/><line x1="2.5" y1="11.5" x2="10.5" y2="11.5"/></svg>`;

const iconBulletList = `<svg width="13" height="13" viewBox="0 0 13 13"><circle cx="2" cy="3" r="0.9" fill="currentColor"/><circle cx="2" cy="6.5" r="0.9" fill="currentColor"/><circle cx="2" cy="10" r="0.9" fill="currentColor"/><line x1="5" y1="3" x2="11.5" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="6.5" x2="11.5" y2="6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="10" x2="11.5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const iconNumberedList = `<svg width="13" height="13" viewBox="0 0 13 13"><text x="0.3" y="4.1" font-size="4" font-family="sans-serif" fill="currentColor">1</text><text x="0.3" y="7.6" font-size="4" font-family="sans-serif" fill="currentColor">2</text><text x="0.3" y="11.1" font-size="4" font-family="sans-serif" fill="currentColor">3</text><line x1="5" y1="3" x2="11.5" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="6.5" x2="11.5" y2="6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="10" x2="11.5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

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
function onEditorInput(el) {
  state.text = el.innerHTML;
  persist();
}

function applyCmd(cmd) {
  document.execCommand(cmd, false, null);
  const editor = document.getElementById('notepad-editor');
  state.text = editor.innerHTML;
  persist();
  updateToolbarState();
  editor.focus();
}

function updateToolbarState() {
  document.querySelectorAll('.notepad-tool').forEach(btn => {
    let active = false;
    try { active = document.queryCommandState(btn.dataset.cmd); } catch (e) {}
    btn.classList.toggle('active', active);
  });
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

    <div class="notepad-toolbar">
      ${TOOLS.map(t => t.sep
        ? `<span class="notepad-toolbar-sep"></span>`
        : `<button class="icon-btn notepad-tool" data-cmd="${t.cmd}" title="${t.title}"
             onmousedown="event.preventDefault()" onclick="applyCmd('${t.cmd}')">${t.icon}</button>`
      ).join('')}
    </div>

    <div
      id="notepad-editor"
      class="notepad-editor"
      contenteditable="true"
      data-placeholder="A freeform scratchpad — jot anything down, nothing here is structured."
      oninput="onEditorInput(this)"
      onkeyup="updateToolbarState()"
      onmouseup="updateToolbarState()"
    >${state.text}</div>
  `;
}

document.addEventListener('selectionchange', () => {
  if (document.activeElement && document.activeElement.id === 'notepad-editor') updateToolbarState();
});

/* ─────────────────────────────────────────────
   Boot
───────────────────────────────────────────── */
boot().then(render);
