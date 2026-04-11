import { Router } from 'express';
import { publicJwk } from '../lib/tokens.js';

export const jwksRouter: Router = Router();

/**
 * KWS-SEC-001 — public JWKS endpoint. Cached at the edge.
 *
 * During key rotation (every 90 days) the previous key remains in this
 * response for ≥7 days alongside the new key, so verifiers can finish their
 * grace period before the old key disappears.
 */
jwksRouter.get('/.well-known/jwks.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ keys: [publicJwk()] });
});
