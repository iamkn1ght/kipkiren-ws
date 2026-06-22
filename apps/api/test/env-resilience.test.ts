/**
 * Regression guard - a blank NODE_ENV must NOT crash the service.
 *
 * Production incident (16 Jun 2026): Railway presented NODE_ENV as an empty
 * string. Zod's .default() only fills `undefined`, so "" failed the enum and
 * the container crash-looped on boot. env.ts now treats empty strings as unset.
 */

import { describe, expect, it, vi } from 'vitest';

describe('env - blank enum vars fall back to defaults', () => {
  it('NODE_ENV="" loads as development instead of throwing', async () => {
    vi.resetModules();
    const prevNode = process.env.NODE_ENV;
    const prevLog = process.env.LOG_LEVEL;
    process.env.NODE_ENV = '';
    process.env.LOG_LEVEL = '';
    try {
      const env = await import('../src/config/env.js');
      const loaded = env.loadEnv();
      expect(loaded.NODE_ENV).toBe('development');
      expect(loaded.LOG_LEVEL).toBe('info');
    } finally {
      if (prevNode !== undefined) process.env.NODE_ENV = prevNode;
      if (prevLog !== undefined) process.env.LOG_LEVEL = prevLog;
      vi.resetModules();
    }
  });
});
