import type { INestApplication } from '@nestjs/common';
import type { FlightMetrics } from '@flight/shared';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { bookingBody, idempotencyKey } from '../helpers/booking';
import { createTestApp } from '../helpers/create-test-app';
import { createSession } from '../helpers/session';
import { ensureTestDatabase } from '../helpers/test-database';

describe('flight metrics read model', () => {
  let app: INestApplication;
  let server: Server;
  let agent: ReturnType<typeof request.agent>;
  let flightId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    server = app.getHttpServer() as Server;
    const session = await createSession(server);
    agent = session.agent;
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('tracks available, held and booked seats with the flight version', async () => {
    const initial = await request(server).get(`/api/flights/${flightId}/metrics`).expect(200);
    expect(initial.body as FlightMetrics).toMatchObject({
      total: 180,
      available: 180,
      held: 0,
      booked: 0,
      occupancyPct: 0,
      version: 0,
    });

    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '1A');
    await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    const afterHold = await request(server).get(`/api/flights/${flightId}/metrics`).expect(200);
    expect(afterHold.body as FlightMetrics).toMatchObject({
      total: 180,
      available: 179,
      held: 1,
      booked: 0,
      occupancyPct: 0.56,
      version: 1,
    });

    await agent
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send(bookingBody(flightId, seatId))
      .expect(201);

    const afterBooking = await request(server).get(`/api/flights/${flightId}/metrics`).expect(200);
    expect(afterBooking.body as FlightMetrics).toMatchObject({
      available: 179,
      held: 0,
      booked: 1,
      occupancyPct: 0.56,
      version: 2,
    });
  });
});
