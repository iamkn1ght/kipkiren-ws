/**
 * Staff two-factor, login throttling, real client IP behind Cloudflare and the
 * CORS refusal that used to throw a 500.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request } from 'express';

const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  writes: [] as { table: string; op: string; row: unknown }[],
  signInOk: true,
}));

vi.mock('../src/lib/supabase.js', () => {
  const make = (table: string) => {
    const result = () => ({ data: db.tables[table] ?? null, error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'is', 'not']) chain[m] = () => chain;
    chain.insert = (row: unknown) => { db.writes.push({ table, op: 'insert', row }); return chain; };
    chain.update = (row: unknown) => { db.writes.push({ table, op: 'update', row }); return chain; };
    chain.upsert = (row: unknown) => { db.writes.push({ table, op: 'upsert', row }); db.tables[table] = { ...(row as object) }; return chain; };
    chain.single = async () => {
      if (table === 'refresh_tokens') return { data: { id: 'rt-1' }, error: null };
      return result();
    };
    chain.maybeSingle = chain.single;
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res);
    return chain;
  };
  return {
    getServiceClient: () => ({ from: (t: string) => make(t) }),
    createPasswordVerifyClient: () => ({
      auth: { signInWithPassword: async () => (db.signInOk ? { data: { user: { id: 'u-admin' } }, error: null } : { data: null, error: { message: 'bad' } }) },
    }),
  };
});

const { buildApp } = await import('../src/app.js');
const { hotp, verifyTotp, base32Encode, base32Decode, timeStep } = await import('../src/lib/totp.js');
const { signMfaToken, verifyMfaToken, signAccessToken } = await import('../src/lib/tokens.js');
const { clientIp, isCloudflareIp } = await import('../src/lib/client-ip.js');

const app = buildApp();
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

beforeEach(() => {
  db.writes = [];
  db.signInOk = true;
  db.tables = { users: { id: 'u-admin', role: 'admin', client_id: null, email: 'admin@example.com' } };
});

describe('TOTP (RFC 6238 / 4226)', () => {
  it('matches the RFC 4226 HOTP test values', () => {
    const secret = Buffer.from('12345678901234567890');
    expect(['755224', '287082', '359152', '969429', '338314'].map((_, i) => hotp(secret, i))).toEqual(['755224', '287082', '359152', '969429', '338314']);
  });
  it('round-trips base32', () => {
    expect(base32Decode(SECRET).toString()).toBe('12345678901234567890');
  });
  it('accepts the current code, one step of drift, and refuses replays and junk', () => {
    const now = 1_792_500_000_000;
    const code = hotp(Buffer.from('12345678901234567890'), timeStep(now));
    const ok = verifyTotp(SECRET, code, { nowMs: now });
    expect(ok.ok).toBe(true);
    expect(verifyTotp(SECRET, code, { nowMs: now + 30_000 }).ok).toBe(true);
    expect(verifyTotp(SECRET, code, { nowMs: now + 120_000 }).ok).toBe(false);
    expect(verifyTotp(SECRET, code, { nowMs: now, afterStep: timeStep(now) }).ok).toBe(false);
    expect(verifyTotp(SECRET, '12345', { nowMs: now }).ok).toBe(false);
    expect(verifyTotp(SECRET, 'abcdef', { nowMs: now }).ok).toBe(false);
  });
});

describe('two-factor step token', () => {
  it('is not usable as a session, and a session is not usable as an mfa token', async () => {
    const mfa = signMfaToken('u-admin');
    expect(verifyMfaToken(mfa)).toBe('u-admin');
    const res = await request(app).get('/v1/admin/billing').set('Authorization', `Bearer ${mfa}`);
    expect(res.status).toBe(401);
    expect(verifyMfaToken(signAccessToken({ sub: 'u-admin', role: 'admin' }))).toBeNull();
    expect(verifyMfaToken('garbage.token.value')).toBeNull();
  });
});

describe('staff login requires a code', () => {
  it('admin with two-factor enabled gets a code challenge, not a session', async () => {
    db.tables.staff_mfa = { enabled_at: '2026-10-21T00:00:00Z', totp_secret: SECRET, last_used_step: null };
    const res = await request(app).post('/v1/auth/login').send({ email: 'admin@example.com', password: 'correct-horse' });
    expect(res.status).toBe(200);
    expect(res.body.mfa_required).toBe(true);
    expect(res.body.mfa_setup_required).toBe(false);
    expect(res.body.access_token).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });
  it('admin without two-factor is sent to setup', async () => {
    db.tables.staff_mfa = null;
    const res = await request(app).post('/v1/auth/login').send({ email: 'admin@example.com', password: 'correct-horse' });
    expect(res.body).toMatchObject({ mfa_required: true, mfa_setup_required: true });
  });
  it('a correct code issues the session; a wrong one does not', async () => {
    db.tables.staff_mfa = { enabled_at: '2026-10-21T00:00:00Z', totp_secret: SECRET, last_used_step: null };
    const token = signMfaToken('u-admin');
    const bad = await request(app).post('/v1/auth/mfa/verify').send({ mfa_token: token, code: '000000' });
    expect(bad.status).toBe(401);
    const good = await request(app).post('/v1/auth/mfa/verify').send({ mfa_token: token, code: hotp(Buffer.from('12345678901234567890'), timeStep()) });
    expect(good.status).toBe(200);
    expect(typeof good.body.access_token).toBe('string');
  });
  it('setup returns a secret and authenticator link for a valid token only', async () => {
    db.tables.staff_mfa = null;
    expect((await request(app).post('/v1/auth/mfa/setup').send({ mfa_token: 'x'.repeat(30) })).status).toBe(401);
    const res = await request(app).post('/v1/auth/mfa/setup').send({ mfa_token: signMfaToken('u-admin') });
    expect(res.status).toBe(200);
    expect(res.body.otpauth_url).toMatch(/^otpauth:\/\/totp\/Kipkiren%20WS/);
    expect(res.body.secret).toMatch(/^[A-Z2-7]{32}$/);
  });
  it('clients skip two-factor', async () => {
    db.tables.users = { id: 'u-admin', role: 'client', client_id: 'c1' };
    const res = await request(app).post('/v1/auth/login').send({ email: 'c@example.com', password: 'correct-horse' });
    expect(res.status).toBe(200);
    expect(typeof res.body.access_token).toBe('string');
  });
});

describe('login throttling', () => {
  it('blocks the 4th failed attempt within 10 minutes', async () => {
    db.signInOk = false;
    const ip = '203.0.113.77';
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      // supertest connects from 127.0.0.1; vary nothing else so the key is stable
      codes.push((await request(app).post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: 'x@example.com', password: 'wrong-password' })).status);
    }
    expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codes[3]).toBe(429);
  });
});

describe('client IP behind Cloudflare', () => {
  const fake = (ip: string, cf?: string) => ({ ip, header: (h: string) => (h.toLowerCase() === 'cf-connecting-ip' ? cf : undefined) }) as unknown as Request;
  it('trusts CF-Connecting-IP only from a Cloudflare hop', () => {
    expect(isCloudflareIp('172.68.1.1')).toBe(true);
    expect(isCloudflareIp('8.8.8.8')).toBe(false);
    expect(clientIp(fake('172.68.1.1', '41.90.1.2'))).toBe('41.90.1.2');
    expect(clientIp(fake('8.8.8.8', '41.90.1.2'))).toBe('8.8.8.8');
    expect(clientIp(fake('::ffff:41.90.1.3'))).toBe('41.90.1.3');
  });
});

describe('CORS', () => {
  it('refuses a foreign origin without a 500', async () => {
    const res = await request(app).options('/v1/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBeLessThan(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
