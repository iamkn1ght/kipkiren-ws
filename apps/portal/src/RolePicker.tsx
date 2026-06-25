import type { PortalRole } from './auth.tsx';

const OPTIONS: { role: PortalRole; title: string; tag: string; blurb: string }[] = [
  { role: 'client', title: 'Client', tag: 'CLIENT PORTAL', blurb: 'Your services, tickets, proformas and invoices.' },
  { role: 'admin', title: 'Admin', tag: 'DELIVERY LEAD · ADMIN', blurb: 'Ticket queue, AI review, clients, capacity, services.' },
  { role: 'technical_delivery', title: 'Task view', tag: 'TECHNICAL DELIVERY', blurb: 'Tasks assigned to you. No client or billing data.' },
];

export function RolePicker({ onPick, onExit }: { onPick: (role: PortalRole) => void; onExit?: () => void }) {
  return (
    <div className="rp-wrap">
      <div className="rp-inner">
        <div className="rp-top">
          <div className="rp-brand">
            <span className="rp-diamond">◆</span>
            <span className="rp-mark">KIPKIREN</span>
            <span className="rp-sub">/ web-services</span>
          </div>
          {onExit && <button type="button" className="rp-exit" onClick={onExit}>‹ Back to site</button>}
        </div>

        <h1 className="rp-title">Choose your <em>workspace</em>.</h1>
        <p className="rp-hint">Select how you're signing in. You can switch any time after.</p>

        <div className="rp-grid">
          {OPTIONS.map((o, i) => (
            <button key={o.role} type="button" className="rp-card" onClick={() => onPick(o.role)}>
              <span className="rp-card-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="rp-card-tag">{o.tag}</div>
              <div className="rp-card-title">{o.title}</div>
              <div className="rp-card-blurb">{o.blurb}</div>
              <div className="rp-card-go">Continue →</div>
            </button>
          ))}
        </div>

        <div className="rp-foot">ws.kipkiren.co.ke</div>
      </div>
    </div>
  );
}
