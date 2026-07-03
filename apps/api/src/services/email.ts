/**
 * Transactional email (support-ticket, proforma, and payment notices).
 *
 * The core support workflow requires notifying the client's registered email
 * when an admin raises a ticket on their behalf, when a proforma is ready, and
 * when payment confirms. This module is the delivery path for that.
 *
 * Design mirrors the Todoku SMS service (notifications.ts):
 *   - Provider-agnostic HTTPS adapter (Resend-compatible: POST a JSON body with
 *     {from,to,subject,html,text} + a bearer key). A test seam injects a fake.
 *   - `sendEmail()` is fire-and-forget and NEVER throws: an email failure must
 *     not break the primary transaction (ticket create / proforma dispatch /
 *     payment confirmation). Outcomes are logged to audit_log.
 *   - Gated by `isFeatureConfigured('email')`; a no-op until EMAIL_* are set,
 *     so wiring it on hot paths is safe today.
 *   - Templates are PURE functions (renderEmail) with all interpolated values
 *     HTML-escaped, so a malicious ticket description cannot inject markup.
 *
 * Activation: set EMAIL_API_URL / EMAIL_API_KEY / EMAIL_FROM in Railway.
 */

import { isFeatureConfigured, loadEnv } from '../config/env.js';
import { getServiceClient } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { writeAuditEvent } from './audit.js';

export type EmailTemplate = 'ticket_raised' | 'proforma_ready' | 'payment_confirmed';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const PORTAL_URL = 'https://ws.kipkiren.co.ke';

const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c] as string);
}

/** Minimal, email-client-safe layout (inline styles, no external CSS/images). */
function layout(headline: string, bodyHtml: string, cta: { label: string; href: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#F5F3EE;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1A1712;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:4px;color:#0D5C4E;">KIPKIREN</div>
    <div style="font:400 9px/1 ui-monospace,monospace;letter-spacing:2px;color:#8A8070;margin-top:4px;">OPERATING SYSTEM FOR YOUR BUSINESS ONLINE</div>
    <div style="background:#FFFFFF;border:1px solid #E4DFD3;border-radius:12px;padding:28px 26px;margin-top:20px;">
      <h1 style="font:700 22px/1.25 Georgia,serif;color:#1A1712;margin:0 0 14px;">${headline}</h1>
      ${bodyHtml}
      <a href="${cta.href}" style="display:inline-block;margin-top:22px;background:#0D5C4E;color:#fff;text-decoration:none;font:600 11px/1 ui-monospace,monospace;letter-spacing:1.5px;text-transform:uppercase;padding:13px 20px;border-radius:8px;">${cta.label}</a>
    </div>
    <div style="font:400 11px/1.5 ui-monospace,monospace;color:#8A8070;margin-top:18px;">
      Kipkiren Web Services · Nairobi, Kenya<br>You are receiving this because you have an account at ${PORTAL_URL}.
    </div>
  </div></body></html>`;
}

const p = (t: string) => `<p style="font:400 14px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#3A342A;margin:0 0 12px;">${t}</p>`;

/**
 * Pure: build subject + html + text for a template. Every interpolated value is
 * HTML-escaped for the html body. `vars.portal_url` overrides the CTA target.
 */
export function renderEmail(template: EmailTemplate, vars: Record<string, string>): RenderedEmail {
  const href = vars.portal_url || PORTAL_URL;
  const ref = escapeHtml(vars.ref ?? '');
  switch (template) {
    case 'ticket_raised': {
      const summary = escapeHtml(vars.summary ?? 'your request');
      return {
        subject: `We've logged your request · ${vars.ref ?? ''}`.trim(),
        html: layout('We are on it.',
          p(`We have logged your request <strong>${ref}</strong> and our team is reviewing it now.`) +
          p(`<span style="color:#8A8070;">Request:</span> ${summary}`) +
          p(`We will price it on a proforma you approve before any work begins. You can follow everything in your portal.`),
          { label: 'Open your portal', href }),
        text: `We've logged your request ${vars.ref ?? ''}.\n\nRequest: ${vars.summary ?? ''}\n\nWe'll price it on a proforma you approve before any work begins. Follow it in your portal: ${href}\n\nKipkiren Web Services`,
      };
    }
    case 'proforma_ready': {
      const total = escapeHtml(vars.total ?? '');
      return {
        subject: `Your proforma is ready to review · ${vars.ref ?? ''}`.trim(),
        html: layout('Your proforma is ready.',
          p(`Proforma <strong>${ref}</strong> is ready for your review.`) +
          p(`<span style="color:#8A8070;">Total:</span> <strong>KES ${total}</strong>`) +
          p(`Every line item is priced and listed. Nothing is built until you approve.`),
          { label: 'Review & approve', href }),
        text: `Your proforma ${vars.ref ?? ''} is ready to review.\n\nTotal: KES ${vars.total ?? ''}\n\nNothing is built until you approve. Review it here: ${href}\n\nKipkiren Web Services`,
      };
    }
    case 'payment_confirmed': {
      const amount = escapeHtml(vars.amount ?? '');
      return {
        subject: `Payment received · ${vars.ref ?? ''}`.trim(),
        html: layout('Payment received.',
          p(`We have received your payment of <strong>KES ${amount}</strong> for <strong>${ref}</strong>.`) +
          p(`Scope is now locked and work begins within two business days. Your receipt is attached to your portal.`),
          { label: 'View in portal', href }),
        text: `Payment received: KES ${vars.amount ?? ''} for ${vars.ref ?? ''}.\n\nScope is locked and work begins within two business days. View it in your portal: ${href}\n\nKipkiren Web Services`,
      };
    }
  }
}

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}
export interface EmailClient {
  send(msg: EmailMessage): Promise<{ id: string }>;
}

// Test seam - inject a fake so the send path is exercisable without a provider.
let injectedClient: EmailClient | null = null;
export function setEmailClientForTest(c: EmailClient | null): void {
  injectedClient = c;
}

let realClient: EmailClient | null = null;
function getEmailClient(): EmailClient {
  if (injectedClient) return injectedClient;
  if (realClient) return realClient;
  const env = loadEnv();
  realClient = {
    async send(msg) {
      const res = await fetch(env.EMAIL_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.EMAIL_API_KEY}` },
        body: JSON.stringify({ from: msg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.error({ status: res.status, body: text }, 'email_send_failed');
        throw new Error('email_send_failed');
      }
      const json = (await res.json().catch(() => null)) as { id?: string } | null;
      return { id: json?.id ?? 'unknown' };
    },
  };
  return realClient;
}

export type SendEmailResult =
  | { status: 'sent'; provider_ref: string }
  | { status: 'feature_unavailable' }
  | { status: 'failed'; error: string };

export interface SendEmailInput {
  to: string;
  template: EmailTemplate;
  variables: Record<string, string>;
  entity_type?: string;
  entity_id?: string;
}

/** Fire-and-forget email send. NEVER throws. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    if (!isFeatureConfigured('email')) {
      logger.info({ template: input.template }, 'email_skipped_unconfigured');
      return { status: 'feature_unavailable' };
    }
    const env = loadEnv();
    const rendered = renderEmail(input.template, input.variables);
    const { id } = await getEmailClient().send({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await writeAuditEvent({
      actor_id: null,
      actor_role: null,
      event_type: 'email_sent',
      entity_type: input.entity_type ?? 'notification',
      entity_id: input.entity_id ?? id,
      payload_snapshot: { template: input.template, provider_ref: id, to: input.to },
    });
    return { status: 'sent', provider_ref: id };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err, template: input.template }, 'email_delivery_failed');
    await writeAuditEvent({
      actor_id: null,
      actor_role: null,
      event_type: 'email_failed',
      entity_type: input.entity_type ?? 'notification',
      entity_id: input.entity_id ?? input.template,
      payload_snapshot: { template: input.template, error },
    });
    return { status: 'failed', error };
  }
}

/**
 * Resolve a client's registered email and send a templated message. Gated +
 * fire-and-forget: never throws, skips the DB lookup when email is unconfigured
 * (the current production state), so it is a no-op on hot paths until EMAIL_*
 * are set.
 */
export async function sendClientEmail(input: {
  clientId: string;
  template: EmailTemplate;
  variables: Record<string, string>;
  entity_type?: string;
  entity_id?: string;
}): Promise<SendEmailResult> {
  try {
    if (!isFeatureConfigured('email')) return { status: 'feature_unavailable' };
    const sb = getServiceClient();
    const { data, error } = await sb.from('clients').select('email').eq('id', input.clientId).single();
    if (error || !data?.email) {
      logger.info({ clientId: input.clientId, template: input.template }, 'email_skipped_no_client_email');
      return { status: 'failed', error: 'no_client_email' };
    }
    return await sendEmail({
      to: data.email,
      template: input.template,
      variables: input.variables,
      ...(input.entity_type ? { entity_type: input.entity_type } : {}),
      ...(input.entity_id ? { entity_id: input.entity_id } : {}),
    });
  } catch (err) {
    logger.error({ err, template: input.template }, 'send_client_email_failed');
    return { status: 'failed', error: err instanceof Error ? err.message : 'unknown_error' };
  }
}
