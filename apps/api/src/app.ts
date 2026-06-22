import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { loadEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { healthRouter } from './routes/health.js';
import { jwksRouter } from './routes/jwks.js';
import { authRouter } from './routes/auth.js';
import { ticketsRouter } from './routes/tickets.js';
import { proformasRouter } from './routes/proformas.js';
import { webhooksRouter } from './routes/webhooks.js';
import { invoicesRouter } from './routes/invoices.js';
import { adminRouter } from './routes/admin.js';
import { tasksRouter } from './routes/tasks.js';
import { servicesRouter } from './routes/services.js';
import { dnsRouter } from './routes/dns.js';
import { onboardingRouter } from './routes/onboarding.js';
import { errorHandler, notFound } from './middleware/error.js';

/**
 * Build the Express app. No `listen` here - `index.ts` binds the port,
 * `test/*.test.ts` imports this directly into supertest.
 */
export function buildApp(): Express {
  const env = loadEnv();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (env.allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('cors_origin_not_allowed'));
      },
      credentials: true,
    }),
  );
  // Capture the raw body buffer on JSON parse so webhook handlers can verify
  // HMAC signatures over the EXACT bytes the gateway signed. Mutating the
  // parsed object before signing would change the bytes and break verification.
  app.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody: string }).rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  // Public
  app.use('/v1', healthRouter);
  app.use('/v1', jwksRouter);
  app.use('/v1/auth', authRouter);

  // ----------------------------------------------------------------------
  // S2 + S3 + S4 - real handlers
  // ----------------------------------------------------------------------
  app.use('/v1/tickets', ticketsRouter);
  app.use('/v1/proformas', proformasRouter);
  app.use('/v1/webhooks', webhooksRouter);
  app.use('/v1/invoices', invoicesRouter);
  app.use('/v1/admin', adminRouter);
  app.use('/v1/tasks', tasksRouter);
  app.use('/v1/services', servicesRouter);
  app.use('/v1/dns', dnsRouter);
  app.use('/v1/onboarding', onboardingRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
