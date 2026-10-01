(function () {
  const base = window.NAV_BASE || '.';
  const active = window.NAV_ACTIVE || '';

  const items = [
    { key: 'home',     label: 'Home',     href: `${base}/index.html` },
    { key: 'todos',    label: "To Do's",  href: `${base}/todos/index.html` },
    { key: 'notepad',  label: 'Notepad',  href: `${base}/notepad/index.html` },
    { key: 'ideas',    label: 'Ideas',    href: `${base}/ideas/index.html` },
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
    // On phones the links are a horizontal scroll row — keep the current page's link visible.
    const links = mount.querySelector('.os-nav-links');
    const current = mount.querySelector('.os-nav-link.active');
    if (links && current && links.scrollWidth > links.clientWidth) {
      links.scrollLeft = current.offsetLeft - links.offsetLeft - 8;
    }
  }

  render();
})();
