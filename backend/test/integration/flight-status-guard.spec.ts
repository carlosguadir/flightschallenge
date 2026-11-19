import type { INestApplication } from '@nestjs/common';
import type { SeatMap } from '@flight/shared';
import type { Pool } from 'pg';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PG_POOL } from '../../src/database/database.tokens';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

describe('10.10 flight-status guard on hold', () => {
  let app: INestApplication;
  let pool: Pool;
  let flightId: string;
  let heldSeatId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    pool = app.get<Pool>(PG_POOL);
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    heldSeatId = seedSeatId(PRIMARY_TEST_FLIGHT, '1A');
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects new holds, keeps existing holds until TTL and rejects re-holds', async () => {
    const agent = request.agent(app.getHttpServer() as Server);
    await agent.post(`/api/flights/${flightId}/seats/${heldSeatId}/hold`).expect(200);

    await pool.query(`UPDATE flights SET status = 'CANCELLED' WHERE id = $1`, [flightId]);

    const otherSeatId = seedSeatId(PRIMARY_TEST_FLIGHT, '1B');
    const rejected = await agent
      .post(`/api/flights/${flightId}/seats/${otherSeatId}/hold`)
      .expect(409);
    expect((rejected.body as { code?: string }).code).toBe('FLIGHT_NOT_BOOKABLE');

    const reHold = await agent
      .post(`/api/flights/${flightId}/seats/${heldSeatId}/hold`)
      .expect(409);
    expect((reHold.body as { code?: string }).code).toBe('FLIGHT_NOT_BOOKABLE');

    const seatMap = await agent.get(`/api/flights/${flightId}/seats`).expect(200);
    const seat = (seatMap.body as SeatMap).seats.find((entry) => entry.id === heldSeatId);
    expect(seat).toMatchObject({ status: 'HELD', isMine: true });
  });
});
