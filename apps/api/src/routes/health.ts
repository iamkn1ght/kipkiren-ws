import { Router } from 'express';

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'kws-api', ts: new Date().toISOString() });
});
