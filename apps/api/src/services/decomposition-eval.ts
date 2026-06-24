/**
 * AI decomposition accuracy scoring (KWS-S8-004).
 *
 * The decomposition engine (services/decomposition.ts) reconciles the model's
 * proposed line items against the rate card. This module scores how well a
 * produced decomposition matches a known-good (ground-truth) set of task
 * names, so we can measure precision / recall / F1 across a labelled corpus.
 *
 * It gates the S9 Phase 1 -> Phase 2 readiness check: kws_sprint_9.md requires
 * decomposition accuracy >= 0.85 before autonomous execution is considered.
 *
 * Pure functions only - no I/O. The labelled corpus + the live pipeline run
 * live in test/decomposition-accuracy.test.ts, which feeds produced task names
 * here. Keeping the scorer here (not in the test) makes it reusable by a future
 * admin "decomposition quality" report.
 */

/** Normalise a task name for set comparison: trim + collapse space + lowercase. */
function norm(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface CaseScore {
  truePositives: number;   // produced tasks that were expected
  falsePositives: number;  // produced tasks that were NOT expected (fabrication)
  falseNegatives: number;  // expected tasks the model missed
  precision: number;       // tp / (tp + fp)
  recall: number;          // tp / (tp + fn)
  f1: number;
  exactMatch: boolean;     // produced set === expected set
}

/**
 * Score a single decomposition against its ground-truth task names. Duplicate
 * names within a list are de-duplicated (a decomposition is a set of tasks).
 */
export function scoreDecomposition(expected: string[], produced: string[]): CaseScore {
  const exp = new Set(expected.map(norm));
  const prod = new Set(produced.map(norm));

  let tp = 0;
  let fp = 0;
  for (const p of prod) {
    if (exp.has(p)) tp += 1;
    else fp += 1;
  }
  let fn = 0;
  for (const e of exp) {
    if (!prod.has(e)) fn += 1;
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const exactMatch = fp === 0 && fn === 0;

  return { truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall, f1, exactMatch };
}

export interface AccuracyReport {
  cases: number;
  exactMatchRate: number;        // fraction of cases with a perfect set match
  microPrecision: number;        // pooled over all tasks
  microRecall: number;
  microF1: number;
  macroF1: number;               // mean of per-case F1
  totalTruePositives: number;
  totalFalsePositives: number;
  totalFalseNegatives: number;
}

/**
 * Aggregate per-case scores into a corpus-level accuracy report. Micro metrics
 * pool the raw tp/fp/fn counts (weights larger decompositions more); macro F1
 * averages the per-case F1 (weights each ticket equally).
 */
export function aggregateAccuracy(scores: CaseScore[]): AccuracyReport {
  const n = scores.length;
  if (n === 0) {
    return {
      cases: 0, exactMatchRate: 1, microPrecision: 1, microRecall: 1, microF1: 1, macroF1: 1,
      totalTruePositives: 0, totalFalsePositives: 0, totalFalseNegatives: 0,
    };
  }
  let tp = 0, fp = 0, fn = 0, exact = 0, f1Sum = 0;
  for (const s of scores) {
    tp += s.truePositives;
    fp += s.falsePositives;
    fn += s.falseNegatives;
    if (s.exactMatch) exact += 1;
    f1Sum += s.f1;
  }
  const microPrecision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const microRecall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const microF1 = microPrecision + microRecall === 0 ? 0 : (2 * microPrecision * microRecall) / (microPrecision + microRecall);

  return {
    cases: n,
    exactMatchRate: exact / n,
    microPrecision,
    microRecall,
    microF1,
    macroF1: f1Sum / n,
    totalTruePositives: tp,
    totalFalsePositives: fp,
    totalFalseNegatives: fn,
  };
}
