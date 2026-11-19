import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import type { HoldResponse, SeatMap } from '@flight/shared';
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

describe('phase 0 hold round-trip', () => {
  let app: INestApplication;
  let flightId: string;
  let seatId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    seatId = seedSeatId(PRIMARY_TEST_FLIGHT, PRIMARY_TEST_SEAT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('holds, observes ownership and releases the seat', async () => {
    const agent = request.agent(app.getHttpServer() as Server);

    const hold = await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);
    const holdBody = hold.body as HoldResponse;

    expect(holdBody).toMatchObject({ seatId });
    expect(typeof holdBody.expiresAt).toBe('string');
    expect(holdBody.version).toBeGreaterThanOrEqual(1);

    const heldMap = await agent.get(`/api/flights/${flightId}/seats`).expect(200);
    const heldSeat = (heldMap.body as SeatMap).seats.find((seat) => seat.id === seatId);
    expect(heldSeat).toMatchObject({ status: 'HELD', isMine: true });
    expect(heldSeat?.expiresAt).not.toBeNull();

    await agent.delete(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(204);

    const releasedMap = await agent.get(`/api/flights/${flightId}/seats`).expect(200);
    const releasedSeat = (releasedMap.body as SeatMap).seats.find((seat) => seat.id === seatId);
    expect(releasedSeat).toMatchObject({ status: 'AVAILABLE', isMine: false });
  });
});
