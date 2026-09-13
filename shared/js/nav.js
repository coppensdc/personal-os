(function () {
  const base = window.NAV_BASE || '.';
  const active = window.NAV_ACTIVE || '';

  const items = [
    { key: 'home',     label: 'Home',     href: `${base}/index.html` },
    { key: 'todos',    label: "To Do's",  href: `${base}/todos/index.html` },
    { key: 'rocks',    label: 'Rocks',    href: `${base}/rocks/index.html` },
    { key: 'notepad',  label: 'Notepad',  href: `${base}/notepad/index.html` },
    { key: 'agents',   label: 'Agents',   href: `${base}/agents/index.html` },
  ];

  function render() {
    const mount = document.getElementById('os-nav');
    if (!mount) return;
    mount.innerHTML = `
      <div class="os-nav">
        <div class="os-nav-inner">
          <a class="os-nav-brand" href="${base}/index.html">Personal OS</a>
          <div class="os-nav-links">
            ${items.map(i => `
              <a class="os-nav-link ${i.key === active ? 'active' : ''}" href="${i.href}">${i.label}</a>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  render();
})();
