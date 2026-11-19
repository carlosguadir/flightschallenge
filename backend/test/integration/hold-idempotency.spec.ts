import type { INestApplication } from '@nestjs/common';
import type { ServerEvent } from '@flight/shared';
import type { Pool } from 'pg';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PG_POOL } from '../../src/database/database.tokens';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { InProcessEventBus } from '../../src/shared-kernel/infrastructure/in-process-event-bus';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

describe('10.2 idempotent re-hold', () => {
  let app: INestApplication;
  let bus: InProcessEventBus;
  let pool: Pool;
  let agent: ReturnType<typeof request.agent>;
  let flightId: string;
  let seatId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    bus = app.get(InProcessEventBus);
    pool = app.get<Pool>(PG_POOL);
    agent = request.agent(app.getHttpServer() as Server);
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '1A');
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the same hold without extending the TTL or emitting twice', async () => {
    const events: ServerEvent[] = [];
    bus.subscribe((event) => events.push(event));

    const path = `/api/flights/${flightId}/seats/${seatId}/hold`;

    const first = await agent.post(path).expect(200);
    const second = await agent.post(path).expect(200);
    const firstBody = first.body as { seatId: string; expiresAt: string; version: number };
    const secondBody = second.body as { seatId: string; expiresAt: string; version: number };

    expect(secondBody.seatId).toBe(firstBody.seatId);
    expect(secondBody.expiresAt).toBe(firstBody.expiresAt);
    expect(secondBody.version).toBe(firstBody.version);

    const seat = await pool.query<{ version: string }>('SELECT version FROM seats WHERE id = $1', [
      seatId,
    ]);
    expect(Number(seat.rows[0].version)).toBe(1);
    expect(
      events.filter((event) => event.name === 'seat.held' && event.payload.seatId === seatId),
    ).toHaveLength(1);
  });

  it('still accepts an idempotent re-hold at the 4-hold cap', async () => {
    const hold = (label: string): request.Test =>
      agent.post(`/api/flights/${flightId}/seats/${seedSeatId(PRIMARY_TEST_FLIGHT, label)}/hold`);

    await hold('1A').expect(200);
    await hold('2A').expect(200);
    await hold('2B').expect(200);
    await hold('2C').expect(200);

    const atCap = await hold('1A').expect(200);
    expect((atCap.body as { seatId: string }).seatId).toBe(seatId);
  });
});
