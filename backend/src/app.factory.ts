import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { AppConfig } from './config/config';
import { sessionMiddleware } from './session/session.middleware';

export async function createApplication(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(config), {
    bodyParser: false,
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  const expressInstance = app.getHttpAdapter().getInstance() as Express;
  expressInstance.set('trust proxy', config.trustProxy);

  app.use(cookieParser(config.cookieSecret));
  app.use(sessionMiddleware(config));
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.enableShutdownHooks();

  return app;
}
