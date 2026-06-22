/**
 * KWS-SEC-007 / ADR-KWS-003 - Kamau (technical_delivery) penetration suite.
 *
 * The UI restricts Kamau's view to assigned task rows only. UI-level
 * restrictions are not security. This suite verifies that a valid
 * technical_delivery JWT receives 403 on every admin endpoint, every
 * client-data endpoint, and every proforma endpoint - at the API layer,
 * regardless of what the UI shows.
 *
 * It also verifies that:
 *   - HS256 tokens (the prohibited algorithm - KWS-SEC-001) are rejected
 *   - Missing bearer tokens are rejected
 *   - Each role only reaches the endpoints it should
 */

import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildApp } from '../src/app.js';
import { mintTestToken, auth } from './helpers.js';
import type { Express } from 'express';

let app: Express;

beforeAll(() => {
  app = buildApp();
});

const KAMAU_FORBIDDEN_ROUTES: Array<['get' | 'post' | 'put', string]> = [
  // admin surface
  ['get', '/v1/admin/queue'],
  ['get', '/v1/admin/clients'],
  ['get', '/v1/admin/capacity'],
  ['put', '/v1/admin/rate-card/00000000-0000-0000-0000-000000000099'],
  // client-data surface
  ['get', '/v1/tickets'],
  ['post', '/v1/tickets'],
  ['get', '/v1/tickets/00000000-0000-0000-0000-000000000050'],
  ['put', '/v1/tickets/00000000-0000-0000-0000-000000000050/assign'],
  ['get', '/v1/proformas/00000000-0000-0000-0000-000000000051'],
  ['post', '/v1/proformas/00000000-0000-0000-0000-000000000051/approve'],
  ['put', '/v1/proformas/00000000-0000-0000-0000-000000000051/review'],
  ['get', '/v1/invoices'],
];

describe('Kamau (technical_delivery) cannot reach restricted routes', () => {
  for (const [method, path] of KAMAU_FORBIDDEN_ROUTES) {
    it(`${method.toUpperCase()} ${path} → 403`, async () => {
      const token = mintTestToken('technical_delivery');
      const res = await request(app)[method](path).set(auth(token));
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: 'forbidden_role' });
    });
  }

  it('GET /v1/tasks → passes role gate (Kamau IS allowed here)', async () => {
    const token = mintTestToken('technical_delivery');
    const res = await request(app).get('/v1/tasks').set(auth(token));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('KWS-SEC-001 - RS256 enforcement', () => {
  it('rejects an HS256-signed token even with the right claims', async () => {
    const forged = jwt.sign(
      { sub: '00000000-0000-0000-0000-000000000001', role: 'admin' },
      'shared-secret',
      {
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER!,
        audience: process.env.JWT_AUDIENCE!,
        expiresIn: 900,
      },
    );
    const res = await request(app).get('/v1/admin/queue').set(auth(forged));
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid_token' });
  });

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/v1/admin/queue');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'missing_bearer_token' });
  });

  it('rejects a malformed bearer token', async () => {
    const res = await request(app).get('/v1/admin/queue').set(auth('not-a-jwt'));
    expect(res.status).toBe(401);
  });
});

describe('Role matrix on /v1/admin/rate-card/:id (KWS-SEC-009 - admin strict)', () => {
  const path = '/v1/admin/rate-card/00000000-0000-0000-0000-000000000099';

  it('client → 403', async () => {
    const res = await request(app).put(path).set(auth(mintTestToken('client', { clientId: 'c1' })));
    expect(res.status).toBe(403);
  });
  it('technical_delivery → 403', async () => {
    const res = await request(app).put(path).set(auth(mintTestToken('technical_delivery')));
    expect(res.status).toBe(403);
  });
  it('delivery_lead → 403 (NOT enough - must be strict admin)', async () => {
    const res = await request(app).put(path).set(auth(mintTestToken('delivery_lead')));
    expect(res.status).toBe(403);
  });
  it('admin → passes role gate (not 403)', async () => {
    // The real handler calls Supabase beyond this point and will 500 in
    // the test env without a real database. The assertion that matters
    // for KWS-SEC-009 is that the role gate lets admin through - any
    // response other than 403/401 proves that.
    const res = await request(app).put(path).set(auth(mintTestToken('admin')));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

describe('JWKS endpoint serves the public key', () => {
  it('GET /v1/.well-known/jwks.json returns at least one RS256 key', async () => {
    const res = await request(app).get('/v1/.well-known/jwks.json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('keys');
    expect(Array.isArray(res.body.keys)).toBe(true);
    expect(res.body.keys.length).toBeGreaterThanOrEqual(1);
    const k = res.body.keys[0];
    expect(k.alg).toBe('RS256');
    expect(k.use).toBe('sig');
    expect(k.kty).toBe('RSA');
    expect(k.kid).toBeTruthy();
    // Public key must NOT contain a private exponent.
    expect(k).not.toHaveProperty('d');
  });
});

describe('Health check', () => {
  it('GET /v1/health → 200', async () => {
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'kws-api' });
  });
});
