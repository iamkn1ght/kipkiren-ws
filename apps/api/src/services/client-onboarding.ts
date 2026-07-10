/**
 * Client onboarding + provisioning (KWS-S8-001).
 *
 * Replaces the manual "dashboard + SQL" provisioning with a single transactional
 * workflow an admin runs from inside KWS. One "Add client" creates three linked
 * records across two systems:
 *
 *   1. public.clients        - the business (name, contact, plan, status)
 *   2. auth.users (Supabase) - an INVITED identity; the client sets their own
 *                              password from the invite email. We never see or
 *                              store a password.
 *   3. public.users          - the app profile (id = auth id, role=client,
 *                              client_id linked), which the login flow reads to
 *                              mint the JWT.
 *
 * There is no cross-service DB transaction available (auth lives in a separate
 * schema, and the JS client is not one connection), so correctness is enforced
 * with a SAGA + COMPENSATION: each step records what to undo, and any failure
 * rolls back the prior steps so we never leave orphaned records.
 *
 * The saga (runOnboarding) is pure orchestration over an injectable
 * OnboardingStore, so the happy path AND every rollback branch are unit-tested
 * without touching Supabase. supabaseStore() is the production wiring.
 *
 * Extension points (deliberately shaped for future sprints): the same store +
 * runOnboarding back self-service signup, bulk/CSV import (loop over rows),
 * partner-created accounts (different actor), and API provisioning (different
 * transport) - all of them just call runOnboarding with a different caller.
 */

import { z } from 'zod';
import { getServiceClient } from '../lib/supabase.js';
import { writeAuditEvent, type AuditEventType } from './audit.js';
import { logger } from '../lib/logger.js';
import { loadEnv } from '../config/env.js';
import type { UserRole } from '../middleware/auth.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const emptyToUndef = (v: unknown) => (v === '' ? undefined : v);

export const OnboardClientInput = z.object({
  business_name: z.string().trim().min(2, 'Business name is too short').max(120),
  contact_name: z.string().trim().min(2, 'Contact name is too short').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(160),
  phone: z.preprocess(emptyToUndef, z.string().trim().min(7).max(32).optional()),
  retainer_plan_id: z.string().uuid('Select a plan'),
  status: z.enum(['active', 'suspended']).default('active'),
  notes: z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
});
export type OnboardClientInputT = z.infer<typeof OnboardClientInput>;

export const UpdateClientInput = z.object({
  business_name: z.string().trim().min(2).max(120).optional(),
  contact_name: z.string().trim().min(2).max(80).optional(),
  phone: z.preprocess(emptyToUndef, z.string().trim().min(7).max(32).optional()),
  retainer_plan_id: z.string().uuid().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateClientInputT = z.infer<typeof UpdateClientInput>;

// ---------------------------------------------------------------------------
// Typed error the routes translate to an HTTP status + code
// ---------------------------------------------------------------------------

export class OnboardError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
  }
}

export interface Actor { id: string; role: UserRole }

// ---------------------------------------------------------------------------
// The store the saga orchestrates over (injectable for tests)
// ---------------------------------------------------------------------------

export interface CreatedClient {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  status: 'active' | 'suspended';
  retainer_plan_id: string;
  created_at: string;
}

export interface OnboardAuditEvent {
  actor: Actor;
  event_type: AuditEventType;
  entity_id: string;
  payload: Record<string, unknown>;
}

export interface OnboardingStore {
  findClientByEmail(email: string): Promise<{ id: string } | null>;
  findPlan(id: string): Promise<{ id: string; name: string } | null>;
  createClient(data: { business_name: string; contact_name: string; email: string; phone: string | null; retainer_plan_id: string; status: 'active' | 'suspended' }): Promise<CreatedClient>;
  deleteClient(id: string): Promise<void>;
  inviteUser(email: string, meta: { full_name: string; client_id: string; redirectTo: string }): Promise<{ userId: string; created: boolean }>;
  deleteAuthUser(id: string): Promise<void>;
  upsertProfile(data: { id: string; email: string; full_name: string; client_id: string }): Promise<void>;
  audit(e: OnboardAuditEvent): Promise<void>;
}

export interface OnboardResult {
  client: CreatedClient;
  plan_name: string;
  invite_status: 'sent' | 'existing_account';
}

// ---------------------------------------------------------------------------
// The saga
// ---------------------------------------------------------------------------

/**
 * Onboard a client transactionally. Steps 2/3 roll back everything created so
 * far on failure, so a half-finished onboarding never leaves orphans.
 */
export async function runOnboarding(
  input: OnboardClientInputT,
  actor: Actor,
  store: OnboardingStore,
): Promise<OnboardResult> {
  const email = input.email.trim().toLowerCase();

  // Idempotency: one client per email. A retry after a partial failure is safe
  // because the rollback below removed the partial record.
  if (await store.findClientByEmail(email)) {
    throw new OnboardError(409, 'client_email_exists', 'A client with this email already exists.');
  }

  const plan = await store.findPlan(input.retainer_plan_id);
  if (!plan) throw new OnboardError(400, 'invalid_plan', 'The selected retainer plan does not exist.');

  // STEP 1 - business record
  const client = await store.createClient({
    business_name: input.business_name.trim(),
    contact_name: input.contact_name.trim(),
    email,
    phone: input.phone?.trim() || null,
    retainer_plan_id: input.retainer_plan_id,
    status: input.status,
  });

  // STEP 2 - auth invite (client sets their own password). Roll back the client
  // on failure.
  let auth: { userId: string; created: boolean };
  try {
    const env = loadEnv();
    const redirectTo = `${env.allowedOrigins[0] ?? 'https://ws.kipkiren.co.ke'}/`;
    auth = await store.inviteUser(email, { full_name: input.contact_name.trim(), client_id: client.id, redirectTo });
  } catch (err) {
    await safeCompensate(() => store.deleteClient(client.id), 'client', client.id);
    logger.error({ err, clientId: client.id }, 'onboard_invite_failed_rolled_back');
    throw new OnboardError(502, 'invite_failed', 'Could not send the invitation. No records were created; please try again.');
  }

  // STEP 3 - app profile. Roll back the client and (if we created it) the auth
  // user on failure.
  try {
    await store.upsertProfile({ id: auth.userId, email, full_name: input.contact_name.trim(), client_id: client.id });
  } catch (err) {
    await safeCompensate(() => store.deleteClient(client.id), 'client', client.id);
    if (auth.created) await safeCompensate(() => store.deleteAuthUser(auth.userId), 'auth_user', auth.userId);
    logger.error({ err, clientId: client.id }, 'onboard_profile_failed_rolled_back');
    throw new OnboardError(500, 'profile_link_failed', 'Could not link the user profile. No records were created; please try again.');
  }

  await store.audit({
    actor,
    event_type: 'client_onboarded',
    entity_id: client.id,
    payload: { business_name: client.business_name, email, plan: plan.name, status: client.status, invite: auth.created ? 'sent' : 'existing_account', notes: input.notes ?? null },
  });

  return { client, plan_name: plan.name, invite_status: auth.created ? 'sent' : 'existing_account' };
}

/** Run a compensation without letting its own failure mask the original error. */
async function safeCompensate(fn: () => Promise<void>, kind: string, id: string): Promise<void> {
  try { await fn(); } catch (err) { logger.error({ err, kind, id }, 'onboard_compensation_failed'); }
}

// ---------------------------------------------------------------------------
// Production store wiring (Supabase service role + Auth admin API)
// ---------------------------------------------------------------------------

export function supabaseStore(): OnboardingStore {
  const sb = getServiceClient();
  return {
    async findClientByEmail(email) {
      const { data } = await sb.from('clients').select('id').eq('email', email).maybeSingle();
      return data ? { id: data.id as string } : null;
    },
    async findPlan(id) {
      const { data } = await sb.from('retainer_plans').select('id, name').eq('id', id).maybeSingle();
      return data ? { id: data.id as string, name: data.name as string } : null;
    },
    async createClient(d) {
      const { data, error } = await sb.from('clients')
        .insert({ business_name: d.business_name, contact_name: d.contact_name, email: d.email, phone: d.phone, retainer_plan_id: d.retainer_plan_id, status: d.status })
        .select('id, business_name, contact_name, email, status, retainer_plan_id, created_at').single();
      if (error || !data) throw new Error(error?.message ?? 'client_insert_failed');
      return data as CreatedClient;
    },
    async deleteClient(id) {
      const { error } = await sb.from('clients').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    async inviteUser(email, meta) {
      const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
        data: { full_name: meta.full_name, client_id: meta.client_id, role: 'client' },
        redirectTo: meta.redirectTo,
      });
      if (!error && data?.user) return { userId: data.user.id, created: true };
      // Invite failed - most often the email already has an auth identity. Resolve
      // it so we can still link the profile rather than dead-ending.
      const existing = await findAuthUserByEmail(email);
      if (existing) return { userId: existing.id, created: false };
      throw new Error(error?.message ?? 'invite_failed');
    },
    async deleteAuthUser(id) {
      const { error } = await sb.auth.admin.deleteUser(id);
      if (error) throw new Error(error.message);
    },
    async upsertProfile(d) {
      const { error } = await sb.from('users').upsert(
        { id: d.id, email: d.email, full_name: d.full_name, role: 'client', client_id: d.client_id },
        { onConflict: 'id' },
      );
      if (error) throw new Error(error.message);
    },
    async audit(e) {
      await writeAuditEvent({ actor_id: e.actor.id, actor_role: e.actor.role, event_type: e.event_type, entity_type: 'client', entity_id: e.entity_id, payload_snapshot: e.payload });
    },
  };
}

/** Resolve a Supabase auth user by email (paged listing; fine to ~1000 users). */
async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  const sb = getServiceClient();
  const target = email.toLowerCase();
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => (x.email ?? '').toLowerCase() === target);
  return u ? { id: u.id } : null;
}

// ---------------------------------------------------------------------------
// Lifecycle operations (single-step; audited)
// ---------------------------------------------------------------------------

async function loadClient(id: string): Promise<{ id: string; email: string; business_name: string; status: string; retainer_plan_id: string | null }> {
  const sb = getServiceClient();
  const { data, error } = await sb.from('clients').select('id, email, business_name, status, retainer_plan_id').eq('id', id).maybeSingle();
  if (error || !data) throw new OnboardError(404, 'client_not_found', 'Client not found.');
  return data as { id: string; email: string; business_name: string; status: string; retainer_plan_id: string | null };
}

export async function updateClient(id: string, patch: UpdateClientInputT, actor: Actor): Promise<void> {
  const sb = getServiceClient();
  await loadClient(id);
  if (patch.retainer_plan_id) {
    const { data: plan } = await sb.from('retainer_plans').select('id').eq('id', patch.retainer_plan_id).maybeSingle();
    if (!plan) throw new OnboardError(400, 'invalid_plan', 'The selected retainer plan does not exist.');
  }
  const fields: Record<string, unknown> = {};
  if (patch.business_name) fields.business_name = patch.business_name.trim();
  if (patch.contact_name) fields.contact_name = patch.contact_name.trim();
  if (patch.phone !== undefined) fields.phone = patch.phone?.trim() || null;
  if (patch.retainer_plan_id) fields.retainer_plan_id = patch.retainer_plan_id;
  const { error } = await sb.from('clients').update(fields).eq('id', id);
  if (error) throw new OnboardError(500, 'client_update_failed', 'Could not update the client.');
  await writeAuditEvent({ actor_id: actor.id, actor_role: actor.role, event_type: 'client_updated', entity_type: 'client', entity_id: id, payload_snapshot: { fields: Object.keys(fields) } });
}

export async function setClientStatus(id: string, status: 'active' | 'suspended', actor: Actor): Promise<void> {
  const sb = getServiceClient();
  const client = await loadClient(id);
  const { error } = await sb.from('clients').update({ status }).eq('id', id);
  if (error) throw new OnboardError(500, 'status_update_failed', 'Could not change the client status.');
  await writeAuditEvent({ actor_id: actor.id, actor_role: actor.role, event_type: 'client_status_changed', entity_type: 'client', entity_id: id, payload_snapshot: { from: client.status, to: status } });
}

export async function resendInvite(id: string, actor: Actor): Promise<void> {
  const sb = getServiceClient();
  const client = await loadClient(id);
  const env = loadEnv();
  const redirectTo = `${env.allowedOrigins[0] ?? 'https://ws.kipkiren.co.ke'}/`;
  const { error } = await sb.auth.admin.inviteUserByEmail(client.email, { data: { client_id: id, role: 'client' }, redirectTo });
  if (error) throw new OnboardError(502, 'resend_failed', 'Could not resend the invitation. The client may already have accepted it.');
  await writeAuditEvent({ actor_id: actor.id, actor_role: actor.role, event_type: 'client_invite_resent', entity_type: 'client', entity_id: id, payload_snapshot: { email: client.email } });
}

export async function sendPasswordReset(id: string, actor: Actor): Promise<void> {
  const sb = getServiceClient();
  const client = await loadClient(id);
  const env = loadEnv();
  const redirectTo = `${env.allowedOrigins[0] ?? 'https://ws.kipkiren.co.ke'}/`;
  const { error } = await sb.auth.resetPasswordForEmail(client.email, { redirectTo });
  if (error) throw new OnboardError(502, 'reset_failed', 'Could not send the password reset email.');
  await writeAuditEvent({ actor_id: actor.id, actor_role: actor.role, event_type: 'client_password_reset_sent', entity_type: 'client', entity_id: id, payload_snapshot: { email: client.email } });
}

// ---------------------------------------------------------------------------
// List helpers
// ---------------------------------------------------------------------------

export interface RetainerPlanOption { id: string; name: string; monthly_fee_kes: number; included_hours: number }

export async function listRetainerPlans(): Promise<RetainerPlanOption[]> {
  const sb = getServiceClient();
  const { data, error } = await sb.from('retainer_plans').select('id, name, monthly_fee_kes, included_hours').eq('active', true).order('monthly_fee_kes', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RetainerPlanOption[];
}

export type InviteStatus = 'invited' | 'accepted' | 'active' | 'unknown';

/**
 * Attach an auth-derived invite status to each client row:
 *   active   - has signed in at least once
 *   accepted - confirmed the invite (set a password) but not signed in yet
 *   invited  - invite pending
 * Derives client -> auth-user via public.users, then a single Auth admin list.
 * (Pages once to 1000 users; paginate here when the base grows past that.)
 */
export async function attachInviteStatus<T extends { id: string; invite_status: InviteStatus }>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const sb = getServiceClient();
  try {
    const { data: profiles } = await sb.from('users').select('id, client_id').in('client_id', rows.map((r) => r.id));
    const clientToUser = new Map<string, string>();
    for (const p of (profiles ?? []) as { id: string; client_id: string | null }[]) {
      if (p.client_id) clientToUser.set(p.client_id, p.id);
    }
    const { data: authData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authById = new Map<string, { last_sign_in_at: string | null; email_confirmed_at: string | null }>();
    for (const u of authData?.users ?? []) {
      authById.set(u.id, { last_sign_in_at: u.last_sign_in_at ?? null, email_confirmed_at: u.email_confirmed_at ?? null });
    }
    for (const r of rows) {
      const uid = clientToUser.get(r.id);
      const a = uid ? authById.get(uid) : undefined;
      r.invite_status = !a ? 'invited' : a.last_sign_in_at ? 'active' : a.email_confirmed_at ? 'accepted' : 'invited';
    }
  } catch (err) {
    logger.error({ err }, 'attach_invite_status_failed');
    // Degrade to 'unknown' rather than break the clients list.
  }
  return rows;
}
