/**
 * Build-time prerender entry (SSR bundle only, never shipped to the browser).
 * Renders the public landing to static HTML so crawlers and link previews see
 * real content instead of an empty #root. scripts/prerender.mjs injects it.
 */
import { renderToString } from 'react-dom/server';
import { Landing } from './Landing.tsx';

const noop = () => {};

export function render(): string {
  return renderToString(<Landing onSignIn={noop} onSignUp={noop} onLegal={noop} />);
}
