/**
 * Payment gateway adapters.
 *
 * Two rails (architecture doc §8):
 *   - M-Pesa via Kipkiren Pay (LipaPlus). ADR-KWS-005 — never call Daraja
 *     directly. Kipkiren Pay handles STK push initiation; we call its
 *     internal API and receive a webhook callback at /v1/webhooks/mpesa.
 *   - Card via Paystack. We hand off to Paystack's hosted page (no raw card
 *     data ever touches KWS) and receive a webhook at /v1/webhooks/paystack.
 *
 * Both adapters are interface-shaped so tests inject fakes — production
 * wires the real HTTP clients in initiateApprovalPayment().
 */

import { loadEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface StkPushInitInput {
  phone_msisdn: string;          // 2547XXXXXXXX or 0722XXXXXX — gateway normalises
  amount_kes: number;
  account_reference: string;     // proforma ref e.g. KWS-042
  description: string;
  callback_url: string;
  idempotency_key: string;
}

export interface StkPushInitResult {
  gateway_ref: string;
  status: 'pending';
}

export interface KipkirenPayClient {
  initiateStkPush(input: StkPushInitInput): Promise<StkPushInitResult>;
}

export interface PaystackInitInput {
  email: string;
  amount_kes: number;
  reference: string;             // proforma ref
  callback_url: string;
  metadata: Record<string, unknown>;
}

export interface PaystackInitResult {
  authorization_url: string;
  reference: string;
  access_code: string;
}

export interface PaystackClient {
  initialize(input: PaystackInitInput): Promise<PaystackInitResult>;
}

// ---------------------------------------------------------------------------
// Real-client wiring (lazy — tests bypass this entirely)
// ---------------------------------------------------------------------------

let realKipkirenPay: KipkirenPayClient | null = null;
export function getKipkirenPayClient(): KipkirenPayClient {
  if (realKipkirenPay) return realKipkirenPay;
  const env = loadEnv();
  realKipkirenPay = {
    async initiateStkPush(input) {
      const res = await fetch(`${env.KIPKIREN_PAY_BASE_URL}/lipaplus/stk/init`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.KIPKIREN_PAY_API_KEY}`,
          'idempotency-key': input.idempotency_key,
        },
        body: JSON.stringify({
          msisdn: input.phone_msisdn,
          amount: input.amount_kes,
          account_reference: input.account_reference,
          description: input.description,
          callback_url: input.callback_url,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        logger.error({ status: res.status, body: text }, 'kipkiren_pay_init_failed');
        throw new Error('kipkiren_pay_init_failed');
      }
      const json = (await res.json()) as { gateway_ref?: string };
      if (!json.gateway_ref) throw new Error('kipkiren_pay_no_ref');
      return { gateway_ref: json.gateway_ref, status: 'pending' };
    },
  };
  return realKipkirenPay;
}

let realPaystack: PaystackClient | null = null;
export function getPaystackClient(): PaystackClient {
  if (realPaystack) return realPaystack;
  const env = loadEnv();
  realPaystack = {
    async initialize(input) {
      const res = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        },
        body: JSON.stringify({
          email: input.email,
          // Paystack denominates in subunits — KES has no subunits but the
          // API still expects ×100. Paystack accepts integer KES this way.
          amount: input.amount_kes * 100,
          currency: 'KES',
          reference: input.reference,
          callback_url: input.callback_url,
          metadata: input.metadata,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        logger.error({ status: res.status, body: text }, 'paystack_init_failed');
        throw new Error('paystack_init_failed');
      }
      const json = (await res.json()) as {
        status?: boolean;
        data?: { authorization_url?: string; access_code?: string; reference?: string };
      };
      if (!json.status || !json.data?.authorization_url || !json.data.access_code || !json.data.reference) {
        throw new Error('paystack_init_malformed');
      }
      return {
        authorization_url: json.data.authorization_url,
        reference: json.data.reference,
        access_code: json.data.access_code,
      };
    },
  };
  return realPaystack;
}
