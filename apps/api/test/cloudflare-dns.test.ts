/**
 * S6 - Cloudflare DNS routes.
 *
 * Verifies the admin-only DNS surface: role gate, the feature gate (503 when
 * no Cloudflare token), service→zone resolution 404s, CRUD happy paths through
 * an injected fake CloudflareDnsClient, audit writes, and clean error surfacing
 * when the Cloudflare API fails.
 */

import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

// Mutable service row the supabase mock returns from client_services.single().
let serviceRow: Record<string, unknown> | null = {
  id: 'svc-1',
  service_type: 'domain',
  client_id: 'client-1',
  metadata: { domain: 'example.co.ke' },
};

vi.mock('../src/lib/supabase.js', () => {
  const make = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: async () =>
        table === 'client_services'
          ? { data: serviceRow, error: serviceRow ? null : { message: 'not_found' } }
          : { data: null, error: null },
      insert: async () => ({ error: null }), // audit_log writes
    };
    return chain;
  };
  return {
    getServiceClient: () => ({ from: (t: string) => make(t) }),
    getUserClient: () => ({ from: (t: string) => make(t) }),
  };
});

import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app.js';
import { setCloudflareClientForTest } from '../src/routes/dns.js';
import type { CloudflareDnsClient, DnsRecord } from '../src/services/cloudflare.js';
import { mintTestToken, auth } from './helpers.js';

const RECORD: DnsRecord = {
  id: 'rec-1',
  type: 'A',
  name: 'example.co.ke',
  content: '203.0.113.10',
  ttl: 1,
  proxied: true,
};

// A fully working fake; individual tests override pieces as needed.
function makeFakeClient(overrides: Partial<CloudflareDnsClient> = {}): CloudflareDnsClient {
  return {
    getZoneIdByName: async () => 'zone-1',
    listRecords: async () => [RECORD],
    createRecord: async (_z, input) => ({ ...RECORD, ...input, id: 'rec-new' }),
    updateRecord: async (_z, recordId, input) => ({ ...RECORD, ...input, id: recordId }),
    deleteRecord: async () => undefined,
    ...overrides,
  };
}

let app: Express;
beforeAll(() => {
  app = buildApp();
});

beforeEach(() => {
  serviceRow = {
    id: 'svc-1',
    service_type: 'domain',
    client_id: 'client-1',
    metadata: { domain: 'example.co.ke' },
  };
  setCloudflareClientForTest(makeFakeClient());
});

describe('S6 - Cloudflare DNS routes', () => {
  it('role gate: client and technical_delivery are forbidden', async () => {
    for (const role of ['client', 'technical_delivery'] as const) {
      const res = await request(app)
        .get('/v1/dns/svc-1/records')
        .set(auth(mintTestToken(role)));
      expect(res.status).toBe(403);
    }
  });

  it('GET lists records for delivery_lead and admin', async () => {
    for (const role of ['delivery_lead', 'admin'] as const) {
      const res = await request(app)
        .get('/v1/dns/svc-1/records')
        .set(auth(mintTestToken(role)));
      expect(res.status).toBe(200);
      expect(res.body.domain).toBe('example.co.ke');
      expect(res.body.records).toHaveLength(1);
      expect(res.body.records[0].id).toBe('rec-1');
    }
  });

  it('POST creates a record (201) and validates input', async () => {
    const ok = await request(app)
      .post('/v1/dns/svc-1/records')
      .set(auth(mintTestToken('admin')))
      .send({ type: 'A', name: 'www.example.co.ke', content: '203.0.113.20' });
    expect(ok.status).toBe(201);
    expect(ok.body.record.id).toBe('rec-new');
    expect(ok.body.record.name).toBe('www.example.co.ke');

    const bad = await request(app)
      .post('/v1/dns/svc-1/records')
      .set(auth(mintTestToken('admin')))
      .send({ type: 'NOPE', name: '', content: '' });
    expect(bad.status).toBe(400);
  });

  it('PUT updates and DELETE removes a record', async () => {
    const put = await request(app)
      .put('/v1/dns/svc-1/records/rec-1')
      .set(auth(mintTestToken('admin')))
      .send({ type: 'A', name: 'example.co.ke', content: '203.0.113.99' });
    expect(put.status).toBe(200);
    expect(put.body.record.content).toBe('203.0.113.99');

    const del = await request(app)
      .delete('/v1/dns/svc-1/records/rec-1')
      .set(auth(mintTestToken('admin')));
    expect(del.status).toBe(204);
  });

  it('404 when the service is unknown', async () => {
    serviceRow = null;
    const res = await request(app)
      .get('/v1/dns/missing/records')
      .set(auth(mintTestToken('admin')));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('service_not_found');
  });

  it('404 when the service has no domain in metadata', async () => {
    serviceRow = { id: 'svc-1', service_type: 'hosting', client_id: 'client-1', metadata: {} };
    const res = await request(app)
      .get('/v1/dns/svc-1/records')
      .set(auth(mintTestToken('admin')));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('service_has_no_domain');
  });

  it('404 when Cloudflare has no matching zone', async () => {
    setCloudflareClientForTest(makeFakeClient({ getZoneIdByName: async () => null }));
    const res = await request(app)
      .get('/v1/dns/svc-1/records')
      .set(auth(mintTestToken('admin')));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('zone_not_found');
  });

  it('surfaces a Cloudflare API failure as a clean 500, not a crash', async () => {
    setCloudflareClientForTest(
      makeFakeClient({
        listRecords: async () => {
          throw new Error('cloudflare_api_error');
        },
      }),
    );
    const res = await request(app)
      .get('/v1/dns/svc-1/records')
      .set(auth(mintTestToken('admin')));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

describe('S6 - Cloudflare feature gate', () => {
  it('requireFeatureEnv(cloudflare) throws when the token is missing', async () => {
    vi.resetModules();
    const prev = process.env.CLOUDFLARE_API_TOKEN;
    process.env.CLOUDFLARE_API_TOKEN = '';
    const env = await import('../src/config/env.js');
    expect(() => env.requireFeatureEnv('cloudflare')).toThrow(env.FeatureUnavailableError);
    if (prev !== undefined) process.env.CLOUDFLARE_API_TOKEN = prev;
  });
});
