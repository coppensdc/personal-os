(function () {
  const DB_NAME = 'personal-os-backup';
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'dir';
  const META_KEY = 'personal-os-backup-meta';
  const RETENTION_DAYS = 14;
  const FILE_RE = /^personal-os-backup-(\d{4}-\d{2}-\d{2})\.json$/;

  const supported = !!window.showDirectoryPicker;

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function writeMeta(patch) {
    const meta = Object.assign(readMeta(), patch);
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    return meta;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getStoredHandle() {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async function setStoredHandle(handle) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearStoredHandle() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function collectAllData() {
    const { data, error } = await sb.from('app_state').select('key, data');
    if (error) throw error;
    const result = {};
    (data || []).forEach((row) => { result[row.key] = row.data; });
    return result;
  }

  async function ensurePermission(handle, requestIfNeeded) {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (!requestIfNeeded) return false;
    try { return (await handle.requestPermission(opts)) === 'granted'; }
    catch (e) { return false; }
  }

  async function pruneOldSnapshots(dirHandle) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    for await (const name of dirHandle.keys()) {
      const m = name.match(FILE_RE);
      if (m && new Date(m[1]) < cutoff) {
        try { await dirHandle.removeEntry(name); } catch (e) {}
      }
    }
  }

  async function writeSnapshot(dirHandle) {
    const fileHandle = await dirHandle.getFileHandle(`personal-os-backup-${todayStr()}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(await collectAllData(), null, 2));
    await writable.close();
    await pruneOldSnapshots(dirHandle);
    writeMeta({ folderName: dirHandle.name, lastBackup: new Date().toISOString(), lastError: null });
  }

  async function connectFolder() {
    if (!supported) return;
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'personal-os-backup', mode: 'readwrite' });
    } catch (e) { return; }
    const ok = await ensurePermission(handle, true);
    if (!ok) { writeMeta({ lastError: 'Permission denied.' }); renderWidget(); return; }
    await setStoredHandle(handle);
    try { await writeSnapshot(handle); }
    catch (e) { writeMeta({ lastError: 'Could not write backup file.' }); }
    renderWidget();
  }

  async function backupNow() {
    const handle = await getStoredHandle();
    if (!handle) { await connectFolder(); return; }
    const ok = await ensurePermission(handle, true);
    if (!ok) { writeMeta({ lastError: 'Reconnect needed — click "Back up now" again.' }); renderWidget(); return; }
    try { await writeSnapshot(handle); }
    catch (e) { writeMeta({ lastError: 'Could not write backup file.' }); }
    renderWidget();
  }

  async function disconnect() {
    await clearStoredHandle();
    writeMeta({ folderName: null, lastBackup: null, lastError: null });
    renderWidget();
  }

  let restoreOpen = false;
  let restoreSnapshots = [];
  let restoreSelected = null;
  let restoreBusy = false;
  let restoreMessage = null;

  async function listSnapshots(dirHandle) {
    const files = [];
    for await (const name of dirHandle.keys()) {
      const m = name.match(FILE_RE);
      if (m) files.push({ name, date: m[1] });
    }
    files.sort((a, b) => b.date.localeCompare(a.date));
    return files;
  }

  async function restoreFrom(dirHandle, filename) {
    const fileHandle = await dirHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const data = JSON.parse(await file.text());
    const rows = Object.keys(data)
      .filter((key) => key.indexOf('personal-os-') === 0)
      .map((key) => ({ key, data: data[key], updated_at: new Date().toISOString() }));
    if (!rows.length) return;
    const { error } = await sb.from('app_state').upsert(rows);
    if (error) throw error;
  }

  async function openRestore() {
    const handle = await getStoredHandle();
    if (!handle) return;
    const ok = await ensurePermission(handle, true);
    if (!ok) { writeMeta({ lastError: 'Reconnect needed — click "Back up now" first.' }); renderWidget(); return; }
    restoreSnapshots = await listSnapshots(handle);
    restoreOpen = true;
    restoreSelected = null;
    restoreMessage = null;
    renderWidget();
  }

  function closeRestore() {
    restoreOpen = false;
    renderWidget();
  }

  function selectRestoreSnapshot(name) {
    restoreSelected = name;
    renderWidget();
  }

  async function confirmRestore() {
    if (!restoreSelected || restoreBusy) return;
    const proceed = window.confirm(
      `Restore the snapshot from ${restoreSelected.match(FILE_RE)[1]}? This overwrites everything currently in Personal OS on this page — there's no undo besides another backup.`
    );
    if (!proceed) return;
    restoreBusy = true;
    renderWidget();
    const handle = await getStoredHandle();
    try {
      await restoreFrom(handle, restoreSelected);
      location.reload();
    } catch (e) {
      restoreBusy = false;
      restoreMessage = 'Could not restore that snapshot.';
      renderWidget();
    }
  }

  function formatSnapshotDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function renderRestorePanel() {
    if (!restoreSnapshots.length) {
      return `
        <div class="os-backup-restore">
          <p class="os-backup-desc">No snapshots found in this folder.</p>
          <div class="os-backup-actions"><button onclick="PersonalOSBackup.closeRestore()">Close</button></div>
        </div>
      `;
    }
    return `
      <div class="os-backup-restore">
        <p class="os-backup-desc">Pick a snapshot to restore. This overwrites everything currently in Personal OS with that day's data.</p>
        <div class="os-backup-restore-list">
          ${restoreSnapshots.map((s) => `
            <label class="os-backup-restore-item">
              <input type="radio" name="os-backup-restore-choice" value="${s.name}" ${restoreSelected === s.name ? 'checked' : ''} onchange="PersonalOSBackup.selectRestoreSnapshot('${s.name}')">
              ${formatSnapshotDate(s.date)}
            </label>
          `).join('')}
        </div>
        ${restoreMessage ? `<div class="os-backup-error">${escapeHtml(restoreMessage)}</div>` : ''}
        <div class="os-backup-actions">
          <button onclick="PersonalOSBackup.confirmRestore()" ${!restoreSelected || restoreBusy ? 'disabled' : ''}>${restoreBusy ? 'Restoring…' : 'Restore'}</button>
          <button onclick="PersonalOSBackup.closeRestore()">Cancel</button>
        </div>
      </div>
    `;
  }

  async function maybeAutoBackup() {
    if (!supported) return;
    const handle = await getStoredHandle();
    if (!handle) return;
    const meta = readMeta();
    if (meta.lastBackup && meta.lastBackup.slice(0, 10) === todayStr()) return;
    const ok = await ensurePermission(handle, false);
    if (!ok) { writeMeta({ lastError: 'Backup folder needs to be reconnected.' }); renderWidget(); return; }
    try { await writeSnapshot(handle); }
    catch (e) { writeMeta({ lastError: 'Could not write backup file.' }); }
    renderWidget();
  }

  function formatLastBackup(iso) {
    if (!iso) return 'Never';
    const d = new Date(iso);
    if (iso.slice(0, 10) === todayStr()) {
      return `Today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function renderWidget() {
    const mount = document.getElementById('os-backup');
    if (!mount) return;

    if (!supported) {
      mount.innerHTML = `
        <div class="os-backup">
          <button class="os-backup-pill" disabled title="Needs Chrome or Edge">Backup unavailable</button>
        </div>
      `;
      return;
    }

    const meta = readMeta();
    const connected = !!meta.folderName;
    const panelWasOpen = document.getElementById('os-backup-panel') &&
      document.getElementById('os-backup-panel').style.display !== 'none';

    mount.innerHTML = `
      <div class="os-backup">
        <button class="os-backup-pill" onclick="PersonalOSBackup.togglePanel()">
          <span class="os-backup-dot ${connected ? 'ok' : ''}"></span>
          ${connected ? `Backed up · ${formatLastBackup(meta.lastBackup)}` : 'Backup not set up'}
        </button>
        <div class="os-backup-panel" id="os-backup-panel" style="display:${panelWasOpen ? 'block' : 'none'}">
          ${connected ? `
            <div class="os-backup-row"><span>Folder</span><strong>${escapeHtml(meta.folderName)}</strong></div>
            <div class="os-backup-row"><span>Last backup</span><strong>${formatLastBackup(meta.lastBackup)}</strong></div>
            <div class="os-backup-row"><span>Keeping</span><strong>Last ${RETENTION_DAYS} days</strong></div>
            ${meta.lastError ? `<div class="os-backup-error">${escapeHtml(meta.lastError)}</div>` : ''}
            <div class="os-backup-actions">
              <button onclick="PersonalOSBackup.backupNow()">Back up now</button>
              <button onclick="PersonalOSBackup.openRestore()">Restore…</button>
              <button onclick="PersonalOSBackup.disconnect()">Disconnect</button>
            </div>
            ${restoreOpen ? renderRestorePanel() : ''}
          ` : `
            <p class="os-backup-desc">Pick a folder to save a dated snapshot of everything in Personal OS once a day. Snapshots older than ${RETENTION_DAYS} days are removed automatically.</p>
            <div class="os-backup-actions">
              <button onclick="PersonalOSBackup.connectFolder()">Choose folder</button>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function togglePanel() {
    const panel = document.getElementById('os-backup-panel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  document.addEventListener('click', (event) => {
    const widget = document.getElementById('os-backup');
    const panel = document.getElementById('os-backup-panel');
    if (panel && panel.style.display !== 'none' && widget && !widget.contains(event.target)) {
      panel.style.display = 'none';
    }
  });

  window.PersonalOSBackup = {
    connectFolder, backupNow, disconnect, togglePanel,
    openRestore, closeRestore, selectRestoreSnapshot, confirmRestore,
  };

  document.addEventListener('DOMContentLoaded', () => {
    const mount = document.createElement('div');
    mount.id = 'os-backup';
    document.body.appendChild(mount);
    renderWidget();
    maybeAutoBackup();
  });
})();
