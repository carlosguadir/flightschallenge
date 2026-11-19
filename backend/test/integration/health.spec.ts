import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

describe('health check', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the database and realtime gateway as ready', async () => {
    const response = await request(server).get('/api/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      db: 'up',
      realtime: 'up',
    });
  });
});
