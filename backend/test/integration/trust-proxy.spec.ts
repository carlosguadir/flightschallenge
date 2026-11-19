import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

describe('10.18 trust proxy', () => {
  let app: INestApplication;
  let flightId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp({
      trustProxy: 1,
      throttleEnabled: true,
      throttleLimit: 1,
      throttleTtlSeconds: 60,
    });
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('uses X-Forwarded-For as the rate-limit key', async () => {
    const server = app.getHttpServer() as Server;
    const agent = request.agent(server);
    const holdPath = (seatLabel: string): string =>
      `/api/flights/${flightId}/seats/${seedSeatId(PRIMARY_TEST_FLIGHT, seatLabel)}/hold`;

    await agent.post(holdPath('1A')).set('X-Forwarded-For', '203.0.113.10').expect(200);

    await agent.post(holdPath('1B')).set('X-Forwarded-For', '203.0.113.10').expect(429);

    await agent.post(holdPath('1C')).set('X-Forwarded-For', '203.0.113.11').expect(200);
  });
});
