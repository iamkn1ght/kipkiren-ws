import type { PortalRole } from './auth.tsx';
import { KlpToggle } from './klpTheme.tsx';
import './landing.css';

const OPTIONS: { role: PortalRole; title: string; tag: string; blurb: string }[] = [
  { role: 'client', title: 'Client', tag: 'Client portal', blurb: 'Your services, tickets, proformas and invoices.' },
  { role: 'admin', title: 'Admin', tag: 'Delivery lead', blurb: 'The ticket queue, AI review, clients, capacity and rails.' },
  { role: 'technical_delivery', title: 'Task view', tag: 'Technical delivery', blurb: 'The tasks assigned to you. No client or billing data.' },
];

export function RolePicker({ onPick, onExit }: { onPick: (role: PortalRole) => void; onExit?: () => void }) {
  return (
    <div className="klp">
      <div className="klp-container klp-authwrap">
        <div className="klp-topbrand">
          <span className="mark">K</span>
          <span className="name">Kipkiren<small>WEB SERVICES</small></span>
          <div className="klp-topbrand-r">
            <KlpToggle />
            {onExit && <button type="button" className="klp-back exit" onClick={onExit}>‹ Back to site</button>}
          </div>
        </div>

        <div className="klp-rp-head">
          <span className="klp-eyebrow teal">Sign in</span>
          <h1 className="klp-display-lg">Choose your <em>workspace.</em></h1>
          <p className="klp-lead">Select how you're signing in. You can switch any time after.</p>
        </div>

        <div className="klp-rp-grid">
          {OPTIONS.map((o, i) => (
            <button key={o.role} type="button" className="klp-rp-card" onClick={() => onPick(o.role)}>
              <span className="klp-rp-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="klp-rp-tag">{o.tag}</span>
              <span className="klp-rp-title">{o.title}</span>
              <span className="klp-rp-blurb">{o.blurb}</span>
              <span className="klp-rp-go">Continue <span>→</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
