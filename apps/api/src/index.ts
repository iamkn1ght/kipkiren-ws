import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { startBillingScheduler } from './services/billing.js';

const env = loadEnv();
const app = buildApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'kws-api listening');
  // monthly care invoices (idempotent; a minute after boot, then every 6h)
  startBillingScheduler();
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
