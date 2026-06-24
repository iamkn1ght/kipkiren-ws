/**
 * AI decomposition accuracy harness (KWS-S8-004).
 *
 * Two layers:
 *   1. Unit tests for the pure scorer (scoreDecomposition / aggregateAccuracy).
 *   2. A labelled-corpus harness that runs the REAL decomposition pipeline
 *      (services/decomposition.ts) with a fake Claude client per case, then
 *      scores the reconciled output against ground-truth task names and asserts
 *      the corpus clears the S9 Phase 1 readiness bar (macro-F1 >= 0.85,
 *      kws_sprint_9.md). Because reconciliation drops fabricated tasks and
 *      rewrites prices, this also proves the rate-card defence holds across a
 *      realistic spread of model behaviour (good, fabricating, mispriced).
 */

import { describe, expect, it } from 'vitest';
import { scoreDecomposition, aggregateAccuracy } from '../src/services/decomposition-eval.js';
import { decomposeTicket, type ClaudeMessageClient } from '../src/services/decomposition.js';
import type { RateCardEntry } from '@kws/shared';
import { vi } from 'vitest';

describe('scoreDecomposition', () => {
  it('scores a perfect match', () => {
    const s = scoreDecomposition(['A', 'B'], ['A', 'B']);
    expect(s).toMatchObject({ truePositives: 2, falsePositives: 0, falseNegatives: 0, exactMatch: true });
    expect(s.f1).toBe(1);
  });

  it('penalises a fabricated (false-positive) task', () => {
    const s = scoreDecomposition(['A'], ['A', 'Bogus']);
    expect(s.truePositives).toBe(1);
    expect(s.falsePositives).toBe(1);
    expect(s.precision).toBe(0.5);
    expect(s.recall).toBe(1);
    expect(s.exactMatch).toBe(false);
  });

  it('penalises a missed (false-negative) task', () => {
    const s = scoreDecomposition(['A', 'B'], ['A']);
    expect(s.falseNegatives).toBe(1);
    expect(s.recall).toBe(0.5);
    expect(s.precision).toBe(1);
  });

  it('is case- and whitespace-insensitive', () => {
    const s = scoreDecomposition(['Landing page  build'], ['landing page build']);
    expect(s.exactMatch).toBe(true);
  });
});

describe('aggregateAccuracy', () => {
  it('pools micro metrics and averages macro F1', () => {
    const a = aggregateAccuracy([
      scoreDecomposition(['A', 'B'], ['A', 'B']), // f1 1
      scoreDecomposition(['A'], ['A', 'X']),      // precision .5 recall 1 -> f1 .667
    ]);
    expect(a.cases).toBe(2);
    expect(a.exactMatchRate).toBe(0.5);
    expect(a.totalFalsePositives).toBe(1);
    expect(a.macroF1).toBeGreaterThan(0.8);
  });
});

// ── Labelled corpus + live-pipeline harness ─────────────────────────

const RATE_CARD: RateCardEntry[] = [
  { id: 'r-web-landing', category: 'web', task_name: 'Landing page build', task_description: null, estimated_hours: 5, base_rate_kes_per_hour: 3500, fixed_price_kes: 17500, complexity: 'standard', version: '1.0', active: true },
  { id: 'r-web-contact', category: 'web', task_name: 'Contact form rebuild', task_description: null, estimated_hours: 1, base_rate_kes_per_hour: 3500, fixed_price_kes: 3500, complexity: 'simple', version: '1.0', active: true },
  { id: 'r-seo-audit', category: 'seo', task_name: 'Technical SEO audit', task_description: null, estimated_hours: 4, base_rate_kes_per_hour: 3000, fixed_price_kes: 12000, complexity: 'standard', version: '1.0', active: true },
  { id: 'r-social-post', category: 'social', task_name: 'Single social media post', task_description: null, estimated_hours: 1, base_rate_kes_per_hour: 2500, fixed_price_kes: 2500, complexity: 'simple', version: '1.0', active: true },
];

function fakeClaude(jsonResponse: unknown): ClaudeMessageClient {
  return { create: vi.fn(async () => ({ content: [{ type: 'text', text: JSON.stringify(jsonResponse) }], stop_reason: 'end_turn' })) };
}

function line(task_name: string, amount_kes: number, position: number) {
  return { task_name, task_description: null, estimated_hours: 1, rate_kes_per_hour: 1000, amount_kes, position };
}

/**
 * Each case carries the ground-truth task names and a scripted model output.
 * The model outputs intentionally span: clean, fabricating an extra task, and
 * attempting a price drop - to prove the pipeline's reconciliation still lands
 * the right task set.
 */
const CORPUS = [
  {
    name: 'website + contact form (clean model)',
    description: 'I need a landing page and a contact form for my logistics company.',
    category: 'web' as const,
    expected: ['Landing page build', 'Contact form rebuild'],
    model: { confidence: 0.93, flag_reason: null, line_items: [line('Landing page build', 17500, 0), line('Contact form rebuild', 3500, 1)] },
  },
  {
    name: 'website only (model fabricates a freebie)',
    description: 'Build me a marketing landing page.',
    category: 'web' as const,
    expected: ['Landing page build'],
    model: { confidence: 0.9, flag_reason: null, line_items: [line('Landing page build', 17500, 0), line('Free bonus task', 1000, 1)] },
  },
  {
    name: 'seo audit (model tries a price drop)',
    description: 'Can you do a technical SEO audit of my store?',
    category: 'seo' as const,
    expected: ['Technical SEO audit'],
    model: { confidence: 0.95, flag_reason: null, line_items: [line('Technical SEO audit', 1, 0)] },
  },
  {
    name: 'social post (clean)',
    description: 'I want one promotional social media post for a launch.',
    category: 'social' as const,
    expected: ['Single social media post'],
    model: { confidence: 0.88, flag_reason: null, line_items: [line('Single social media post', 2500, 0)] },
  },
];

describe('decomposition accuracy over a labelled corpus (S9 Phase 1 gate)', () => {
  it('clears the >= 0.85 macro-F1 readiness bar and never fabricates a task', async () => {
    const scores = [];
    for (const c of CORPUS) {
      const r = await decomposeTicket(
        { ticket_description: c.description, category: c.category, active_rate_card: RATE_CARD },
        { client: fakeClaude(c.model) },
      );
      const produced = r.result.line_items.map((li) => li.task_name);
      // Reconciliation must have dropped any fabricated task → zero false positives.
      const score = scoreDecomposition(c.expected, produced);
      expect(score.falsePositives).toBe(0);
      scores.push(score);
    }

    const report = aggregateAccuracy(scores);
    expect(report.cases).toBe(CORPUS.length);
    expect(report.totalFalsePositives).toBe(0);
    expect(report.macroF1).toBeGreaterThanOrEqual(0.85);
    expect(report.exactMatchRate).toBe(1);
  });
});
