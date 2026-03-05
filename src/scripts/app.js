const Alpine = window.Alpine;

function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode, persist = true) {
  const safeMode = mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system';
  document.documentElement.setAttribute('data-theme-mode', safeMode);
  document.documentElement.setAttribute('data-theme', resolveTheme(safeMode));
  const select = document.getElementById('themeSelect');
  if (select && select.value !== safeMode) select.value = safeMode;
  if (persist) localStorage.setItem('coachForgeThemeMode.v1', safeMode);
}

Alpine.data('dashboardApp', ({ canImportLegacy }) => ({
  canImportLegacy,
  sidebarCollapsed: false,

  init() {
    this.sidebarCollapsed = localStorage.getItem('coachForgeSidebarCollapsed.v1') === 'true';
    document.body.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);

    const storedTheme = localStorage.getItem('coachForgeThemeMode.v1') || 'system';
    applyTheme(storedTheme, false);

    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.value = storedTheme;
      themeSelect.addEventListener('change', (event) => applyTheme(event.target.value, true));
    }

    const importButton = document.getElementById('manualImportButton');
    const importFile = document.getElementById('manualImportFile');
    if (importButton && importFile) {
      importButton.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', async () => {
        const file = importFile.files?.[0];
        if (!file) return;
        const text = await file.text();
        let payload = null;
        try {
          payload = JSON.parse(text);
        } catch (_error) {
          return;
        }

        await fetch('/api/import-legacy', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            state: payload.state ?? payload,
            themeMode: payload.themeMode || localStorage.getItem('coachForgeThemeMode.v1') || 'system'
          })
        });

        window.location.reload();
      });
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const current = localStorage.getItem('coachForgeThemeMode.v1') || 'system';
      if (current === 'system') applyTheme('system', false);
    });

    document.body.addEventListener('click', (event) => {
      const closeButton = event.target.closest('[data-close-modal="true"]');
      if (closeButton) {
        this.closeModal();
        return;
      }

      if (event.target.matches('.modal-overlay[data-overlay-close="true"]')) {
        this.closeModal();
      }
    });

    document.body.addEventListener('htmx:afterSwap', (event) => {
      if (event.target.id === 'modalHost') {
        const firstFocusable = event.target.querySelector('input, textarea, select, button');
        if (firstFocusable) firstFocusable.focus();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeModal();
    });

    if (this.canImportLegacy) this.tryLegacyImport();
  },

  closeModal() {
    const host = document.getElementById('modalHost');
    if (host) host.innerHTML = '';
  },

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    document.body.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
    localStorage.setItem('coachForgeSidebarCollapsed.v1', String(this.sidebarCollapsed));
  },

  async tryLegacyImport() {
    const raw = localStorage.getItem('retroCoachResearchDashboard.v1');
    if (!raw) return;

    try {
      const response = await fetch('/api/import-legacy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state: raw,
          themeMode: localStorage.getItem('coachForgeThemeMode.v1') || 'system'
        })
      });

      if (response.ok) window.location.reload();
    } catch (_error) {
      // Ignore migration failures here. Manual export/import remains the fallback.
    }
  }
}));

Alpine.start();
