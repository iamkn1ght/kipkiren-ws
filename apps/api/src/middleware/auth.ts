import type { Request, Response, NextFunction } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { loadEnv } from '../config/env.js';

export type UserRole = 'client' | 'delivery_lead' | 'technical_delivery' | 'admin';

export interface AuthContext {
  sub: string;
  role: UserRole;
  clientId?: string;
  rawToken: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const ALLOWED_ALGS = ['RS256'] as const;

/**
 * KWS-SEC-001 — verify access tokens with RS256 only.
 * HS256 is rejected by jsonwebtoken because we pass `algorithms: ['RS256']`.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const env = loadEnv();
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_bearer_token' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, env.jwtPublicKey, {
      algorithms: [...ALLOWED_ALGS],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as JwtPayload & { role?: UserRole; client_id?: string };

    if (!decoded.sub || !decoded.role) {
      res.status(401).json({ error: 'malformed_token' });
      return;
    }

    req.auth = {
      sub: decoded.sub,
      role: decoded.role,
      ...(decoded.client_id ? { clientId: decoded.client_id } : {}),
      rawToken: token,
    };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

/**
 * KWS-SEC-007 — role enforcement at the API layer (not just UI).
 * Kamau (`technical_delivery`) MUST never reach client-data, admin, or proforma
 * review/approve endpoints. Test suite verifies a Kamau JWT returns 403 here.
 */
export function requireRole(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    if (!allowed.includes(req.auth.role)) {
      res.status(403).json({ error: 'forbidden_role', required: allowed });
      return;
    }
    next();
  };
}
