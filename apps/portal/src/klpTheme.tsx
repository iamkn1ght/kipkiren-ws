import { useState } from 'react';

export type Mode = 'light' | 'dark';

const KEY = 'klp_mode';
const current = (): Mode => (typeof document !== 'undefined' && document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light');

export function useKlpTheme() {
  const [mode, setMode] = useState<Mode>(current);
  const toggle = () => {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.mode = next;
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    setMode(next);
  };
  return { mode, toggle };
}

/**
 * Premium warm light/dark toggle. A single circular control; the sun rotates
 * out as the moon rotates in. Part of the brand, not a default switch.
 */
export function KlpToggle() {
  const { mode, toggle } = useKlpTheme();
  return (
    <button
      type="button"
      className="klp-toggle"
      onClick={toggle}
      aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={mode === 'dark' ? 'Light' : 'Dark'}
    >
      <svg className="ic sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
      </svg>
      <svg className="ic moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.5 13.2A8.2 8.2 0 1 1 10.8 3.5a6.4 6.4 0 0 0 9.7 9.7z" />
      </svg>
    </button>
  );
}
