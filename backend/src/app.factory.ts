import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { AppConfig } from './config/config';
import { buildOpenApiDocument } from './openapi/openapi';
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

  if (config.swaggerEnabled) {
    // Swagger UI ships an inline bootstrap script; keep the stricter helmet CSP
    // for the API and allow inline scripts/styles only on the docs routes.
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (request.path.startsWith('/api/docs')) {
        response.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'",
        );
      }
      next();
    });

    // openapi3-ts and @nestjs/swagger model the same OpenAPI 3 object with
    // separate declarations; the runtime shape is identical.
    const document = buildOpenApiDocument(config.appVersion) as unknown as OpenAPIObject;

    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      customSiteTitle: 'Flight Booking API',
    });
  }

  app.enableShutdownHooks();

  return app;
}
