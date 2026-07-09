/**
 * Shared portal UI primitives (.klp system).
 *
 * Small, presentational building blocks reused across the admin console, task
 * view and client portal so loading/empty/search/filter surfaces are identical
 * everywhere - no duplicated markup. All styling lives in landing.css under the
 * "PORTAL TOOLBAR + STATES" block; these components only wire props to classes.
 */

import type { CSSProperties } from 'react';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

/** Shimmer skeleton standing in for a list while its data loads. */
export function SkelList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="klp-skel-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="klp-skel-row">
          <span className="klp-skeleton a" />
          <span className="klp-skeleton b" />
          <span className="klp-skeleton c" />
        </div>
      ))}
    </div>
  );
}

/** Shimmer skeleton for a KPI strip. */
export function SkelKpis({ n = 4 }: { n?: number }) {
  return (
    <div className="klp-skel-kpis" aria-hidden="true" style={cssVars({ gridTemplateColumns: `repeat(${n},1fr)` })}>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="klp-skeleton klp-skel-kpi" />
      ))}
    </div>
  );
}

/** Controlled search input with a CSS-drawn magnifier (no external asset). */
export function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="klp-search">
      <span className="ic" aria-hidden="true" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export interface Seg<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/** Segmented filter control (Linear-style pill group). One active at a time. */
export function SegBar<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Seg<T>[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="klp-segbar" role="tablist" aria-label={ariaLabel ?? 'Filter'}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id ? 'true' : 'false'}
          className={`klp-seg ${value === o.id ? 'on' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
          {typeof o.count === 'number' && <span className="ct">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Right-aligned monospace count for a toolbar (e.g. "12 shown"). */
export function ToolbarMeta({ children }: { children: React.ReactNode }) {
  return <span className="klp-toolbar-meta">{children}</span>;
}

/** Editorial empty state - a title and an optional supporting line. */
export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="klp-empty">
      <div className="t">{title}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}
