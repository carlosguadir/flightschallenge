import type { INestApplication } from '@nestjs/common';
import type { FlightSummary } from '@flight/shared';
import type { Pool } from 'pg';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PG_POOL } from '../../src/database/database.tokens';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { bookingBody, idempotencyKey } from '../helpers/booking';
import { createTestApp } from '../helpers/create-test-app';
import { createSession, type TestSession } from '../helpers/session';
import { ensureTestDatabase } from '../helpers/test-database';
import { waitFor } from '../helpers/wait';

describe('10.12 status precedence and cancel race', () => {
  let app: INestApplication;
  let server: Server;
  let pool: Pool;
  let session: TestSession;
  let flightId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    server = app.getHttpServer() as Server;
    pool = app.get<Pool>(PG_POOL);
    session = await createSession(server);
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps DELAYED through expiry/sweep and rejects bookings after cancellation', async () => {
    await request(server)
      .patch(`/api/admin/flights/${flightId}/status`)
      .send({ status: 'DELAYED', delayMinutes: 10 })
      .expect(200);

    const expiringSeat = seedSeatId(PRIMARY_TEST_FLIGHT, '1A');
    const heldSeat = seedSeatId(PRIMARY_TEST_FLIGHT, '2A');
    await session.agent.post(`/api/flights/${flightId}/seats/${expiringSeat}/hold`).expect(200);
    await session.agent.post(`/api/flights/${flightId}/seats/${heldSeat}/hold`).expect(200);

    await pool.query(
      `UPDATE seats SET hold_expires_at = now() - interval '1 second' WHERE id = $1`,
      [expiringSeat],
    );

    await waitFor(async () => {
      const result = await pool.query<{ status: string }>(
        'SELECT status FROM seats WHERE id = $1',
        [expiringSeat],
      );
      return result.rows[0]?.status === 'AVAILABLE';
    });

    const afterSweep = await request(server).get(`/api/flights/${flightId}`).expect(200);
    expect((afterSweep.body as FlightSummary).status).toBe('DELAYED');

    await request(server)
      .patch(`/api/admin/flights/${flightId}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);

    const rejectedHold = await session.agent
      .post(`/api/flights/${flightId}/seats/${seedSeatId(PRIMARY_TEST_FLIGHT, '3A')}/hold`)
      .expect(409);
    expect((rejectedHold.body as { code?: string }).code).toBe('FLIGHT_NOT_BOOKABLE');

    const rejectedBooking = await session.agent
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send(bookingBody(flightId, heldSeat))
      .expect(409);
    expect((rejectedBooking.body as { code?: string }).code).toBe('FLIGHT_NOT_BOOKABLE');

    const bookings = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bookings WHERE flight_id = $1',
      [flightId],
    );
    expect(bookings.rows[0].count).toBe(0);
  });

  it('serializes a concurrent hold and cancel without creating a booking', async () => {
    const otherFlightId = seedFlightId('AV1002');
    const seatId = seedSeatId('AV1002', '1A');

    const [holdResponse] = await Promise.all([
      session.agent.post(`/api/flights/${otherFlightId}/seats/${seatId}/hold`),
      request(server)
        .patch(`/api/admin/flights/${otherFlightId}/status`)
        .send({ status: 'CANCELLED' }),
    ]);

    expect([200, 409]).toContain(holdResponse.status);

    const detail = await request(server).get(`/api/flights/${otherFlightId}`).expect(200);
    expect((detail.body as FlightSummary).status).toBe('CANCELLED');

    const booking = await session.agent
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send(bookingBody(otherFlightId, seatId))
      .expect(409);
    expect((booking.body as { code?: string }).code).toBe('FLIGHT_NOT_BOOKABLE');

    const bookings = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bookings WHERE flight_id = $1',
      [otherFlightId],
    );
    expect(bookings.rows[0].count).toBe(0);
  });
});
