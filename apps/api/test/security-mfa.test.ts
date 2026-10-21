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
  emailOk: true,
  lastCode: '' as string,
  lastTo: '' as string,
}));

// Capture the emailed code instead of sending it.
vi.mock('../src/services/email.js', async (orig) => ({
  ...(await orig<typeof import('../src/services/email.js')>()),
  sendEmail: vi.fn(async (i: { to: string; variables: Record<string, string> }) => {
    db.lastCode = i.variables.code ?? '';
    db.lastTo = i.to;
    return db.emailOk ? { status: 'sent', provider_ref: 't' } : { status: 'failed', error: 'x' };
  }),
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
      auth: { signInWithPassword: async () => (db.signInOk ? { data: { user: { id: 'u-admin', email: 'admin@example.com' } }, error: null } : { data: null, error: { message: 'bad' } }) },
    }),
  };
});

const { buildApp } = await import('../src/app.js');
const { signMfaToken, verifyMfaToken, signAccessToken } = await import('../src/lib/tokens.js');
const { maskEmail } = await import('../src/services/mfa.js');
const { clientIp, isCloudflareIp } = await import('../src/lib/client-ip.js');

const app = buildApp();

beforeEach(() => {
  db.writes = [];
  db.signInOk = true;
  db.emailOk = true;
  db.lastCode = '';
  db.tables = { users: { id: 'u-admin', role: 'admin', client_id: null, email: 'admin@example.com' } };
});

describe('two-factor step token', () => {
  it('is not usable as a session, and a session is not usable as an mfa token', async () => {
    const mfa = signMfaToken('u-admin', { ch: 'h', n: 'n' });
    expect(verifyMfaToken(mfa)?.sub).toBe('u-admin');
    const res = await request(app).get('/v1/admin/billing').set('Authorization', `Bearer ${mfa}`);
    expect(res.status).toBe(401);
    expect(verifyMfaToken(signAccessToken({ sub: 'u-admin', role: 'admin' }))).toBeNull();
    expect(verifyMfaToken('garbage.token.value')).toBeNull();
  });
});

describe('staff login requires an emailed code', () => {
  const login = () => request(app).post('/v1/auth/login').send({ email: 'admin@example.com', password: 'correct-horse' });
  it('emails a code and returns a step token, not a session', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mfa_required: true, sent_to: 'ad***@example.com' });
    expect(res.body.access_token).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(db.lastTo).toBe('admin@example.com');
    expect(db.lastCode).toMatch(/^\d{6}$/);
    // the code itself never appears in the token
    expect(JSON.stringify(verifyMfaToken(res.body.mfa_token))).not.toContain(db.lastCode);
  });
  it('the right code signs in once; a wrong code and a replay do not', async () => {
    const { body } = await login();
    const wrong = db.lastCode === '000000' ? '111111' : '000000';
    expect((await request(app).post('/v1/auth/mfa/verify').send({ mfa_token: body.mfa_token, code: wrong })).status).toBe(401);
    const ok = await request(app).post('/v1/auth/mfa/verify').send({ mfa_token: body.mfa_token, code: db.lastCode });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.access_token).toBe('string');
    const again = await request(app).post('/v1/auth/mfa/verify').send({ mfa_token: body.mfa_token, code: db.lastCode });
    expect(again.status).toBe(401);
    expect(again.body.error).toBe('code_used');
  });
  it('a code from one login does not work with another login token', async () => {
    const first = await login(); const code1 = db.lastCode;
    const second = await login();
    if (code1 !== db.lastCode) {
      expect((await request(app).post('/v1/auth/mfa/verify').send({ mfa_token: second.body.mfa_token, code: code1 })).status).toBe(401);
    }
    expect(first.body.mfa_token).not.toBe(second.body.mfa_token);
  });
  it('fails closed when the email cannot be sent', async () => {
    db.emailOk = false;
    const res = await login();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('code_send_failed');
    expect(res.body.access_token).toBeUndefined();
  });
  it('clients skip the code', async () => {
    db.tables.users = { id: 'u-admin', role: 'client', client_id: 'c1' };
    const res = await request(app).post('/v1/auth/login').send({ email: 'c@example.com', password: 'correct-horse' });
    expect(res.status).toBe(200);
    expect(typeof res.body.access_token).toBe('string');
  });
  it('masks the address it reports', () => {
    expect(maskEmail('admin@kipkiren.co.ke')).toBe('ad***@kipkiren.co.ke');
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
