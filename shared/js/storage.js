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
      document.addEventListener('DOMContentLoaded', renderSignIn);
    } else {
      renderSignIn();
    }
  });
})();

function renderSignIn() {
  if (document.querySelector('.auth-overlay')) return;
  const el = document.createElement('div');
  el.className = 'auth-overlay';
  el.innerHTML = `
    <form class="auth-box" id="auth-email-form">
      <div class="eyebrow">Personal OS</div>
      <h1 class="auth-title">Sign in</h1>
      <input class="auth-input" id="auth-email" type="email" autocomplete="email" placeholder="Email" required>
      <button class="auth-btn" type="submit">Send sign-in email</button>
      <div class="auth-msg" id="auth-msg"></div>
    </form>
  `;
  document.body.appendChild(el);
  const msg = el.querySelector('#auth-msg');

  el.querySelector('#auth-email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = el.querySelector('#auth-email').value.trim();
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
    <form class="auth-box" id="auth-code-form">
      <div class="eyebrow">Personal OS</div>
      <h1 class="auth-title">Check your email</h1>
      <p class="auth-hint">Click the link in the email, or enter the code here.</p>
      <input class="auth-input" id="auth-code" inputmode="numeric" autocomplete="one-time-code" placeholder="Code" required>
      <button class="auth-btn" type="submit">Sign in</button>
      <div class="auth-msg" id="auth-msg"></div>
    </form>
  `;
  const msg = el.querySelector('#auth-msg');
  el.querySelector('#auth-code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = el.querySelector('#auth-code').value.replace(/\s/g, '');
    msg.textContent = 'Checking…';
    const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) msg.textContent = error.message;
    // On success, onAuthStateChange in requireAuth removes the overlay.
  });
}

// Sign-out button in the nav, added once signed in (nav.js runs before this file).
authReady.then(() => {
  const inner = document.querySelector('.os-nav-inner');
  if (!inner || inner.querySelector('.os-nav-signout')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'os-nav-signout';
  btn.textContent = 'Sign out';
  btn.addEventListener('click', signOut);
  inner.appendChild(btn);
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

function getTodayLabel() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

function getQuarterLabel() {
  const d = new Date();
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}
