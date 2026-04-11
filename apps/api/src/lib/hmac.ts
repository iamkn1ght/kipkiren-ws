import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC verification helpers for payment webhooks.
 *
 * Both Kipkiren Pay and Paystack sign the raw request body. We compare with
 * `timingSafeEqual` to avoid leaking signature length / content via response
 * timing. Inputs that differ in length compare false without comparison.
 */

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * KWS-SEC-003 — Kipkiren Pay (LipaPlus) webhook signature.
 * Algorithm: HMAC-SHA256 hex of raw body, secret = KIPKIREN_PAY_HMAC_SECRET.
 */
export function verifyKipkirenPaySignature(
  rawBody: string,
  headerSignature: string | undefined,
  secret: string,
): boolean {
  if (!headerSignature) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return constantTimeEquals(expected, headerSignature.trim());
}

/**
 * KWS-SEC-006 — Paystack webhook signature.
 * Algorithm: HMAC-SHA512 hex of raw body, secret = PAYSTACK_SECRET_KEY.
 * (Paystack documents this header as `x-paystack-signature`.)
 */
export function verifyPaystackSignature(
  rawBody: string,
  headerSignature: string | undefined,
  secret: string,
): boolean {
  if (!headerSignature) return false;
  const expected = createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
  return constantTimeEquals(expected, headerSignature.trim());
}
