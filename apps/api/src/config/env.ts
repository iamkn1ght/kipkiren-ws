import { z } from 'zod';

/**
 * Two-tier env validation.
 *
 * Tier 1 (REQUIRED at boot) — the service literally cannot start without these:
 *   - Supabase connection (every route touches the DB)
 *   - JWT RS256 keypair (the auth middleware runs on almost every route)
 *   - JWT issuer/audience + allowed CORS origins
 *
 * Tier 2 (OPTIONAL at boot, REQUIRED when the feature runs) — these are
 * validated lazily by the routes that need them. The service boots fine with
 * these blank; you just can't exercise those features. Attempting to does a
 * clean 503 via `requireFeatureEnv()` instead of a startup crash.
 *
 *   - Anthropic (blocks POST /v1/tickets → AI decomposition)
 *   - Kipkiren Pay (blocks M-Pesa approve + webhook)
 *   - Paystack (blocks card approve + webhook)
 *
 * This means you can deploy to Railway today with ONLY the Tier 1 vars set
 * and get a green health check + JWKS. S2/S3 features light up as you add
 * their credentials later.
 */

const CoreEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().nonnegative().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Tier 1 — required
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  JWT_PRIVATE_KEY_PEM_B64: z.string().min(1),
  JWT_PUBLIC_KEY_PEM_B64: z.string().min(1),
  JWT_ISSUER: z.string().min(1).default('ws.kipkiren.co.ke'),
  JWT_AUDIENCE: z.string().min(1).default('ws.kipkiren.co.ke'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),

  ALLOWED_ORIGINS: z.string().min(1).default('https://ws.kipkiren.co.ke'),

  // Tier 2 — optional at boot. Empty string is accepted; the feature guard
  // throws a clean 503 if you try to use a feature without its credentials.
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  KIPKIREN_PAY_BASE_URL: z.string().optional().default(''),
  KIPKIREN_PAY_API_KEY: z.string().optional().default(''),
  KIPKIREN_PAY_HMAC_SECRET: z.string().optional().default(''),

  PAYSTACK_SECRET_KEY: z.string().optional().default(''),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional().default(''),

  // Cloudflare DNS (S6) — manage client domain/dns records via the CF API.
  CLOUDFLARE_API_TOKEN: z.string().optional().default(''),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional().default(''),

  // Todoku SMS (S9-003) — transactional SMS on 5 KWS events. Todoku signs
  // with base64 HMAC-SHA256 (NOT hex — distinct from KP/Paystack).
  TODOKU_API_BASE: z.string().optional().default(''),
  TODOKU_KWS_API_KEY: z.string().optional().default(''),
  TODOKU_KWS_HMAC_SECRET: z.string().optional().default(''),
  TODOKU_KWS_WEBHOOK_SECRET: z.string().optional().default(''),
  TODOKU_KWS_SENDER_ID: z.string().optional().default(''),
});

export type Env = z.infer<typeof CoreEnvSchema> & {
  jwtPrivateKey: string;
  jwtPublicKey: string;
  allowedOrigins: string[];
};

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = CoreEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid core environment: ${JSON.stringify(flat)}`);
  }
  const env = parsed.data;
  cached = {
    ...env,
    jwtPrivateKey: Buffer.from(env.JWT_PRIVATE_KEY_PEM_B64, 'base64').toString('utf8'),
    jwtPublicKey: Buffer.from(env.JWT_PUBLIC_KEY_PEM_B64, 'base64').toString('utf8'),
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  };
  return cached;
}

/**
 * Feature guard — call at the top of a handler that needs Tier 2 vars.
 * Throws an HttpError 503 with a clear message if the feature is not yet
 * configured, instead of allowing a downstream gateway call to 500 opaquely.
 *
 * Usage:
 *   requireFeatureEnv('anthropic');
 *   requireFeatureEnv('kipkiren_pay');
 *   requireFeatureEnv('paystack');
 */
export type Feature = 'anthropic' | 'kipkiren_pay' | 'paystack' | 'cloudflare' | 'todoku';

const FEATURE_REQUIRED: Record<Feature, (keyof z.infer<typeof CoreEnvSchema>)[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  kipkiren_pay: ['KIPKIREN_PAY_BASE_URL', 'KIPKIREN_PAY_API_KEY', 'KIPKIREN_PAY_HMAC_SECRET'],
  paystack: ['PAYSTACK_SECRET_KEY', 'PAYSTACK_WEBHOOK_SECRET'],
  // Account id is optional — the scoped API token already identifies the zone.
  cloudflare: ['CLOUDFLARE_API_TOKEN'],
  todoku: [
    'TODOKU_API_BASE',
    'TODOKU_KWS_API_KEY',
    'TODOKU_KWS_HMAC_SECRET',
    'TODOKU_KWS_WEBHOOK_SECRET',
    'TODOKU_KWS_SENDER_ID',
  ],
};

export class FeatureUnavailableError extends Error {
  public readonly statusCode = 503;
  constructor(public readonly feature: Feature, public readonly missing: string[]) {
    super(`feature_unavailable:${feature}:${missing.join(',')}`);
  }
}

export function requireFeatureEnv(feature: Feature): void {
  const env = loadEnv();
  const missing = FEATURE_REQUIRED[feature].filter((k) => !env[k] || env[k] === '');
  if (missing.length > 0) {
    throw new FeatureUnavailableError(feature, missing);
  }
}

/**
 * Non-throwing variant — for code paths that must NOT fail the primary
 * operation when a feature is unconfigured (e.g. fire-and-forget SMS, where a
 * missing Todoku credential must not break proforma dispatch). Returns true
 * only when every required var for the feature is present.
 */
export function isFeatureConfigured(feature: Feature): boolean {
  const env = loadEnv();
  return FEATURE_REQUIRED[feature].every((k) => env[k] && env[k] !== '');
}
