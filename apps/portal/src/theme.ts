export type Theme = 'light' | 'dark';

const KEY = 'kws_theme';

export function getInitialTheme(): Theme {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'light' || s === 'dark') return s;
  } catch { /* storage disabled */ }
  return 'dark'; // default to the dark look
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}
