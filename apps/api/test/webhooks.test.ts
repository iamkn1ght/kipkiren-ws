/**
 * Webhook perimeter tests — KWS-SEC-003 and KWS-SEC-006.
 *
 * These tests verify the rejection paths that MUST short-circuit before
 * any database state can change:
 *   1. Missing or invalid HMAC signature → 400, no state change.
 *   2. Paystack payload older than 5 minutes → 400.
 *   3. Non-success Paystack event (charge.failed, etc.) → 200 ignored,
 *      no state change.
 *   4. Non-success Kipkiren Pay status → 200 ignored, no state change.
 *   5. Missing idempotency_key in metadata → 400.
 *
 * The deeper "successful confirmation produces exactly one scope_lock"
 * tests live in the integration suite — they need a real Supabase
 * project with migrations applied. The signature/window checks here
 * cover everything that can be tested without that.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { buildApp } from '../src/app.js';
import type { Express } from 'express';

let app: Express;
beforeAll(() => {
  app = buildApp();
});

const HMAC_SECRET = process.env.KIPKIREN_PAY_HMAC_SECRET!;
const PAYSTACK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET!;
// Note: webhooks.ts verifies Paystack against PAYSTACK_SECRET_KEY in env.ts.
// In test setup we set both to the same value so the helper picks the right one.
const PAYSTACK_VERIFY_SECRET = process.env.PAYSTACK_SECRET_KEY!;

function signSha256(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}
function signSha512(body: string, secret: string): string {
  return createHmac('sha512', secret).update(body, 'utf8').digest('hex');
}

describe('POST /v1/webhooks/mpesa — perimeter', () => {
  it('rejects with no signature header', async () => {
    const body = { gateway_ref: 'gw1', idempotency_key: 'k1', amount_kes: 100, status: 'success' };
    const res = await request(app).post('/v1/webhooks/mpesa').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_signature' });
  });

  it('rejects with a tampered body', async () => {
    const body = { gateway_ref: 'gw1', idempotency_key: 'k1', amount_kes: 100, status: 'success' };
    const raw = JSON.stringify(body);
    const sig = signSha256(raw, HMAC_SECRET);
    const tampered = raw.replace('100', '1');
    const res = await request(app)
      .post('/v1/webhooks/mpesa')
      .set('content-type', 'application/json')
      .set('x-kipkiren-pay-signature', sig)
      .send(tampered);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_signature' });
  });

  it('rejects with a wrong-secret signature', async () => {
    const body = { gateway_ref: 'gw1', idempotency_key: 'k1', amount_kes: 100, status: 'success' };
    const raw = JSON.stringify(body);
    const sig = signSha256(raw, 'wrong-secret');
    const res = await request(app)
      .post('/v1/webhooks/mpesa')
      .set('content-type', 'application/json')
      .set('x-kipkiren-pay-signature', sig)
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_signature' });
  });

  it('acks (200) and ignores non-success status without DB write', async () => {
    const body = { gateway_ref: 'gw1', idempotency_key: 'k1', amount_kes: 100, status: 'failed' };
    const raw = JSON.stringify(body);
    const sig = signSha256(raw, HMAC_SECRET);
    const res = await request(app)
      .post('/v1/webhooks/mpesa')
      .set('content-type', 'application/json')
      .set('x-kipkiren-pay-signature', sig)
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, ignored: 'failed' });
  });

  it('rejects malformed payload after valid signature', async () => {
    const raw = JSON.stringify({ gateway_ref: 'gw1' }); // missing fields
    const sig = signSha256(raw, HMAC_SECRET);
    const res = await request(app)
      .post('/v1/webhooks/mpesa')
      .set('content-type', 'application/json')
      .set('x-kipkiren-pay-signature', sig)
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_payload' });
  });
});

describe('POST /v1/webhooks/paystack — perimeter', () => {
  it('rejects with no signature header', async () => {
    const res = await request(app).post('/v1/webhooks/paystack').send({ event: 'charge.success' });
    expect(res.status).toBe(400);
  });

  it('rejects an HMAC-SHA256 signature (algorithm confusion)', async () => {
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'r1', amount: 100, paid_at: new Date().toISOString() } });
    const sig256 = signSha256(raw, PAYSTACK_VERIFY_SECRET);
    const res = await request(app)
      .post('/v1/webhooks/paystack')
      .set('content-type', 'application/json')
      .set('x-paystack-signature', sig256)
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_signature' });
  });

  it('acks 200 + ignored for non charge.success events', async () => {
    const raw = JSON.stringify({ event: 'charge.failed', data: {} });
    const sig = signSha512(raw, PAYSTACK_VERIFY_SECRET);
    const res = await request(app)
      .post('/v1/webhooks/paystack')
      .set('content-type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, ignored: 'charge.failed' });
  });

  it('rejects payload with paid_at older than 5 minutes (KWS-SEC-006)', async () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const raw = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'KWS-042', amount: 1370500, paid_at: sixMinutesAgo, status: 'success', metadata: { idempotency_key: 'idem-1' } },
    });
    const sig = signSha512(raw, PAYSTACK_VERIFY_SECRET);
    const res = await request(app)
      .post('/v1/webhooks/paystack')
      .set('content-type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'webhook_too_old' });
  });

  it('rejects payload missing idempotency_key in metadata', async () => {
    const raw = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'KWS-042', amount: 1370500, paid_at: new Date().toISOString(), status: 'success', metadata: {} },
    });
    const sig = signSha512(raw, PAYSTACK_VERIFY_SECRET);
    const res = await request(app)
      .post('/v1/webhooks/paystack')
      .set('content-type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'missing_idempotency_key_in_metadata' });
  });

  it('rejects malformed payload (missing reference or amount)', async () => {
    const raw = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'KWS-042', paid_at: new Date().toISOString() },
    });
    const sig = signSha512(raw, PAYSTACK_VERIFY_SECRET);
    const res = await request(app)
      .post('/v1/webhooks/paystack')
      .set('content-type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_payload' });
  });
});
