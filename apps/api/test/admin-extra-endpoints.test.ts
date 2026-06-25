/**
 * Role-gate coverage for the S6/S8/S9 admin endpoints added during the
 * codeable-sprint pass. These assert the security perimeter (401/403) which
 * short-circuits before any DB call - no Supabase mock needed, mirroring
 * admin-tickets.test.ts. Happy-path data shaping is covered by the pure-function
 * unit tests (sla-audit, observability, ssl, domain-expiry).
 */

import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app.js';
import { mintTestToken, auth } from './helpers.js';

let app: Express;
beforeAll(() => {
  app = buildApp();
});

const GETS = ['/v1/admin/sla-audit', '/v1/admin/agents', '/v1/admin/site-health'];
const POSTS = ['/v1/admin/ssl-check', '/v1/admin/domain-expiry-scan', '/v1/admin/sla-breach-scan'];

describe('new admin endpoints - role gate', () => {
  it('GET endpoints forbid client + technical_delivery (403) and require auth (401)', async () => {
    for (const path of GETS) {
      for (const role of ['client', 'technical_delivery'] as const) {
        const res = await request(app).get(path).set(auth(mintTestToken(role)));
        expect(res.status, `${path} as ${role}`).toBe(403);
      }
      const noauth = await request(app).get(path);
      expect(noauth.status, `${path} no auth`).toBe(401);
    }
  });

  it('POST endpoints forbid client + technical_delivery (403) and require auth (401)', async () => {
    for (const path of POSTS) {
      for (const role of ['client', 'technical_delivery'] as const) {
        const res = await request(app).post(path).set(auth(mintTestToken(role))).send({});
        expect(res.status, `${path} as ${role}`).toBe(403);
      }
      const noauth = await request(app).post(path).send({});
      expect(noauth.status, `${path} no auth`).toBe(401);
    }
  });
});
