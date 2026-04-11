/**
 * Ticket status transition — role gate perimeter tests.
 *
 * The inline Kamau assigned_to / allowed-from / allowed-to logic needs
 * real DB state to exercise, and lives in the integration suite. These
 * perimeter tests verify the middleware role gate is in place BEFORE
 * any DB call, so a client token never reaches ticket-lookup logic.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { mintTestToken, auth } from './helpers.js';
import type { Express } from 'express';

let app: Express;
beforeAll(() => {
  app = buildApp();
});

const path = '/v1/tickets/00000000-0000-0000-0000-000000000050/status';

describe('PUT /v1/tickets/:id/status — role gate', () => {
  it('client → 403 (must be delivery_lead / admin / technical_delivery)', async () => {
    const res = await request(app)
      .put(path)
      .set(auth(mintTestToken('client', { clientId: 'c1' })))
      .send({ status: 'in_progress' });
    expect(res.status).toBe(403);
  });
  it('missing bearer → 401', async () => {
    const res = await request(app).put(path).send({ status: 'in_progress' });
    expect(res.status).toBe(401);
  });
  it('technical_delivery → passes role gate (not 403/401)', async () => {
    const res = await request(app)
      .put(path)
      .set(auth(mintTestToken('technical_delivery')))
      .send({ status: 'in_progress' });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
  it('delivery_lead → passes role gate (not 403/401)', async () => {
    const res = await request(app)
      .put(path)
      .set(auth(mintTestToken('delivery_lead')))
      .send({ status: 'in_progress' });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

describe('PUT /v1/tickets/:id/assign — role gate', () => {
  const assignPath = '/v1/tickets/00000000-0000-0000-0000-000000000050/assign';
  it('client → 403', async () => {
    const res = await request(app)
      .put(assignPath)
      .set(auth(mintTestToken('client', { clientId: 'c1' })))
      .send({ assignee_id: '00000000-0000-0000-0000-000000000001' });
    expect(res.status).toBe(403);
  });
  it('technical_delivery → 403', async () => {
    const res = await request(app)
      .put(assignPath)
      .set(auth(mintTestToken('technical_delivery')))
      .send({ assignee_id: '00000000-0000-0000-0000-000000000001' });
    expect(res.status).toBe(403);
  });
  it('delivery_lead → passes role gate', async () => {
    const res = await request(app)
      .put(assignPath)
      .set(auth(mintTestToken('delivery_lead')))
      .send({ assignee_id: '00000000-0000-0000-0000-000000000001' });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
