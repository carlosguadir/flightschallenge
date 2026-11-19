import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import {
  PRIMARY_TEST_FLIGHT,
  PRIMARY_TEST_SEAT,
  seedFlightId,
  seedSeatId,
} from '../../src/database/seed';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

describe('10.17 rate limit', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp({
      throttleEnabled: true,
      throttleLimit: 2,
      throttleTtlSeconds: 60,
    });
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 on the third hold request with THROTTLE_LIMIT=2', async () => {
    const agent = request.agent(app.getHttpServer() as Server);
    const flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, PRIMARY_TEST_SEAT);
    const path = `/api/flights/${flightId}/seats/${seatId}/hold`;

    await agent.post(path).expect(200);
    await agent.post(path).expect(200);

    const response = await agent.post(path).expect(429);
    const body = response.body as { code?: string };
    expect(body.code).toBe('RATE_LIMITED');
  });
});
