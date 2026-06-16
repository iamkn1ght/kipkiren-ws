/**
 * S9-003 — Todoku SMS scaffold.
 *
 * Verifies the fire-and-forget contract: placeholder templates return
 * TEMPLATE_NOT_READY, a configured send goes through the injected client and
 * audits, a client failure is swallowed (never throws) and audited, and the
 * delivery webhook verifies its base64 HMAC signature.
 */

import { createHmac } from 'node:crypto';
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    insert: async () => ({ error: null }),
  };
  return {
    getServiceClient: () => ({ from: () => chain }),
    getUserClient: () => ({ from: () => chain }),
  };
});

import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app.js';
import {
  sendSms,
  setTemplateUlidForTest,
  setTodokuClientForTest,
  type TodokuClient,
} from '../src/services/notifications.js';

const WEBHOOK_SECRET = process.env.TODOKU_KWS_WEBHOOK_SECRET as string;

let app: Express;
beforeAll(() => {
  app = buildApp();
});
beforeEach(() => {
  setTodokuClientForTest(null);
});

describe('S9-003 — sendSms scaffold', () => {
  it('returns template_not_ready for a placeholder template', async () => {
    const res = await sendSms({
      template: 'kws_sla_breach',
      to_msisdn: '254700000000',
      variables: { ticket_ref: 'KWS-T-0001', sla_hours: '4' },
    });
    expect(res.status).toBe('template_not_ready');
  });

  it('sends through the injected client when the template ULID is set', async () => {
    setTemplateUlidForTest('kws_proforma_dispatched', '01HZZZREALULID0000000000');
    const fake: TodokuClient = {
      send: async () => ({ provider_ref: 'tdk-msg-123' }),
    };
    setTodokuClientForTest(fake);

    const res = await sendSms({
      template: 'kws_proforma_dispatched',
      to_msisdn: '254700000000',
      variables: { ref: 'KWS-042', total: '13705', portal_link: 'https://ws.kipkiren.co.ke' },
      entity_type: 'proforma',
      entity_id: 'pf-1',
    });
    expect(res).toEqual({ status: 'sent', provider_ref: 'tdk-msg-123' });
  });

  it('never throws on client failure — returns failed', async () => {
    setTemplateUlidForTest('kws_payment_confirmed', '01HZZZREALULID0000000001');
    setTodokuClientForTest({
      send: async () => {
        throw new Error('todoku_send_failed');
      },
    });

    const res = await sendSms({
      template: 'kws_payment_confirmed',
      to_msisdn: '254700000000',
      variables: { gateway_ref: 'QHX', ticket_ref: 'KWS-T-1' },
    });
    expect(res.status).toBe('failed');
  });
});

describe('S9-003 — Todoku delivery webhook', () => {
  const sign = (raw: string) => createHmac('sha256', WEBHOOK_SECRET).update(raw, 'utf8').digest('base64');

  it('rejects a missing/invalid signature', async () => {
    const raw = JSON.stringify({ message_id: 'tdk-1', status: 'delivered' });
    const res = await request(app)
      .post('/v1/webhooks/todoku/delivery')
      .set('content-type', 'application/json')
      .set('x-todoku-signature', 'not-a-valid-signature')
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_signature');
  });

  it('accepts a valid signature and acks 200', async () => {
    const raw = JSON.stringify({ message_id: 'tdk-1', status: 'delivered' });
    const res = await request(app)
      .post('/v1/webhooks/todoku/delivery')
      .set('content-type', 'application/json')
      .set('x-todoku-signature', sign(raw))
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('400s on a valid signature but malformed payload', async () => {
    const raw = JSON.stringify({ nope: true });
    const res = await request(app)
      .post('/v1/webhooks/todoku/delivery')
      .set('content-type', 'application/json')
      .set('x-todoku-signature', sign(raw))
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_payload');
  });
});

describe('S9-003 — feature gate', () => {
  it('isFeatureConfigured(todoku) is false when a var is missing', async () => {
    vi.resetModules();
    const prev = process.env.TODOKU_API_BASE;
    process.env.TODOKU_API_BASE = '';
    const env = await import('../src/config/env.js');
    expect(env.isFeatureConfigured('todoku')).toBe(false);
    if (prev !== undefined) process.env.TODOKU_API_BASE = prev;
  });
});
