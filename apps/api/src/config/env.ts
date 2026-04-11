import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  JWT_PRIVATE_KEY_PEM_B64: z.string().min(1),
  JWT_PUBLIC_KEY_PEM_B64: z.string().min(1),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),

  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  KIPKIREN_PAY_BASE_URL: z.string().url(),
  KIPKIREN_PAY_API_KEY: z.string().min(1),
  KIPKIREN_PAY_HMAC_SECRET: z.string().min(1),

  PAYSTACK_SECRET_KEY: z.string().min(1),
  PAYSTACK_WEBHOOK_SECRET: z.string().min(1),

  ALLOWED_ORIGINS: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema> & {
  jwtPrivateKey: string;
  jwtPublicKey: string;
  allowedOrigins: string[];
};

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment: ${JSON.stringify(flat)}`);
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
