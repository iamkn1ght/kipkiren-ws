/**
 * Service pages: one real, indexable page per thing people search for
 * ("web design Nairobi", "website maintenance Kenya", ...). Same editorial
 * layout as the legal pages, prerendered at build time with their own title,
 * description, canonical and Service structured data (scripts/prerender.mjs).
 *
 * Every claim here must be something we deliver today (Launch Workbook rule:
 * no copy the business cannot back up). Prices come from PLANS on the landing.
 */

import { useEffect, type CSSProperties } from 'react';
import { KlpToggle } from './klpTheme.tsx';
import { PLANS } from './Landing.tsx';
import './landing.css';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;
const CONTACT = 'studio@kipkiren.co.ke';

export type ServiceId = 'web-design-nairobi' | 'website-maintenance-kenya' | 'seo-services-kenya' | 'website-hosting-kenya' | 'pricing'
  | 'website-cost-kenya' | 'choose-web-designer-nairobi' | 'website-maintenance-checklist';

interface Block { h: string; body?: string[]; list?: string[] }
interface ServiceDoc { id: ServiceId; title: string; metaTitle: string; kicker: string; intro: string; blocks: Block[]; serviceType?: string; priceFrom?: number; guide?: boolean }

export const SERVICE_NAV: { id: ServiceId; label: string }[] = [
  { id: 'web-design-nairobi', label: 'Web design' },
  { id: 'website-maintenance-kenya', label: 'Website care' },
  { id: 'seo-services-kenya', label: 'SEO' },
  { id: 'website-hosting-kenya', label: 'Managed hosting' },
  { id: 'pricing', label: 'Pricing' },
];

// Guides: plain answers to what business owners search before hiring.
export const GUIDE_NAV: { id: ServiceId; label: string }[] = [
  { id: 'website-cost-kenya', label: 'What a website costs' },
  { id: 'choose-web-designer-nairobi', label: 'Choosing a web designer' },
  { id: 'website-maintenance-checklist', label: 'Maintenance checklist' },
];
export const ALL_PAGES = [...SERVICE_NAV, ...GUIDE_NAV];
const GUIDE_DATE = '2026-10-22';

const kes = (s: string) => `KES ${s}`;
const toNum = (s: string) => Number(s.replace(/,/g, ''));
const firstYear = (build: string, care: string) => (toNum(build) + 12 * toNum(care)).toLocaleString('en-KE');

const PLAN_LINES = PLANS.map((p) => `${p.name}: build ${kes(p.build)}, then care ${kes(p.care)} a month (first year ${kes(firstYear(p.build, p.care))}).`);

const DOCS: Record<ServiceId, ServiceDoc> = {
  'web-design-nairobi': {
    id: 'web-design-nairobi',
    title: 'Web design in Nairobi',
    metaTitle: 'Web Design in Nairobi, Kenya · Kipkiren Web Services',
    kicker: 'Service · Web design',
    intro: 'Websites for Kenyan businesses, designed and built in Nairobi. A fixed-price proforma before any work, launch in two to four weeks, and you own everything.',
    serviceType: 'Website design and development',
    priceFrom: toNum(PLANS[0]!.build),
    blocks: [
      { h: 'What you get', list: [
        'A site designed around your business and your customers, mobile-first and fast on a phone over 4G.',
        'Clean, accessible pages built with React and TypeScript, ready for search engines from day one.',
        'Your domain, hosting and email forwarding set up and connected.',
        'Analytics and Google Search Console wired in, so you can see who finds you.',
        'The code, content, DNS and every account handed to you on request. No lock-in.',
      ] },
      { h: 'How a project runs', list: [
        'Discovery: 45 to 90 minutes to understand the business and what the site must do.',
        'Proforma: a fixed scope and fixed price in Kenyan shillings, in your inbox within 48 hours. Nothing starts until you approve it.',
        'Design and build: weekly demos, so you watch the site come together.',
        'Launch: quiet and deliberate, with a way to roll back.',
        'Care: we keep running it after launch (see Website care).',
      ] },
      { h: 'What it costs', body: ['Three fixed starting points, all excluding 16% VAT, which is itemised on the proforma. Larger or unusual projects are quoted on the rate card from KES 3,500 an hour.'], list: PLAN_LINES },
      { h: 'How long it takes', body: ['Most Starter and Growth sites launch two to four weeks after you approve the proforma. Business builds take longer; the proforma gives the calendar.'] },
      { h: 'Paying', body: ['You pay against the approved proforma by bank transfer, and we email a receipt once it reflects. M-Pesa and card checkout are coming soon.'] },
    ],
  },
  'website-maintenance-kenya': {
    id: 'website-maintenance-kenya',
    title: 'Website care and maintenance',
    metaTitle: 'Website Maintenance in Kenya · Care Plans from KES 3,500 · Kipkiren',
    kicker: 'Service · Website care',
    intro: 'Monthly website care for Kenyan businesses from KES 3,500 a month: hosting, uptime checks every five minutes, SSL, backups, security patches and small changes, with a named team.',
    serviceType: 'Website maintenance',
    priceFrom: toNum(PLANS[0]!.care),
    blocks: [
      { h: 'What care covers', list: [
        'Hosting on Cloudflare\'s network, with SSL certificates issued and renewed automatically.',
        'Uptime checks every five minutes, with an alert to our team the moment something breaks.',
        'Backups of your site and its data, restored on request.',
        'Security patches and updates applied as they are released.',
        'A block of change requests each month: content edits, small fixes and updates.',
      ] },
      { h: 'Response times', body: ['Measured in business hours, Monday to Friday, 09:00 to 18:00 East Africa Time:'], list: ['Starter: within 48 hours.', 'Growth: within 24 hours, with a named delivery lead.', 'Business: within 12 hours, with priority handling.'] },
      { h: 'Monthly prices', body: ['Care plans exclude 16% VAT. They are invoiced on the 1st of each month and due by the 7th.'], list: PLANS.map((p) => `${p.name}: ${kes(p.care)} a month.`) },
      { h: 'Larger changes', body: ['Anything bigger than the monthly allowance is scoped on a proforma first and only done once you approve it. Unused allowance does not roll over.'] },
      { h: 'Leaving', body: ['Cancel care with 30 days notice. We hand over the code, database, DNS and accounts in full. You keep the site.'] },
    ],
  },
  'seo-services-kenya': {
    id: 'seo-services-kenya',
    title: 'SEO for Kenyan businesses',
    metaTitle: 'SEO Services in Kenya · Kipkiren Web Services',
    kicker: 'Service · Search',
    intro: 'Search engine optimisation for Kenyan businesses: technical SEO, structured data, Google Search Console and Business Profile set-up, and ongoing content support. From KES 3,000 an hour.',
    serviceType: 'Search engine optimisation',
    blocks: [
      { h: 'What we do', list: [
        'Technical SEO: fast pages, clean structure, titles and descriptions per page, sitemaps and robots rules.',
        'Structured data, so search engines and AI assistants understand who you are and what you offer.',
        'Google Search Console and Bing Webmaster Tools set up and monitored.',
        'Help setting up and keeping your Google Business Profile accurate.',
        'Content support on care plans: pages written by people who read what they publish.',
      ] },
      { h: 'What we will not promise', body: ['Nobody can honestly guarantee a ranking or a position on Google. We promise the work that makes ranking possible, and we show you the Search Console numbers so you can judge it.'] },
      { h: 'Pricing', body: ['SEO work is quoted on the rate card from KES 3,000 an hour, excluding VAT, on a proforma you approve first. The Growth care plan includes monthly SEO.'] },
    ],
  },
  'website-hosting-kenya': {
    id: 'website-hosting-kenya',
    title: 'Managed website hosting',
    metaTitle: 'Managed Website Hosting in Kenya · Kipkiren Web Services',
    kicker: 'Service · Hosting',
    intro: 'Managed hosting for business websites in Kenya: Cloudflare\'s global network, automatic SSL, uptime checks every five minutes, backups and patches, included in every care plan.',
    serviceType: 'Managed website hosting',
    priceFrom: toNum(PLANS[0]!.care),
    blocks: [
      { h: 'What is included', list: [
        'Your site served from Cloudflare\'s network, fast across Kenya and abroad.',
        'SSL certificates issued, monitored daily and renewed automatically.',
        'Uptime checks every five minutes, with alerts to our team.',
        'Backups, security patches and updates.',
        'Domain set-up and email forwarding to the inboxes you already use.',
      ] },
      { h: 'What it costs', body: ['Hosting is not sold on its own: it is part of every care plan, from KES 3,500 a month excluding VAT.'] },
      { h: 'Moving to us', body: ['Already have a site? Tell us where it lives today. We quote the move on a proforma before anything changes.'] },
    ],
  },
  pricing: {
    id: 'pricing',
    title: 'Website pricing in Kenya',
    metaTitle: 'Website Design Prices in Kenya · Build + Care · Kipkiren',
    kicker: 'Pricing',
    intro: 'What a business website costs with Kipkiren: a one-time build from KES 45,000 plus monthly care from KES 3,500, every figure in Kenyan shillings, excluding 16% VAT.',
    blocks: [
      { h: 'Build + Care plans', body: ['One price to launch, one monthly plan to keep the site fast, secure and current. Every build comes with a first year of care, paid monthly, so the site is looked after from launch.'], list: PLANS.map((p) => `${p.name}: build ${kes(p.build)} + care ${kes(p.care)} a month. First year ${kes(firstYear(p.build, p.care))}. ${p.desc}`) },
      { h: 'What each plan includes', list: PLANS.map((p) => `${p.name}: ${p.feats.join('; ')}.`) },
      { h: 'Custom work', body: ['Work outside a plan is quoted on the rate card, always on a proforma you approve first: design and build from KES 3,500 an hour, SEO from KES 3,000 an hour.'] },
      { h: 'How payment works', body: ['You approve a fixed proforma, then pay by bank transfer against its reference. We confirm it and email a receipt. M-Pesa and card checkout are coming soon. Care is invoiced on the 1st and due by the 7th.'] },
    ],
  },
  'website-cost-kenya': {
    id: 'website-cost-kenya',
    guide: true,
    title: 'How much does a website cost in Kenya?',
    metaTitle: 'How Much Does a Website Cost in Kenya? (2026 Guide) · Kipkiren',
    kicker: 'Guide · Costs',
    intro: 'A plain guide to what a business website costs in Kenya: the one-time build, the running costs most quotes leave out, and the questions that stop a cheap site becoming an expensive one.',
    blocks: [
      { h: 'Every website has two costs', body: ['The build is paid once: design, pages, features and launch. The running cost never stops: hosting, the domain renewal, security certificates, backups, updates and the small fixes every site needs.', 'Many quotes cover only the build. A site that nobody runs slowly breaks: forms stop sending, software goes out of date, and a hacked site can cost more to clean up than it cost to build.'] },
      { h: 'What makes a build cost more', list: [
        'More pages, and more kinds of page (a product catalogue is more work than an About page).',
        'Custom design rather than a lightly edited template.',
        'Features: online payments, bookings, an online shop, member logins.',
        'Connections to other systems, such as M-Pesa, accounting or a CRM.',
        'Writing the content for you, and translating it.',
        'A tight deadline.',
      ] },
      { h: 'Running costs to budget for', list: [
        'Your domain name, renewed every year through a registrar.',
        'Hosting, so the site stays online and fast.',
        'An SSL certificate (the padlock), often free today but it must be renewed on time.',
        'Updates, security patches and backups.',
        'Someone to change content and fix things when they break.',
      ] },
      { h: 'What Kipkiren charges', body: ['We publish our prices. All exclude 16% VAT, and every job is quoted on a fixed proforma first.'], list: PLAN_LINES },
      { h: 'Questions to ask any web designer', list: [
        'Is the price fixed and written down before any work starts?',
        'Whose name are the domain, hosting account and code registered in?',
        'What happens after launch, and what does it cost each month?',
        'How fast do you respond when something breaks, in writing?',
        'If I leave, do I get everything: code, database, domain and accounts?',
      ] },
    ],
  },
  'choose-web-designer-nairobi': {
    id: 'choose-web-designer-nairobi',
    guide: true,
    title: 'How to choose a web designer in Nairobi',
    metaTitle: 'How to Choose a Web Designer in Nairobi: 7 Checks · Kipkiren',
    kicker: 'Guide · Hiring',
    intro: 'Seven checks that separate a web designer who builds and disappears from one who still answers a year later, written for Kenyan business owners hiring for the first time.',
    blocks: [
      { h: 'The seven checks', list: [
        'A fixed, written quote before work starts, listing what is and is not included.',
        'Ownership: the domain, hosting and code registered in your business name, not the designer\'s.',
        'A plan for after launch: who keeps the site updated, backed up and secure, and at what monthly cost.',
        'Response times in writing, so you know how long a broken site stays broken.',
        'Real work you can visit: ask for live links, not screenshots, and ask one past client how it went.',
        'Data protection: if your site collects customer details, ask how it meets the Data Protection Act, 2019.',
        'Official receipts and invoices for every payment, with VAT shown.',
      ] },
      { h: 'Red flags', list: [
        'The domain is registered in the designer\'s own name.',
        'No written scope, just a price over the phone.',
        'Full payment demanded before you have seen any design.',
        'Unlimited revisions with no timeline, which usually means no plan.',
        'Nobody named for support after launch.',
      ] },
      { h: 'How we answer these', body: ['Every Kipkiren job starts with a fixed proforma you approve. Your site, code and accounts are yours, with no lock-in. Care plans put response times in writing (12 to 48 business hours by plan), and every payment gets an emailed receipt.'] },
    ],
  },
  'website-maintenance-checklist': {
    id: 'website-maintenance-checklist',
    guide: true,
    title: 'Website maintenance checklist for Kenyan businesses',
    metaTitle: 'Website Maintenance Checklist (Daily to Yearly) · Kipkiren',
    kicker: 'Guide · Maintenance',
    intro: 'What keeping a business website healthy actually involves, from daily to yearly, so you can do it yourself or know what to expect from whoever does it for you.',
    blocks: [
      { h: 'Continuously', list: ['Uptime monitoring that alerts someone when the site goes down.', 'Automatic backups of the site and its data.', 'Security alerts for the software the site runs on.'] },
      { h: 'Every week', list: ['Test the contact form, checkout or booking flow by sending a real enquiry.', 'Read the security alerts and plan any urgent update.'] },
      { h: 'Every month', list: [
        'Apply updates and security patches.',
        'Restore one backup somewhere safe, to prove it works.',
        'Open the site on a phone over mobile data and check it is still fast.',
        'Update prices, opening hours, staff and offers.',
        'Check Google Search Console for errors and pages that dropped out.',
      ] },
      { h: 'Every year', list: [
        'Renew the domain, ideally on auto-renew, and check who holds it.',
        'Check the SSL certificate renews automatically.',
        'Review every page: remove what is out of date, add what customers keep asking.',
        'Remove website and email access for anyone who has left.',
      ] },
      { h: 'Do it yourself, or hand it over', body: ['All of this takes a few hours a month. Kipkiren care plans cover it from KES 3,500 a month, excluding VAT, with uptime checks every five minutes and a named team.'] },
    ],
  },
};

export function serviceFromPath(path: string): ServiceId | null {
  const id = path.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
  return ALL_PAGES.some((n) => n.id === id) ? (id as ServiceId) : null;
}

export function servicePageMeta(id: ServiceId): { title: string; description: string; jsonLd: string } {
  const d = DOCS[id];
  const url = `https://ws.kipkiren.co.ke/${id}`;
  const ld = d.guide
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: d.title,
        description: d.intro,
        url,
        mainEntityOfPage: url,
        inLanguage: 'en-KE',
        datePublished: GUIDE_DATE,
        dateModified: GUIDE_DATE,
        author: { '@id': 'https://ws.kipkiren.co.ke/#business' },
        publisher: { '@id': 'https://ws.kipkiren.co.ke/#business' },
      }
    : d.serviceType
    ? {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: d.title,
        serviceType: d.serviceType,
        description: d.intro,
        url,
        areaServed: { '@type': 'Country', name: 'Kenya' },
        provider: { '@id': 'https://ws.kipkiren.co.ke/#business' },
        ...(d.priceFrom ? { offers: { '@type': 'Offer', priceCurrency: 'KES', price: String(d.priceFrom), url } } : {}),
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: d.title,
        description: d.intro,
        url,
        about: { '@id': 'https://ws.kipkiren.co.ke/#business' },
      };
  return { title: d.metaTitle, description: d.intro, jsonLd: JSON.stringify(ld) };
}

export function ServicePage({ page, onBack, onOpen, onStart }: { page: ServiceId; onBack: () => void; onOpen: (id: ServiceId) => void; onStart: () => void }) {
  const d = DOCS[page];

  useEffect(() => {
    window.scrollTo({ top: 0 });
    const prev = document.title;
    document.title = d.metaTitle;
    return () => { document.title = prev; };
  }, [d.metaTitle]);

  const go = (id: ServiceId) => (e: React.MouseEvent) => { e.preventDefault(); onOpen(id); };

  return (
    <div className="klp">
      <div className="klp-topbrand klp-container">
        <a className="klp-topbrand-home" href="/" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <span className="mark">K</span>
          <span className="name">Kipkiren<small>WEB SERVICES</small></span>
        </a>
        <div className="klp-topbrand-r">
          <KlpToggle />
          <button type="button" className="klp-btn primary" onClick={onStart}>Start a project</button>
        </div>
      </div>

      <div className="klp-container klp-legal">
        <aside className="klp-legal-toc">
          <div className="klp-mono lbl">Services</div>
          <nav>
            {SERVICE_NAV.map((n) => (
              <a key={n.id} href={`/${n.id}`} className={n.id === page ? 'active' : ''} onClick={go(n.id)}>{n.label}</a>
            ))}
          </nav>
          <div className="klp-mono lbl" style={cssVars({ marginTop: 22 })}>Guides</div>
          <nav>
            {GUIDE_NAV.map((n) => (
              <a key={n.id} href={`/${n.id}`} className={n.id === page ? 'active' : ''} onClick={go(n.id)}>{n.label}</a>
            ))}
          </nav>
          <div className="klp-legal-help">
            <div className="klp-mono">Talk to a person</div>
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
            <button type="button" className="klp-btn ghost" onClick={onStart}>Start a project</button>
          </div>
        </aside>

        <article className="klp-legal-doc">
          <span className="klp-eyebrow teal">{d.kicker}</span>
          <h1 className="klp-display-lg">{d.title}</h1>
          <div className="klp-legal-meta klp-mono">{d.guide ? 'Guide · Kipkiren Web Services · Updated October 2026' : 'Kipkiren Web Services · Nairobi, Kenya · Prices exclude 16% VAT'}</div>
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
            <div className="klp-portal-actions" style={cssVars({ marginBottom: 18 })}>
              <button type="button" className="klp-btn primary" onClick={onStart}>Start a project &rarr;</button>
              <a className="klp-btn ghost" href={`mailto:${CONTACT}?subject=${encodeURIComponent(d.title)}`}>Email the studio</a>
            </div>
            <div className="klp-legal-cross">
              {(d.guide ? [...GUIDE_NAV, ...SERVICE_NAV] : SERVICE_NAV).filter((n) => n.id !== page).map((n) => (
                <a key={n.id} href={`/${n.id}`} onClick={go(n.id)}>{n.label} <span>&rarr;</span></a>
              ))}
            </div>
          </div>
        </article>
      </div>

      <footer className="klp-footer">
        <div className="klp-container">
          <div className="klp-footbar" style={cssVars({ borderTop: 'none' })}>
            <div className="klp-mono">&copy; 2026 Kipkiren Web Services Ltd. · Nairobi, Kenya</div>
            <a className="klp-mono" href="/" onClick={(e) => { e.preventDefault(); onBack(); }} style={cssVars({ color: 'var(--mid)' })}>Back to home &rarr;</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
