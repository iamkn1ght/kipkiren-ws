/**
 * Transactional email service - pure rendering, HTML-escaping (injection
 * safety), and the config gate. The provider adapter itself is a thin fetch
 * wrapper exercised via the test seam elsewhere.
 */

import { describe, expect, it } from 'vitest';
import { renderEmail, escapeHtml, sendEmail } from '../src/services/email.js';

describe('escapeHtml', () => {
  it('escapes every html-significant character', () => {
    expect(escapeHtml(`<script>"&'`)).toBe('&lt;script&gt;&quot;&amp;&#39;');
  });
});

describe('renderEmail', () => {
  it('ticket_raised carries the ref and ESCAPES the client-supplied summary', () => {
    const r = renderEmail('ticket_raised', { ref: 'KWS-T-0042', summary: '<img src=x onerror=alert(1)>' });
    expect(r.subject).toContain('KWS-T-0042');
    expect(r.html).toContain('KWS-T-0042');
    expect(r.html).not.toContain('<img src=x');      // raw markup must not survive
    expect(r.html).toContain('&lt;img src=x');        // escaped instead
    expect(r.text).toContain('KWS-T-0042');
  });

  it('proforma_ready carries the total', () => {
    const r = renderEmail('proforma_ready', { ref: 'KWS-047', total: '13,705' });
    expect(r.subject).toContain('KWS-047');
    expect(r.html).toContain('KES 13,705');
  });

  it('payment_confirmed carries the amount and a clear subject', () => {
    const r = renderEmail('payment_confirmed', { ref: 'KWS-047', amount: '13,705' });
    expect(r.html).toContain('KES 13,705');
    expect(r.subject.toLowerCase()).toContain('payment received');
  });

  it('honours a portal_url override in the CTA link', () => {
    const r = renderEmail('ticket_raised', { ref: 'X', portal_url: 'https://portal.example/t/1' });
    expect(r.html).toContain('href="https://portal.example/t/1"');
  });
});

describe('sendEmail (gated, fire-and-forget)', () => {
  it('is a no-op when the email feature is unconfigured', async () => {
    const res = await sendEmail({ to: 'a@b.co', template: 'ticket_raised', variables: { ref: 'X' } });
    expect(res.status).toBe('feature_unavailable');
  });
});
