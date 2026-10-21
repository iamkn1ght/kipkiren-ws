/**
 * Build-time prerender entry (SSR bundle only, never shipped to the browser).
 * Renders the public landing and each legal page to static HTML so crawlers
 * and link previews see real content instead of an empty #root.
 * scripts/prerender.mjs injects the output into the built HTML.
 */
import { renderToString } from 'react-dom/server';
import { FAQ, Landing } from './Landing.tsx';
import { LEGAL_NAV, LegalPage, legalDocMeta, type LegalDocId } from './Legal.tsx';
import { ALL_PAGES, ServicePage, servicePageMeta, type ServiceId } from './Services.tsx';

const noop = () => {};

export const legalIds: LegalDocId[] = LEGAL_NAV.map((n) => n.id);

export function renderLanding(): string {
  return renderToString(<Landing onSignIn={noop} onSignUp={noop} onLegal={noop} />);
}

export function renderLegal(id: LegalDocId): string {
  return renderToString(<LegalPage doc={id} onBack={noop} onOpen={noop} onSignIn={noop} />);
}

export { legalDocMeta, servicePageMeta };

export const serviceIds: ServiceId[] = ALL_PAGES.map((n) => n.id);

export function renderService(id: ServiceId): string {
  return renderToString(<ServicePage page={id} onBack={noop} onOpen={noop} onStart={noop} />);
}

/** FAQPage structured data built from the same FAQ the landing shows. */
export function faqJsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  });
}
