import type { INestApplication } from '@nestjs/common';
import type { SeatMap } from '@flight/shared';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { createTestApp } from '../helpers/create-test-app';
import { createSession, type TestSession } from '../helpers/session';
import { ensureTestDatabase } from '../helpers/test-database';

const RESET_TOKEN = 'integration-reset-token';

describe('e2e test reset hook', () => {
  let app: INestApplication;
  let server: Server;
  let session: TestSession;
  const flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
  const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '1A');

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp({ testResetToken: RESET_TOKEN });
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();
    server = app.getHttpServer() as Server;
    session = await createSession(server);
  });

  afterAll(async () => {
    await app.close();
  });

  it('hides the hook without the shared token', async () => {
    await request(server).post('/api/test/reset').expect(404);
    await request(server)
      .post('/api/test/reset')
      .set('x-test-reset-token', 'wrong-token')
      .expect(404);
  });

  it('restores the seed state for the next scenario', async () => {
    await session.agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    await request(server)
      .post('/api/test/reset')
      .set('x-test-reset-token', RESET_TOKEN)
      .expect(204);

    const response = await session.agent.get(`/api/flights/${flightId}/seats`).expect(200);
    const map = response.body as SeatMap;
    expect(map.availableSeats).toBe(180);
    expect(map.seats.find((seat) => seat.id === seatId)).toMatchObject({
      status: 'AVAILABLE',
      isMine: false,
    });
  });
});
