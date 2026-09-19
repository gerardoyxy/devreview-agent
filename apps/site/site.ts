import './demo.js';

// Static landing only. No local agent connections or backend requests.
const root = document.documentElement;
const toggle = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let preference: 'light' | 'dark' | null = null;
try {
  const saved = localStorage.getItem('nudgethis-site-theme');
  if (saved === 'light' || saved === 'dark') preference = saved;
} catch { /* System mode still works when storage is unavailable. */ }

function updateTheme(): void {
  const mode = preference ?? (systemTheme.matches ? 'dark' : 'light');
  root.dataset.theme = mode;
  if (toggle) {
    const nextMode = mode === 'dark' ? 'light' : 'dark';
    toggle.textContent = nextMode === 'dark' ? 'Dark mode' : 'Light mode';
    toggle.setAttribute('aria-label', `Switch to ${nextMode} mode`);
  }
}

if (toggle) {
  updateTheme();
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('nudgethis-site-theme', preference); } catch { /* Keep the session choice. */ }
    updateTheme();
  });
  systemTheme.addEventListener('change', () => { if (preference === null) updateTheme(); });
}
