/**
 * ADR-KWS-003 / KWS-SEC-007 regression guard — Kamau PII stripping.
 *
 * The tasks router serialises through `toKamauTask` which must pick ONLY
 * a fixed allow-list of columns. This test mocks the supabase service
 * client to return a row contaminated with PII-adjacent fields, then
 * asserts the response contains EXACTLY the allow-listed keys and
 * none of the forbidden ones.
 *
 * If a future change adds a new column to the SELECT in routes/tasks.ts
 * without updating the serializer, this test will fail — which is the
 * point. Kamau's API surface is allow-listed by construction.
 */

import { describe, expect, it, beforeAll, vi } from 'vitest';

// Mock BEFORE any module imports tasks.ts / app.ts that close over the
// real supabase binding. vi.mock is hoisted.
const CONTAMINATED_ROW = {
  // Allowed keys — must appear
  id: '00000000-0000-0000-0000-000000000aaa',
  ref: 'KWS-T-0001',
  category: 'web',
  urgency: 'standard',
  status: 'in_progress',
  description: 'Add a new staff member to the team page',
  sla_deadline_at: '2026-04-13T08:00:00Z',
  created_at: '2026-04-12T08:00:00Z',
  // Forbidden keys — must NOT appear
  client_id: '00000000-0000-0000-0000-000000000bbb',
  business_name: 'Jane Wanjiru Logistics Ltd',
  contact_name: 'Jane Wanjiru',
  email: 'jane@jwlogistics.co.ke',
  phone: '+254700000000',
  proforma_id: '00000000-0000-0000-0000-000000000ccc',
  proforma_ref: 'KWS-042',
  amount_kes: 13705,
  total_kes: 13705,
  subtotal_kes: 13125,
  assigned_to: '00000000-0000-0000-0000-000000000001',
  submitted_by: 'jane-user-id',
  payment_ref: 'QHJ7K2P9X4',
  content_hash: 'aabbccdd',
};

let listMode: 'many' | 'one' = 'many';

vi.mock('../src/lib/supabase.js', () => {
  const chain: {
    select: () => typeof chain;
    eq: () => typeof chain;
    not: () => typeof chain;
    order: () => Promise<{ data: unknown; error: null }>;
    single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  } = {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    order: async () => ({
      data: listMode === 'many' ? [CONTAMINATED_ROW] : [],
      error: null,
    }),
    single: async () => ({
      data: listMode === 'one' ? CONTAMINATED_ROW : null,
      error: listMode === 'one' ? null : { message: 'not_found' },
    }),
  };
  return {
    getServiceClient: () => ({ from: () => chain }),
    getUserClient: () => ({ from: () => chain }),
  };
});

// Imports AFTER the mock so the route closes over the mocked module.
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app.js';
import { mintTestToken, auth } from './helpers.js';

const ALLOWED_KEYS = [
  'id',
  'ref',
  'category',
  'urgency',
  'status',
  'description',
  'sla_deadline_at',
  'created_at',
].sort();

const FORBIDDEN_KEYS = [
  'client_id',
  'business_name',
  'contact_name',
  'email',
  'phone',
  'proforma_id',
  'proforma_ref',
  'amount_kes',
  'total_kes',
  'subtotal_kes',
  'assigned_to',
  'submitted_by',
  'payment_ref',
  'content_hash',
];

let app: Express;
beforeAll(() => {
  app = buildApp();
});

describe('ADR-KWS-003 — Kamau task serializer strips PII', () => {
  it('GET /v1/tasks returns ONLY the allowed key set', async () => {
    listMode = 'many';
    const res = await request(app).get('/v1/tasks').set(auth(mintTestToken('technical_delivery')));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.tasks).toHaveLength(1);

    const task = res.body.tasks[0];
    expect(Object.keys(task).sort()).toEqual(ALLOWED_KEYS);
    for (const k of FORBIDDEN_KEYS) {
      expect(task).not.toHaveProperty(k);
    }
  });

  it('GET /v1/tasks/:id returns ONLY the allowed key set', async () => {
    listMode = 'one';
    const res = await request(app)
      .get('/v1/tasks/00000000-0000-0000-0000-000000000aaa')
      .set(auth(mintTestToken('technical_delivery', { sub: '00000000-0000-0000-0000-000000000001' })));
    expect(res.status).toBe(200);
    const task = res.body.task;
    expect(Object.keys(task).sort()).toEqual(ALLOWED_KEYS);
    for (const k of FORBIDDEN_KEYS) {
      expect(task).not.toHaveProperty(k);
    }
  });

  it('GET /v1/tasks/:id returns 404 when caller is not the assignee', async () => {
    listMode = 'one';
    const res = await request(app)
      .get('/v1/tasks/00000000-0000-0000-0000-000000000aaa')
      .set(auth(mintTestToken('technical_delivery', { sub: '99999999-9999-9999-9999-999999999999' })));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'task_not_found' });
  });
});
