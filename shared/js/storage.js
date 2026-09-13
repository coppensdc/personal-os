const SUPABASE_URL = 'https://seuqxfxjvrwoimdwmoau.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNldXF4ZnhqdnJ3b2ltZHdtb2F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMjU2ODUsImV4cCI6MjEwNDkwMTY4NX0.wQSZEJbnzqWVQFvaA-h0nShMppdybs64qmYy-Z6hLLk';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function loadState(key, fallback) {
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
  sb.from('app_state')
    .upsert({ key, data: state, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error('Supabase save failed:', error);
    });
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
