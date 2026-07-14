import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from '../config/env.js';

let serviceClient: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS - use ONLY in trusted server contexts
 * (webhook handlers, admin actions). Never expose to a client request path
 * that hasn't been authenticated and authorised.
 */
export function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const env = loadEnv();
  serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

/**
 * Throwaway anon client used ONLY to verify a password via signInWithPassword.
 * It must NOT be the shared service-role client: signInWithPassword mutates the
 * client's in-memory auth session, so any subsequent write on that client runs
 * as the logged-in user (RLS-restricted) instead of service_role and fails.
 * We create a fresh client, verify, and discard it.
 */
export function createPasswordVerifyClient(): SupabaseClient {
  const env = loadEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Per-request RLS-bound client. Pass the user's JWT and Supabase enforces
 * RLS policies as that user. This is the default for any handler that
 * acts on behalf of an authenticated client (P1/P2/P3).
 */
export function getUserClient(userJwt: string): SupabaseClient {
  const env = loadEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
}
