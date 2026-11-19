import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../helpers/create-test-app';

interface OpenApiDocument {
  openapi: string;
  paths: Record<string, unknown>;
}

describe('OpenAPI documentation', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the generated OpenAPI document', async () => {
    const response = await request(server).get('/api/docs-json').expect(200);
    const document = response.body as OpenApiDocument;

    expect(document.openapi).toBe('3.0.3');
    expect(document.paths).toEqual(
      expect.objectContaining({
        '/api/health': expect.any(Object),
        '/api/flights': expect.any(Object),
        '/api/flights/{id}/seats/{seatId}/hold': expect.any(Object),
        '/api/bookings': expect.any(Object),
        '/api/admin/flights/{id}/status': expect.any(Object),
      }),
    );
  });

  it('serves Swagger UI with the docs-only CSP override', async () => {
    const response = await request(server).get('/api/docs/').expect(200);

    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.headers['content-security-policy']).toContain("'unsafe-inline'");
  });

  it('can be disabled with SWAGGER_ENABLED=false', async () => {
    const disabled = await createTestApp({ swaggerEnabled: false });
    const disabledServer = disabled.app.getHttpServer() as Server;

    await request(disabledServer).get('/api/docs-json').expect(404);
    await disabled.app.close();
  });
});
