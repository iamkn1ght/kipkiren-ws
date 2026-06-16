/**
 * POST /v1/admin/tickets — admin raises a ticket on behalf of a client.
 *
 * Locks the security boundary and input validation. These paths short-circuit
 * before any DB call (role gate + Zod validation), so no Supabase mock is
 * needed. The happy-path intake pipeline is covered by the shared
 * ticket-intake flow exercised elsewhere.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app.js';
import { mintTestToken, auth } from './helpers.js';

const VALID = {
  client_id: '00000000-0000-0000-0000-0000000000c1',
  description: 'Migrate the marketing site to a new host and set up DNS.',
  category: 'web',
  urgency: 'standard',
};

let app: Express;
beforeAll(() => {
  app = buildApp();
});

describe('POST /v1/admin/tickets — role gate', () => {
  it('client and technical_delivery are forbidden (403)', async () => {
    for (const role of ['client', 'technical_delivery'] as const) {
      const res = await request(app)
        .post('/v1/admin/tickets')
        .set(auth(mintTestToken(role)))
        .send(VALID);
      expect(res.status).toBe(403);
    }
  });

  it('requires authentication (401)', async () => {
    const res = await request(app).post('/v1/admin/tickets').send(VALID);
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/admin/tickets — input validation (admin token)', () => {
  it('400 when client_id is missing', async () => {
    const { client_id, ...noClient } = VALID;
    void client_id;
    const res = await request(app)
      .post('/v1/admin/tickets')
      .set(auth(mintTestToken('admin')))
      .send(noClient);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_input');
  });

  it('400 when description is too short', async () => {
    const res = await request(app)
      .post('/v1/admin/tickets')
      .set(auth(mintTestToken('admin')))
      .send({ ...VALID, description: 'too short' });
    expect(res.status).toBe(400);
  });

  it('400 when category is invalid', async () => {
    const res = await request(app)
      .post('/v1/admin/tickets')
      .set(auth(mintTestToken('delivery_lead')))
      .send({ ...VALID, category: 'not-a-category' });
    expect(res.status).toBe(400);
  });
});
