/**
 * KWS-SEC-005 — prompt injection defence (layer 1).
 *
 * The AI Decomposition Service accepts plain-language ticket text from
 * clients and forwards it to the Claude API. A client could craft a
 * description that tries to overrule the system prompt, alter rate-card
 * pricing, or coerce the model into emitting attacker-controlled JSON.
 *
 * Defence layers (architecture doc §9 KWS-SEC-005):
 *   1. sanitiseTicketDescription() — this file. Strips known injection
 *      patterns BEFORE the text reaches the Claude API call.
 *   2. System prompt explicitly forbids inventing tasks not in the rate
 *      card and demands JSON-only output (services/decomposition.ts).
 *   3. Zod schema validation rejects any model output that doesn't match
 *      AIDecompositionResult exactly.
 *   4. Amara reviews every proforma before dispatch (ADR-KWS-002).
 *
 * Layer 1 is intentionally aggressive: false positives in the sanitiser
 * just mean Amara sees a slightly noisier description, which is fine.
 * False negatives mean a possible price manipulation, which is not.
 *
 * The sanitiser does NOT try to be clever. It applies a fixed pattern set
 * and replaces matches with a [REDACTED] marker so Amara still sees what
 * was attempted.
 */

const REDACT_MARKER = '[REDACTED]';

/**
 * Patterns we strip outright. Each one is a regex that runs in
 * case-insensitive multiline mode. Order doesn't matter — every pattern
 * runs against the buffer.
 *
 * If you add a pattern, also add a test case in test/sanitise.test.ts.
 */
const INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
  // direct override attempts
  /\bignore (all |any |the |previous |above |prior )*instructions?\b[^\n]*/gi,
  /\bdisregard (all |any |the |previous |above |prior )*instructions?\b[^\n]*/gi,
  /\bforget (all |any |the |previous |above |prior )*instructions?\b[^\n]*/gi,
  /\boverride (all |any |the |previous |above |prior )*(instructions?|prompt|system|rules?)\b[^\n]*/gi,
  /\bdo not (follow|obey|respect)( the)?( previous| above)? instructions?\b[^\n]*/gi,

  // role / persona hijack
  /\b(you are now|act as|pretend to be|roleplay as|behave as)\b[^\n]*/gi,
  /\bnew (system )?(prompt|instructions|rules?)\b[^\n]*/gi,
  /\b(system|developer|assistant)\s*[:>]\s*[^\n]*/gi,

  // markdown / xml fences that try to inject a fake "system" turn
  /^```(?:system|assistant|developer|user)[\s\S]*?```/gim,
  /<\s*\/?\s*(system|assistant|developer|user)\s*>/gi,
  /\[\s*(system|assistant|developer|user)\s*\][\s\S]{0,500}/gi,

  // rate-card manipulation
  /\b(set|change|update|modify|alter|override)\s+(the\s+)?(rate|rate[- ]?card|price|prices|amount|cost)s?\b[^\n]*/gi,
  /\b(rate[- ]?card|prices?|amounts?|costs?)\s*(=|:|to|→|->)\s*[^\n]*/gi,
  /\bKES\s*0+\b/gi,
  /\bfree of charge\b/gi,
  /\bzero (rated|cost|price)\b/gi,

  // structural escape
  /<\|.*?\|>/g,
  /\bBEGIN(\s+OF)?\s+(SYSTEM|PROMPT|INSTRUCTIONS?)\b[^\n]*/gi,
  /\bEND(\s+OF)?\s+(SYSTEM|PROMPT|INSTRUCTIONS?)\b[^\n]*/gi,

  // tool/function call injection
  /<\s*(tool_use|function_call|tool_call)\b[^>]*>/gi,
  /\bcall (the )?function\b[^\n]*/gi,
];

const MAX_LENGTH = 4000;

export interface SanitiseResult {
  /** The text that is safe to send to the model. */
  cleaned: string;
  /** True if any pattern matched — used for telemetry and Amara flagging. */
  redacted: boolean;
  /** Number of distinct pattern matches stripped. */
  match_count: number;
  /** Original length, after trim, before redaction. */
  original_length: number;
}

/**
 * Sanitise a client-supplied ticket description before it reaches the
 * Claude API. Returns the cleaned text and a flag indicating whether
 * anything was redacted (so the AI Review tab can warn Amara).
 *
 * This function is pure and synchronous — no I/O, no side effects.
 */
export function sanitiseTicketDescription(input: string): SanitiseResult {
  if (typeof input !== 'string') {
    return { cleaned: '', redacted: false, match_count: 0, original_length: 0 };
  }

  // Normalise whitespace + zero-width characters that smuggle past regexes.
  let buf = input
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')   // zero-width / bidi
    .replace(/\r\n?/g, '\n')
    .trim();

  const original_length = buf.length;

  // Hard cap. Any client sending >4000 chars is either pasting noise or
  // trying to bury an injection in a wall of text.
  if (buf.length > MAX_LENGTH) {
    buf = buf.slice(0, MAX_LENGTH);
  }

  let match_count = 0;
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    const before = buf;
    buf = buf.replace(pattern, () => {
      match_count += 1;
      return REDACT_MARKER;
    });
    if (buf !== before) {
      // No-op — already counted via callback.
    }
  }

  // Collapse runs of [REDACTED] markers.
  buf = buf.replace(/(\[REDACTED\]\s*){2,}/g, '[REDACTED] ');

  // Final whitespace cleanup.
  buf = buf.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return {
    cleaned: buf,
    redacted: match_count > 0,
    match_count,
    original_length,
  };
}
