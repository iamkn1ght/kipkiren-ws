/**
 * Client onboarding (KWS-S8-001).
 *
 * The saga (runOnboarding) is orchestration over an injectable store, so the
 * happy path AND every compensation branch are unit-tested here without any
 * Supabase. The route perimeter (admin-only, auth) is covered with supertest -
 * those checks short-circuit before any provisioning call.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app.js';
import { mintTestToken, auth } from './helpers.js';
import {
  OnboardClientInput,
  runOnboarding,
  OnboardError,
  type OnboardingStore,
  type Actor,
} from '../src/services/client-onboarding.js';

const ACTOR: Actor = { id: 'admin-1', role: 'admin' };
const VALID = {
  business_name: 'Acme Ltd',
  contact_name: 'Mary Wanjiru',
  email: 'Mary@Acme.co.ke',
  phone: '+254712345678',
  retainer_plan_id: '11111111-1111-1111-1111-111111111111',
  status: 'active' as const,
  notes: 'Referred by Chamia',
};

// ---- fake store -----------------------------------------------------------
interface Overrides {
  existingClient?: { id: string } | null;
  plan?: { id: string; name: string } | null;
  inviteThrows?: boolean;
  inviteCreated?: boolean;
  profileThrows?: boolean;
}
function makeStore(o: Overrides = {}) {
  const calls: string[] = [];
  const store: OnboardingStore = {
    async findClientByEmail() { calls.push('findClientByEmail'); return o.existingClient ?? null; },
    async findPlan(id) { calls.push('findPlan'); return o.plan === null ? null : (o.plan ?? { id, name: 'Growth' }); },
    async createClient(d) {
      calls.push('createClient');
      return { id: 'client-1', business_name: d.business_name, contact_name: d.contact_name, email: d.email, status: d.status, retainer_plan_id: d.retainer_plan_id, created_at: '2026-01-01T00:00:00Z' };
    },
    async deleteClient() { calls.push('deleteClient'); },
    async inviteUser() { calls.push('inviteUser'); if (o.inviteThrows) throw new Error('invite_down'); return { userId: 'auth-1', created: o.inviteCreated ?? true }; },
    async deleteAuthUser() { calls.push('deleteAuthUser'); },
    async upsertProfile() { calls.push('upsertProfile'); if (o.profileThrows) throw new Error('profile_down'); },
    async audit() { calls.push('audit'); },
  };
  return { store, calls };
}

describe('OnboardClientInput validation', () => {
  it('accepts a well-formed client and normalises the email', () => {
    const r = OnboardClientInput.safeParse(VALID);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('mary@acme.co.ke');
  });
  it('rejects a bad email', () => {
    expect(OnboardClientInput.safeParse({ ...VALID, email: 'nope' }).success).toBe(false);
  });
  it('rejects a too-short business name', () => {
    expect(OnboardClientInput.safeParse({ ...VALID, business_name: 'A' }).success).toBe(false);
  });
  it('rejects a non-uuid plan', () => {
    expect(OnboardClientInput.safeParse({ ...VALID, retainer_plan_id: 'starter' }).success).toBe(false);
  });
  it('treats an empty phone/notes as omitted', () => {
    const r = OnboardClientInput.safeParse({ ...VALID, phone: '', notes: '' });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.phone).toBeUndefined(); expect(r.data.notes).toBeUndefined(); }
  });
});

describe('runOnboarding saga', () => {
  const parsed = OnboardClientInput.parse(VALID);

  it('happy path: creates client, invites, links profile, audits', async () => {
    const { store, calls } = makeStore();
    const res = await runOnboarding(parsed, ACTOR, store);
    expect(calls).toEqual(['findClientByEmail', 'findPlan', 'createClient', 'inviteUser', 'upsertProfile', 'audit']);
    expect(res.invite_status).toBe('sent');
    expect(res.client.id).toBe('client-1');
    expect(res.plan_name).toBe('Growth');
  });

  it('is idempotent: an existing client email is rejected before any writes', async () => {
    const { store, calls } = makeStore({ existingClient: { id: 'x' } });
    await expect(runOnboarding(parsed, ACTOR, store)).rejects.toMatchObject({ statusCode: 409, code: 'client_email_exists' });
    expect(calls).toEqual(['findClientByEmail']);
  });

  it('rejects an unknown plan before creating anything', async () => {
    const { store, calls } = makeStore({ plan: null });
    await expect(runOnboarding(parsed, ACTOR, store)).rejects.toMatchObject({ statusCode: 400, code: 'invalid_plan' });
    expect(calls).toEqual(['findClientByEmail', 'findPlan']);
  });

  it('rolls back the client when the invite fails (no orphan, no profile)', async () => {
    const { store, calls } = makeStore({ inviteThrows: true });
    await expect(runOnboarding(parsed, ACTOR, store)).rejects.toMatchObject({ statusCode: 502, code: 'invite_failed' });
    expect(calls).toContain('deleteClient');
    expect(calls).not.toContain('upsertProfile');
    expect(calls).not.toContain('audit');
  });

  it('rolls back client AND a freshly-created auth user when the profile link fails', async () => {
    const { store, calls } = makeStore({ profileThrows: true, inviteCreated: true });
    await expect(runOnboarding(parsed, ACTOR, store)).rejects.toMatchObject({ statusCode: 500, code: 'profile_link_failed' });
    expect(calls).toContain('deleteClient');
    expect(calls).toContain('deleteAuthUser');
  });

  it('does NOT delete a pre-existing auth user on profile failure (only compensates what it created)', async () => {
    const { store, calls } = makeStore({ profileThrows: true, inviteCreated: false });
    await expect(runOnboarding(parsed, ACTOR, store)).rejects.toMatchObject({ statusCode: 500 });
    expect(calls).toContain('deleteClient');
    expect(calls).not.toContain('deleteAuthUser');
  });
});

describe('onboarding routes - role perimeter', () => {
  let app: Express;
  beforeAll(() => { app = buildApp(); });

  const ADMIN_ONLY_POSTS = [
    '/v1/admin/clients',
    '/v1/admin/clients/abc/status',
    '/v1/admin/clients/abc/resend-invite',
    '/v1/admin/clients/abc/reset-password',
  ];

  it('provisioning POSTs forbid non-admins (client, technical_delivery, delivery_lead) and require auth', async () => {
    for (const path of ADMIN_ONLY_POSTS) {
      for (const role of ['client', 'technical_delivery', 'delivery_lead'] as const) {
        const res = await request(app).post(path).set(auth(mintTestToken(role))).send({});
        expect(res.status, `${path} as ${role}`).toBe(403);
      }
      const noauth = await request(app).post(path).send({});
      expect(noauth.status, `${path} no auth`).toBe(401);
    }
  });

  it('GET clients + retainer-plans forbid client + technical_delivery and require auth', async () => {
    for (const path of ['/v1/admin/clients', '/v1/admin/retainer-plans']) {
      for (const role of ['client', 'technical_delivery'] as const) {
        const res = await request(app).get(path).set(auth(mintTestToken(role)));
        expect(res.status, `${path} as ${role}`).toBe(403);
      }
      expect((await request(app).get(path)).status, `${path} no auth`).toBe(401);
    }
  });
});
