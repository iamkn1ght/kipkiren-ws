import { signAccessToken } from '../src/lib/tokens.js';
import type { UserRole } from '../src/middleware/auth.js';

export function mintTestToken(role: UserRole, opts: { sub?: string; clientId?: string } = {}): string {
  return signAccessToken({
    sub: opts.sub ?? '00000000-0000-0000-0000-000000000001',
    role,
    ...(opts.clientId ? { client_id: opts.clientId } : {}),
  });
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
