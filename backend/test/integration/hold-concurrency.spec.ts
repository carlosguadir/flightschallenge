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

const SESSIONS = 50;

describe('10.1 concurrent holds on one seat', () => {
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

  it('produces exactly one winner and 49 SEAT_UNAVAILABLE', async () => {
    const server = app.getHttpServer() as Server;
    const flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, PRIMARY_TEST_SEAT);
    const path = `/api/flights/${flightId}/seats/${seatId}/hold`;
    const agents = Array.from({ length: SESSIONS }, () => request.agent(server));

    await Promise.all(agents.map((agent) => agent.get('/api/health').expect(200)));

    const responses = await Promise.all(agents.map((agent) => agent.post(path)));
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(SESSIONS - 1);

    const failureCodes = responses
      .filter((response) => response.status === 409)
      .map((response) => (response.body as { code?: string }).code);
    expect(failureCodes.every((code) => code === 'SEAT_UNAVAILABLE')).toBe(true);
  });
});
