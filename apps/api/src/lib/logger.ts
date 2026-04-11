import pino from 'pino';
import { loadEnv } from '../config/env.js';

const env = (() => {
  try {
    return loadEnv();
  } catch {
    return null;
  }
})();

export const logger = pino({
  level: env?.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.refresh_token',
      '*.api_key',
      '*.hmac_secret',
    ],
    censor: '[REDACTED]',
  },
});
