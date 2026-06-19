import type { PortalRole } from './auth.tsx';

const OPTIONS: { role: PortalRole; title: string; tag: string; blurb: string }[] = [
  { role: 'client', title: 'Client', tag: 'CLIENT PORTAL', blurb: 'Your services, tickets, proformas and invoices.' },
  { role: 'admin', title: 'Admin', tag: 'DELIVERY LEAD · ADMIN', blurb: 'Ticket queue, AI review, clients, capacity, services.' },
  { role: 'technical_delivery', title: 'Task view', tag: 'TECHNICAL DELIVERY', blurb: 'Tasks assigned to you. No client or billing data.' },
];

export function RolePicker({ onPick }: { onPick: (role: PortalRole) => void }) {
  return (
    <div className="rp-wrap">
      <div className="rp-inner">
        <div className="rp-brand">
          <div className="rp-mark">KIPKIREN · WS</div>
          <div className="rp-sub">WEB SERVICES</div>
        </div>
        <h1 className="rp-title">Choose your <em>workspace</em>.</h1>
        <p className="rp-hint">Select how you're signing in. You can switch any time after.</p>
        <div className="rp-grid">
          {OPTIONS.map((o) => (
            <button key={o.role} type="button" className="rp-card" onClick={() => onPick(o.role)}>
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
