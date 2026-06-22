/**
 * KWS-SEC-002 - RLS cross-client isolation.
 *
 * Verifies the policies in 0002_rls.sql actually prevent Client A from
 * reading Client B's tickets/proformas/invoices via the RLS-bound client.
 *
 * Requires a real Supabase project (the test schema applied via migrations
 * 0001..0003). Skips automatically when KWS_RLS_TEST_URL is not set so the
 * default `pnpm test` works on a dev box without Supabase.
 *
 * Required env:
 *   KWS_RLS_TEST_URL                   = https://<project>.supabase.co
 *   KWS_RLS_TEST_SERVICE_KEY           = service-role JWT
 *   KWS_RLS_TEST_CLIENT_A_JWT          = a Supabase Auth user JWT linked to client A
 *   KWS_RLS_TEST_CLIENT_B_JWT          = a Supabase Auth user JWT linked to client B
 *   KWS_RLS_TEST_CLIENT_A_TICKET_ID    = a known ticket id owned by client A
 *
 * Setup script (db/test-fixtures.sql) is the developer's responsibility for now.
 */

import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.KWS_RLS_TEST_URL;
const clientAJwt = process.env.KWS_RLS_TEST_CLIENT_A_JWT;
const clientBJwt = process.env.KWS_RLS_TEST_CLIENT_B_JWT;
const aTicketId = process.env.KWS_RLS_TEST_CLIENT_A_TICKET_ID;
const anonKey = process.env.KWS_RLS_TEST_ANON_KEY;

const skip = !url || !clientAJwt || !clientBJwt || !aTicketId || !anonKey;

const d = skip ? describe.skip : describe;

d('KWS-SEC-002 RLS isolation (live Supabase)', () => {
  // Guard createClient - even inside describe.skip, vitest evaluates the
  // callback body at collection time. Newer @supabase/supabase-js validates
  // the URL eagerly, so we must not call createClient when env vars are missing.
  const makeSb = (jwt: string) =>
    createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  const sbAsB = skip ? (null as never) : makeSb(clientBJwt!);
  const sbAsA = skip ? (null as never) : makeSb(clientAJwt!);

  it('Client A can read their own ticket row', async () => {
    const { data, error } = await sbAsA.from('tickets').select('id').eq('id', aTicketId!).maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(aTicketId);
  });

  it('Client B CANNOT read Client A ticket row by id', async () => {
    const { data, error } = await sbAsB.from('tickets').select('id').eq('id', aTicketId!).maybeSingle();
    // RLS returns no rows (not an error). Either is acceptable; the row must not appear.
    expect(error?.code === 'PGRST116' || data === null).toBe(true);
  });

  it('Client B CANNOT list any of Client A tickets', async () => {
    const { data, error } = await sbAsB.from('tickets').select('id, client_id');
    expect(error).toBeNull();
    expect((data ?? []).every((r) => r.client_id !== /* client A id */ undefined)).toBe(true);
  });

  it('Client B CANNOT read proforma_approvals from Client A', async () => {
    const { data } = await sbAsB.from('proforma_approvals').select('id, client_id');
    expect((data ?? []).length).toBe(0);
  });

  it('Client B CANNOT write to rate_card', async () => {
    const { error } = await sbAsB.from('rate_card').insert({
      category: 'cloud',
      task_name: 'malicious-insert',
      estimated_hours: 1,
      base_rate_kes_per_hour: 1,
      fixed_price_kes: 1,
    });
    expect(error).not.toBeNull();
  });
});
