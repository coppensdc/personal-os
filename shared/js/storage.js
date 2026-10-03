const SUPABASE_URL = 'https://seuqxfxjvrwoimdwmoau.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNldXF4ZnhqdnJ3b2ltZHdtb2F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMjU2ODUsImV4cCI6MjEwNDkwMTY4NX0.wQSZEJbnzqWVQFvaA-h0nShMppdybs64qmYy-Z6hLLk';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Every data call awaits this. Resolves once there's a signed-in session;
// until then a full-screen sign-in overlay covers the page.
const authReady = (async function requireAuth() {
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;
  return new Promise((resolve) => {
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (session) {
        sub.subscription.unsubscribe();
        document.querySelector('.auth-overlay')?.remove();
        resolve(session);
      }
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => renderSignIn());
    } else {
      renderSignIn();
    }
  });
})();

function renderSignIn(mode = 'link') {
  let el = document.querySelector('.auth-overlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'auth-overlay';
    document.body.appendChild(el);
  }
  const usePassword = mode === 'password';
  el.innerHTML = `
    <form class="auth-box" id="auth-email-form">
      <div class="eyebrow">Personal OS</div>
      <h1 class="auth-title">Sign in</h1>
      <input class="auth-input" id="auth-email" type="email" autocomplete="email" placeholder="Email" required>
      ${usePassword ? '<input class="auth-input" id="auth-password" type="password" autocomplete="current-password" placeholder="Password" required>' : ''}
      <button class="auth-btn" type="submit">${usePassword ? 'Sign in' : 'Send sign-in email'}</button>
      <button class="auth-switch" type="button" id="auth-switch">${usePassword ? 'Email me a link instead' : 'Sign in with password'}</button>
      <div class="auth-msg" id="auth-msg"></div>
    </form>
  `;
  const msg = el.querySelector('#auth-msg');
  el.querySelector('#auth-switch').addEventListener('click', () => renderSignIn(usePassword ? 'link' : 'password'));

  el.querySelector('#auth-email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = el.querySelector('#auth-email').value.trim();
    if (usePassword) {
      msg.textContent = 'Signing in…';
      const { error } = await sb.auth.signInWithPassword({ email, password: el.querySelector('#auth-password').value });
      if (error) msg.textContent = error.message;
      // On success, onAuthStateChange in requireAuth removes the overlay.
      return;
    }
    msg.textContent = 'Sending…';
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: location.href.split('#')[0] },
    });
    if (error) { msg.textContent = error.message; return; }
    renderCodeStep(el, email);
  });
}

function renderCodeStep(el, email) {
  el.innerHTML = `
    <div class="auth-box">
      <div class="eyebrow">Personal OS</div>
      <h1 class="auth-title">Check your email</h1>
      <p class="auth-hint">We sent a sign-in link to ${escapeHtml(email)}. Open it in this browser.</p>
    </div>
  `;
}

// Sign-out button in the nav, added once signed in. Waits for the DOM too, so it
// doesn't depend on nav.js having run before this file.
authReady.then(() => {
  const add = () => {
    const inner = document.querySelector('.os-nav-inner');
    if (!inner || inner.querySelector('.os-nav-signout')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'os-nav-signout';
    btn.textContent = 'Sign out';
    btn.addEventListener('click', signOut);
    inner.appendChild(btn);
    // The button narrows the (phone) scrolling link row — keep the current page's link in view.
    inner.querySelector('.os-nav-link.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
});

async function signOut() {
  await sb.auth.signOut();
  location.reload();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Every row version (updated_at, ms) this page has loaded or written, per key —
// lets watchState() tell another device's save apart from the echo of our own.
const seenVersions = {};
// Saves started / still in flight per key — a fetch that overlaps one may return
// the row from before our save landed, so its result is discarded.
const saveCounter = {};
const savesInFlight = {};

function noteVersion(key, updatedAt) {
  if (!updatedAt) return;
  (seenVersions[key] = seenVersions[key] || new Set()).add(Date.parse(updatedAt));
}

function mergeWithFallback(saved, fallback) {
  return { ...JSON.parse(JSON.stringify(fallback)), ...(saved || {}) };
}

async function loadState(key, fallback) {
  await authReady;
  try {
    const { data, error } = await sb.from('app_state').select('data, updated_at').eq('key', key).maybeSingle();
    if (error) throw error;
    if (!data) return JSON.parse(JSON.stringify(fallback));
    noteVersion(key, data.updated_at);
    return mergeWithFallback(data.data, fallback);
  } catch (e) {
    console.error('Supabase load failed, using defaults:', e);
    return JSON.parse(JSON.stringify(fallback));
  }
}

function saveState(key, state) {
  const updatedAt = new Date().toISOString();
  noteVersion(key, updatedAt);
  saveCounter[key] = (saveCounter[key] || 0) + 1;
  savesInFlight[key] = (savesInFlight[key] || 0) + 1;
  authReady.then(() => sb.from('app_state')
    .upsert({ key, data: state, updated_at: updatedAt })
    .then(({ error }) => {
      if (error) console.error('Supabase save failed:', error);
    }))
    .finally(() => { savesInFlight[key]--; });
}

// True while the person is mid-edit on this page (typing in a field) — applying a
// remote change then would re-render away their caret. An unfocused window is never
// busy: blurring the window already committed whatever field was being edited.
function pageIsBusy() {
  if (!document.hasFocus()) return false;
  const el = document.activeElement;
  return !!el && (el.matches('input, textarea, select') || el.isContentEditable);
}

// Keeps a page's copy of one row current, so a long-open tab (or a floating
// window) doesn't overwrite newer saves from another device with a stale blob.
// Re-checks on Supabase Realtime changes to the row, when the page becomes
// visible/focused again (covers events missed while asleep or offline), and every
// few minutes as a fallback. onChange(freshState) is called only for versions
// this page didn't write itself, and never while isBusy() — it's retried after.
// Requires Realtime enabled for app_state (Database → Publications).
function watchState(key, fallback, onChange, { isBusy = pageIsBusy } = {}) {
  let checking = false;
  let recheck = false;
  let retryTimer = null;

  async function check() {
    if (checking) { recheck = true; return; }
    checking = true;
    try {
      await authReady;
      const savesBefore = saveCounter[key] || 0;
      const overlapped = () => savesInFlight[key] > 0 || (saveCounter[key] || 0) !== savesBefore;
      if (overlapped()) return schedule(1000);
      const { data, error } = await sb.from('app_state').select('data, updated_at').eq('key', key).maybeSingle();
      if (error || !data) return;
      if (overlapped()) return schedule(1000);
      if (seenVersions[key]?.has(Date.parse(data.updated_at))) return;
      if (isBusy()) return schedule(1500);
      noteVersion(key, data.updated_at);
      onChange(mergeWithFallback(data.data, fallback));
    } catch (e) {
      console.error('Sync check failed:', e);
    } finally {
      checking = false;
      if (recheck) { recheck = false; check(); }
    }
  }

  function schedule(ms) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(check, ms);
  }

  authReady.then(() => {
    sb.channel(`app_state:${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: `key=eq.${key}` }, () => check())
      .subscribe((status) => { if (status === 'SUBSCRIBED') check(); });
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  setInterval(() => { if (document.visibilityState === 'visible') check(); }, 5 * 60 * 1000);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Dates: YYYY-MM-DD strings in local time (avoids new Date('2026-08-30')'s UTC shift) ── */
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayISO() {
  return isoDate(new Date());
}

function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysISO(iso, days) {
  const dt = parseISODate(iso);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

function daysBetweenISO(fromIso, toIso) {
  return Math.round((parseISODate(toIso) - parseISODate(fromIso)) / 86400000);
}

// Monday of the week containing iso.
function weekStartISO(iso) {
  return addDaysISO(iso, -((parseISODate(iso).getDay() + 6) % 7));
}

// The week being planned on a given day (Monday review + To Do's Summary): that week
// through Friday, the next one from Saturday on — a weekend review plans the week ahead.
function planWeekStartISO(iso = todayISO()) {
  const dow = (parseISODate(iso).getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDaysISO(weekStartISO(iso), dow >= 5 ? 7 : 0);
}

function weekdayShort(iso) {
  return parseISODate(iso).toLocaleDateString('en-US', { weekday: 'short' });
}

// uid() starts with Date.now() in base 36 (8 chars until 2059) — recover it.
function idTimestamp(id) {
  const ms = parseInt(String(id).slice(0, 8), 36);
  return ms > Date.UTC(2020, 0, 1) && ms <= Date.now() ? new Date(ms).toISOString() : null;
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
