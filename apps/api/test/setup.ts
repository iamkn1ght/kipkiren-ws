import { generateKeyPairSync } from 'node:crypto';

/**
 * Spin up an in-process RS256 keypair for tests so the suite never needs
 * a real Railway env. Set BEFORE any module loads `loadEnv()`.
 */
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '0';
process.env.LOG_LEVEL ??= 'fatal';

process.env.SUPABASE_URL ??= 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-key';

process.env.JWT_PRIVATE_KEY_PEM_B64 = b64(privateKey);
process.env.JWT_PUBLIC_KEY_PEM_B64 = b64(publicKey);
process.env.JWT_ISSUER ??= 'ws.kipkiren.co.ke';
process.env.JWT_AUDIENCE ??= 'ws.kipkiren.co.ke';
process.env.JWT_ACCESS_TTL_SECONDS ??= '900';
process.env.JWT_REFRESH_TTL_SECONDS ??= '2592000';

process.env.ANTHROPIC_API_KEY ??= 'test-anthropic-key';
process.env.ANTHROPIC_MODEL ??= 'claude-sonnet-4-6';

process.env.KIPKIREN_PAY_BASE_URL ??= 'https://pay.test.kipkiren.co.ke';
process.env.KIPKIREN_PAY_API_KEY ??= 'test-pay-key';
process.env.KIPKIREN_PAY_HMAC_SECRET ??= 'test-hmac-secret';

process.env.PAYSTACK_SECRET_KEY ??= 'test-paystack-secret';
process.env.PAYSTACK_WEBHOOK_SECRET ??= 'test-paystack-webhook';

process.env.CLOUDFLARE_API_TOKEN ??= 'test-cf-token';
process.env.CLOUDFLARE_ACCOUNT_ID ??= 'test-cf-account';

process.env.ALLOWED_ORIGINS ??= 'http://localhost:5173,http://localhost:5174';
