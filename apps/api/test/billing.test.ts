/**
 * Pure-math tests for the locked billing pipeline.
 * No env, no DB. Pins the formula from kws_reboot_pack_v1.md §5.
 */

import { describe, expect, it } from 'vitest';
import {
  priceProforma,
  priceLineSubtotal,
  canonicalProformaPayload,
  VAT_RATE,
} from '@kws/shared';

describe('priceLineSubtotal — ceiling rounding', () => {
  it('1.0 hours × KES 3500 = 3500', () => {
    expect(priceLineSubtotal({ base_rate_kes_per_hour: 3500, hours: 1 })).toBe(3500);
  });
  it('rounds up fractional hours, never floors', () => {
    expect(priceLineSubtotal({ base_rate_kes_per_hour: 3500, hours: 1.33 })).toBe(4655);
    expect(priceLineSubtotal({ base_rate_kes_per_hour: 333, hours: 0.1 })).toBe(34);
  });
});

describe('priceProforma — order of operations matches the locked spec', () => {
  it('Starter / standard urgency / no discount → just adds VAT', () => {
    const r = priceProforma({ subtotal_kes: 10_000, urgency: 'standard', plan: 'Starter' });
    expect(r.pre_discount_kes).toBe(10_000);
    expect(r.discount_kes).toBe(0);
    expect(r.taxable_kes).toBe(10_000);
    expect(r.vat_kes).toBe(Math.ceil(10_000 * VAT_RATE));
    expect(r.total_kes).toBe(10_000 + r.vat_kes);
  });

  it('Growth / urgent (1.5×) / 10% discount / +16% VAT', () => {
    const r = priceProforma({ subtotal_kes: 10_000, urgency: 'urgent', plan: 'Growth' });
    // 10000 × 1.5 = 15000 → -10% = 13500 → +16% VAT = 13500 + 2160 = 15660
    expect(r.pre_discount_kes).toBe(15_000);
    expect(r.discount_kes).toBe(1_500);
    expect(r.taxable_kes).toBe(13_500);
    expect(r.vat_kes).toBe(2_160);
    expect(r.total_kes).toBe(15_660);
  });

  it('Business / elevated (1.25×) / 15% discount', () => {
    const r = priceProforma({ subtotal_kes: 10_000, urgency: 'elevated', plan: 'Business' });
    // 10000 × 1.25 = 12500 → -15% = 10625 → +16% VAT 1700 = 12325
    expect(r.pre_discount_kes).toBe(12_500);
    expect(r.discount_kes).toBe(1_875);
    expect(r.taxable_kes).toBe(10_625);
    expect(r.vat_kes).toBe(1_700);
    expect(r.total_kes).toBe(12_325);
  });

  it('Enterprise honours the negotiated discount param', () => {
    const r = priceProforma({
      subtotal_kes: 10_000,
      urgency: 'standard',
      plan: 'Enterprise',
      enterprise_discount_pct: 25,
    });
    expect(r.discount_kes).toBe(2_500);
    expect(r.taxable_kes).toBe(7_500);
    expect(r.vat_kes).toBe(1_200);
    expect(r.total_kes).toBe(8_700);
  });
});

describe('canonicalProformaPayload — deterministic content-hash input', () => {
  it('produces identical output regardless of input order', () => {
    const a = canonicalProformaPayload([
      { task_name: 'B task', amount_kes: 200, position: 1 },
      { task_name: 'A task', amount_kes: 100, position: 0 },
    ]);
    const b = canonicalProformaPayload([
      { task_name: 'A task', amount_kes: 100, position: 0 },
      { task_name: 'B task', amount_kes: 200, position: 1 },
    ]);
    expect(a).toBe(b);
    expect(a).toBe('A task\t100\nB task\t200');
  });

  it('changes when an amount changes (KWS-SEC-004 tamper detection)', () => {
    const original = canonicalProformaPayload([{ task_name: 'X', amount_kes: 100 }]);
    const tampered = canonicalProformaPayload([{ task_name: 'X', amount_kes: 101 }]);
    expect(original).not.toBe(tampered);
  });
});
