/**
 * Trust + legal layer for Kipkiren Web Services.
 *
 * Six documents written specifically for KWS operating in Kenya, grounded in
 * the real business model (proforma approval before work, M-Pesa/card via
 * Kipkiren Pay + Paystack, the Build + Care offering, Supabase in eu-west-1,
 * no lock-in) rather than generic boilerplate. Rendered in the warm editorial
 * .klp system with a sticky table of contents.
 *
 * Items that need a lawyer's final sign-off or a registration detail carry a
 * clear [bracketed] placeholder + a review note, per the launch plan.
 */

import { useEffect, type CSSProperties } from 'react';
import { KlpToggle } from './klpTheme.tsx';
import './landing.css';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

export type LegalDocId = 'terms' | 'privacy' | 'refunds' | 'sla' | 'cookies' | 'faq';

interface Block { h: string; body?: string[]; list?: string[] }
interface LegalDoc { id: LegalDocId; title: string; kicker: string; intro: string; blocks: Block[]; review?: boolean }

const UPDATED = 'July 2026';
const CONTACT = 'studio@kipkiren.co.ke';

export const LEGAL_NAV: { id: LegalDocId; label: string }[] = [
  { id: 'terms', label: 'Terms of Service' },
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'refunds', label: 'Refund Policy' },
  { id: 'sla', label: 'Service Agreement' },
  { id: 'cookies', label: 'Cookie Notice' },
  { id: 'faq', label: 'FAQ' },
];

const DOCS: Record<LegalDocId, LegalDoc> = {
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    kicker: 'The agreement',
    intro: 'These terms govern the design, build and ongoing care of websites and related services by Kipkiren Web Services ("Kipkiren", "we", "us") for you, the client. By approving a proforma you accept them. We have written them in plain language on purpose.',
    review: true,
    blocks: [
      { h: '1. Who we are', body: ['Kipkiren Web Services is a managed web services studio based in Nairobi, Kenya, operating as part of Kipkiren Teknolojia [company registration to be confirmed]. You can reach a person at ' + CONTACT + ' during business hours, East Africa Time.'] },
      { h: '2. How we scope and price work', body: ['Nothing is built before you approve it. Every piece of work, from the initial build to every later change, is written up as a proforma showing fixed scope and a fixed price in Kenyan shillings, with 16% VAT itemised separately.', 'You approve the proforma in your portal or by written confirmation. That approval is the contract for that work. We do not begin, and you are not charged, until you approve.'] },
      { h: '3. The Build and Care model', body: ['A build is a one-time project delivered for the price on its proforma, invoiced in stages. Care is a monthly service that keeps a live site hosted, monitored, backed up, patched and updated, with a defined block of change requests each month.', 'Your build includes its first year of care so the site is looked after from launch. After the first year, care continues month to month and you may pause or stop it with 30 days notice.'] },
      { h: '4. Payment', body: ['We accept M-Pesa (through Kipkiren Pay) and cards (through Paystack). Build invoices are issued in stages against agreed milestones. Monthly care is billed in advance on the first of each month.', 'Invoices are due within 14 days. We may pause work or suspend a service on an account more than 30 days overdue, having given you written notice first.'] },
      { h: '5. Who owns what', body: ['You own your website. On full payment for a build, the design, content and source code we produced for you are yours, and we hand over the code, database, DNS and any accounts on request, whether during the engagement or on exit. No lock-in, ever.', 'We retain ownership of our internal tools, frameworks and reusable components that are not specific to your project, and the right to describe the work in our portfolio unless you ask us in writing not to.'] },
      { h: '6. Your responsibilities', list: ['Give us accurate information and timely feedback so we can hit agreed dates.', 'Hold the rights to any content, logos or media you send us to publish.', 'Keep your portal credentials secure and tell us promptly of any suspected misuse.', 'Use the services lawfully, with no illegal, infringing or malicious content.'] },
      { h: '7. Warranties and liability', body: ['We deliver our services with reasonable skill and care and to the standards a competent Kenyan studio would meet. We fix defects in work we delivered at no charge.', 'We do not warrant that a website will be uninterrupted or error-free, or guarantee specific commercial outcomes such as search rankings or sales. To the extent the law allows, our total liability for any claim is limited to the fees you paid us for the service the claim relates to in the preceding three months. We are not liable for indirect or consequential loss.'] },
      { h: '8. Term, cancellation and governing law', body: ['You may cancel care with 30 days written notice; you keep the site and we hand everything over. We may end an engagement for material breach that is not remedied within 14 days of notice.', 'These terms are governed by the laws of Kenya, and the courts of Kenya at Nairobi have jurisdiction. We aim to resolve any dispute by good-faith discussion first.'] },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    kicker: 'Your data',
    intro: 'This policy explains what personal data Kipkiren Web Services collects, why, and the rights you have under the Data Protection Act, 2019 (Kenya). We collect the minimum we need to run your services and we do not sell data, ever.',
    review: true,
    blocks: [
      { h: '1. What we collect', list: ['Contact and account details: name, business name, email, phone.', 'Billing details: proformas, invoices and payment references (card and M-Pesa numbers are handled by our payment providers, not stored by us).', 'Support content: the tickets, messages and files you send us.', 'Operational data: uptime, error and performance logs for sites we host.'] },
      { h: '2. Why we use it (lawful basis)', body: ['We process your data to deliver the services you asked for (performance of our contract), to meet legal and tax obligations, and for the legitimate interest of running and securing our studio. Where the law requires consent, for example for non-essential analytics, we ask for it first.'] },
      { h: '3. Where your data is held', body: ['Our application data is hosted with Supabase in the eu-west-1 region (Ireland). This means some personal data is transferred outside Kenya. We rely on the recipient country\'s recognised data-protection standards and appropriate safeguards for that transfer, consistent with sections 48 and 49 of the Data Protection Act. [Cross-border transfer wording being finalised with counsel.]'] },
      { h: '4. Who we share it with', body: ['We share data only with the processors that run the service:'], list: ['Supabase, for application hosting and the database (EU).', 'Cloudflare, for DNS, edge and security on sites we manage.', 'Kipkiren Pay and Paystack, for payment processing (M-Pesa and cards).', 'Our transactional email and SMS providers, to send you tickets, proformas and receipts.'] },
      { h: '5. How long we keep it', body: ['We keep account and billing records for as long as you are a client and for seven years afterwards to meet Kenyan tax and accounting requirements. Operational logs are kept for a rolling window and then discarded. You can ask us to delete data we are not legally required to retain.'] },
      { h: '6. Your rights', body: ['Under the Data Protection Act you may ask us to access, correct, delete, restrict or port your personal data, and object to certain processing. To exercise any of these, email ' + CONTACT + ' or use the data request tool in your portal. We respond within the statutory timeframe.', 'You also have the right to lodge a complaint with the Office of the Data Protection Commissioner (ODPC).'] },
      { h: '7. Contact', body: ['Questions about this policy or your data: ' + CONTACT + '. Our data protection contact [DPO details to be confirmed] will respond.'] },
    ],
  },
  refunds: {
    id: 'refunds',
    title: 'Refund Policy',
    kicker: 'Fair and clear',
    intro: 'Our work is bespoke, so most of it is non-refundable once it has started. We think that is fair only if you are protected before you pay, which is why nothing is charged until you approve a proforma. Here is exactly how it works.',
    blocks: [
      { h: 'You approve before you pay', body: ['Every build and every change is quoted on a proforma with fixed scope and price. You see the number and agree it before any work or charge. This is your main protection: there are no surprise invoices to refund.'] },
      { h: 'Build work', body: ['Builds are invoiced in stages. Once we have begun a stage, the fee for that stage is non-refundable, because it pays for bespoke design and engineering time that cannot be resold. If you cancel mid-build, you pay for the stages completed and any work in progress, and we hand over everything produced to that point.'] },
      { h: 'Monthly care', body: ['Care is billed in advance and is non-refundable for the current month, but you can cancel any time with 30 days notice and you will not be billed again after that. You keep the site and every account.'] },
      { h: 'Third-party costs', body: ['Domains, third-party hosting, licences and paid integrations we buy on your behalf are non-refundable once purchased, because the provider charges us immediately.'] },
      { h: 'If something is wrong', body: ['If we delivered work that does not meet the agreed scope, we fix it at no charge. That is a defect, not a refund matter, and we stand behind our work. If you believe you have been charged in error, email ' + CONTACT + ' and we will investigate and correct it promptly.'] },
    ],
  },
  sla: {
    id: 'sla',
    title: 'Service Agreement highlights',
    kicker: 'What care guarantees',
    intro: 'A plain summary of what your monthly care plan commits us to. The full terms live in your signed service agreement; this is the part you will actually refer to.',
    blocks: [
      { h: 'Response times', body: ['We respond to tickets within the SLA of your plan, measured in business hours (Monday to Friday, 09:00 to 18:00 EAT):'], list: ['Starter: within 48 hours.', 'Growth: within 24 hours, with a named delivery lead.', 'Business: within 12 hours, with priority handling.'] },
      { h: 'Uptime and monitoring', body: ['We target 99.9% monthly uptime on sites we host, monitor them continuously, and act on incidents without waiting for you to notice. Our own rolling average across managed sites is 99.98%.'] },
      { h: 'Backups and security', list: ['Automated daily backups with tested restores.', 'SSL certificates issued, monitored and renewed automatically.', 'Security patches applied as they are released.', 'Quarterly performance reviews on Growth and Business.'] },
      { h: 'Included vs billable', body: ['Each plan includes a block of change requests each month, such as content edits, small fixes and updates. Larger pieces of work are scoped on a proforma first and billed separately, always at your approval. Unused monthly allowance does not roll over.'] },
      { h: 'Escalation and exit', body: ['Every account has a named person and a clear escalation path for urgent issues. If you ever leave, we hand over the code, database, DNS and accounts in full, and there is no lock-in.'] },
    ],
  },
  cookies: {
    id: 'cookies',
    title: 'Cookie Notice',
    kicker: 'What we store',
    intro: 'We keep browser storage to the minimum needed to run the site and your portal. We do not use advertising or cross-site tracking cookies.',
    blocks: [
      { h: 'Essential storage', list: ['A session token that keeps you signed in to your portal.', 'A small preference for your light or dark theme (klp_mode).'] },
      { h: 'Analytics', body: ['If we enable privacy-respecting analytics to understand which pages help visitors, we ask for your consent first and you can decline without losing any functionality. We do not share this data with advertisers.'] },
      { h: 'Managing it', body: ['You can clear cookies and site storage at any time in your browser settings. Clearing the session cookie simply signs you out of the portal.'] },
    ],
  },
  faq: {
    id: 'faq',
    title: 'Questions, answered plainly',
    kicker: 'FAQ',
    intro: 'The things business owners actually ask us before signing. If yours is not here, email ' + CONTACT + ' and a real person replies, usually the same day.',
    blocks: [
      { h: 'How much does a website cost?', body: ['A one-time build starts at KES 45,000 for Starter, 89,000 for Growth and 165,000 for Business, plus a monthly care plan from KES 3,500. You see a fixed proforma before anything is charged.'] },
      { h: 'Why a monthly fee as well as the build?', body: ['Because a website is not a one-off object; it is infrastructure. Care keeps it hosted, secure, backed up, fast and current, with a team on hand. Most agencies build and vanish. The care plan is us staying.'] },
      { h: 'Do I own the website?', body: ['Yes. On full payment for the build, the site, its content and its code are yours. We hand over everything on request. No lock-in, ever.'] },
      { h: 'Do I have to take a care plan?', body: ['The build includes its first year of care so the site is looked after from day one. After that it is month to month and you can pause any time.'] },
      { h: 'How do I pay?', body: ['M-Pesa or card, against a proforma you approve first. Build invoices are staged; care is billed on the 1st. VAT is itemised. No surprise invoices.'] },
      { h: 'How long does a build take?', body: ['Most Starter and Growth sites launch in two to four weeks from approval; larger Business builds run longer. You get a clear calendar and weekly demos, with no mystery deliverables.'] },
      { h: 'What if I want to leave?', body: ['Cancel care with 30 days notice. We hand over the code, database, DNS and accounts in full. You keep the site.'] },
      { h: 'Where is my data stored?', body: ['Application data is hosted in the EU (Ireland) with strong protection standards, consistent with the Kenyan Data Protection Act. See our Privacy Policy for the full detail.'] },
    ],
  },
};

export function LegalPage({
  doc,
  onBack,
  onOpen,
  onSignIn,
}: {
  doc: LegalDocId;
  onBack: () => void;
  onOpen: (id: LegalDocId) => void;
  onSignIn: () => void;
}) {
  const d = DOCS[doc];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [doc]);

  return (
    <div className="klp">
      <div className="klp-topbrand klp-container">
        <button type="button" className="klp-topbrand-home" onClick={onBack}>
          <span className="mark">K</span>
          <span className="name">Kipkiren<small>WEB SERVICES</small></span>
        </button>
        <div className="klp-topbrand-r">
          <KlpToggle />
          <button type="button" className="klp-back exit" onClick={onBack}>Back to site</button>
        </div>
      </div>

      <div className="klp-container klp-legal">
        <aside className="klp-legal-toc">
          <div className="klp-mono lbl">Legal &amp; trust</div>
          <nav>
            {LEGAL_NAV.map((n) => (
              <button key={n.id} type="button" className={n.id === doc ? 'active' : ''} onClick={() => onOpen(n.id)}>{n.label}</button>
            ))}
          </nav>
          <div className="klp-legal-help">
            <div className="klp-mono">Need a person?</div>
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
            <button type="button" className="klp-btn ghost" onClick={onSignIn}>Open the portal</button>
          </div>
        </aside>

        <article className="klp-legal-doc">
          <span className="klp-eyebrow teal">{d.kicker}</span>
          <h1 className="klp-display-lg">{d.title}</h1>
          <div className="klp-legal-meta klp-mono">Last updated {UPDATED} · Kipkiren Web Services · Nairobi, Kenya</div>
          {d.review && <div className="klp-note amber klp-legal-review">This document is in final review with counsel. It reflects how we operate today; the definitive version follows shortly.</div>}
          <p className="klp-lead klp-legal-intro">{d.intro}</p>

          {d.blocks.map((b) => (
            <section key={b.h} className="klp-legal-block">
              <h2>{b.h}</h2>
              {b.body?.map((p, i) => <p key={i}>{p}</p>)}
              {b.list && (
                <ul>
                  {b.list.map((li) => <li key={li}><span className="m" />{li}</li>)}
                </ul>
              )}
            </section>
          ))}

          <div className="klp-legal-foot">
            <p className="klp-mono">This page is general information, not legal advice.</p>
            <div className="klp-legal-cross">
              {LEGAL_NAV.filter((n) => n.id !== doc).map((n) => (
                <button key={n.id} type="button" onClick={() => onOpen(n.id)}>{n.label} <span>&rarr;</span></button>
              ))}
            </div>
          </div>
        </article>
      </div>

      <footer className="klp-footer">
        <div className="klp-container">
          <div className="klp-footbar" style={cssVars({ borderTop: 'none' })}>
            <div className="klp-mono">&copy; 2026 Kipkiren Web Services Ltd.</div>
            <button type="button" className="klp-mono" style={cssVars({ color: 'var(--mid)', background: 'none', border: 'none', cursor: 'pointer' })} onClick={onBack}>Back to home &rarr;</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
