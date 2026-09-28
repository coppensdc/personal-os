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

async function loadState(key, fallback) {
  await authReady;
  try {
    const { data, error } = await sb.from('app_state').select('data').eq('key', key).maybeSingle();
    if (error) throw error;
    if (!data) return JSON.parse(JSON.stringify(fallback));
    return { ...JSON.parse(JSON.stringify(fallback)), ...data.data };
  } catch (e) {
    console.error('Supabase load failed, using defaults:', e);
    return JSON.parse(JSON.stringify(fallback));
  }
}

function saveState(key, state) {
  authReady.then(() => sb.from('app_state')
    .upsert({ key, data: state, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error('Supabase save failed:', error);
    }));
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
