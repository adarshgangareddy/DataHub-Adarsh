import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config, corsOrigins } from './config.js';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requireCsrfHeader } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Requested-With'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.use('/api', apiLimiter, requireCsrfHeader, routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
