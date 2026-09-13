function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return JSON.parse(JSON.stringify(fallback));
    return { ...JSON.parse(JSON.stringify(fallback)), ...JSON.parse(raw) };
  } catch (e) {
    return JSON.parse(JSON.stringify(fallback));
  }
}

function saveState(key, state) {
  localStorage.setItem(key, JSON.stringify(state));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getTodayLabel() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

function getQuarterLabel() {
  const d = new Date();
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}
