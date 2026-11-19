import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

const SEATS = ['2A', '2B', '2C', '2D', '2E'];

describe('10.3 max four holds per session per flight', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts four concurrent holds and rejects the fifth with HOLD_LIMIT', async () => {
    const server = app.getHttpServer() as Server;
    const flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    const agent = request.agent(server);
    await agent.get('/api/health').expect(200);

    const responses = await Promise.all(
      SEATS.map((label) =>
        agent.post(`/api/flights/${flightId}/seats/${seedSeatId(PRIMARY_TEST_FLIGHT, label)}/hold`),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(4);
    expect(statuses.filter((status) => status === 409)).toHaveLength(1);

    const rejected = responses.find((response) => response.status === 409);
    expect((rejected?.body as { code?: string }).code).toBe('HOLD_LIMIT');
  });
});
