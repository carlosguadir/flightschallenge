import type { INestApplication } from '@nestjs/common';
import type { ServerEvent } from '@flight/shared';
import { Pool } from 'pg';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../../src/app.factory';
import { loadConfig } from '../../src/config/config';
import { DatabaseService } from '../../src/database/database.service';
import {
  PRIMARY_TEST_FLIGHT,
  PRIMARY_TEST_SEAT,
  seedFlightId,
  seedSeatId,
} from '../../src/database/seed';
import { InProcessEventBus } from '../../src/shared-kernel/infrastructure/in-process-event-bus';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase, testDatabaseUrl } from '../helpers/test-database';
import { waitFor } from '../helpers/wait';

describe('10.4 sweeper restart', () => {
  let firstApp: INestApplication;
  let secondApp: INestApplication;
  let pool: Pool;
  let flightId: string;
  let seatId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    firstApp = created.app;
    const database = firstApp.get(DatabaseService);
    await database.migrate();
    await database.reset();

    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    seatId = seedSeatId(PRIMARY_TEST_FLIGHT, PRIMARY_TEST_SEAT);

    const agent = request.agent(firstApp.getHttpServer() as Server);
    await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    await firstApp.close();

    pool = new Pool({ connectionString: testDatabaseUrl() });
    await pool.query(
      `UPDATE seats SET hold_expires_at = now() - interval '1 second' WHERE id = $1`,
      [seatId],
    );

    const config = { ...loadConfig({ ...process.env, NODE_ENV: 'test' }), logLevel: 'silent' };
    secondApp = await createApplication(config);
  });

  afterAll(async () => {
    await secondApp.close();
    await pool.end();
  });

  it('releases expired holds immediately on boot and emits seat.released', async () => {
    const events: ServerEvent[] = [];
    secondApp.get(InProcessEventBus).subscribe((event) => events.push(event));

    await secondApp.init();

    await waitFor(
      () =>
        events.some(
          (event) =>
            event.name === 'seat.released' &&
            event.payload.seatId === seatId &&
            event.payload.reason === 'EXPIRED',
        ),
      3000,
    );

    const seat = await pool.query<{ status: string }>('SELECT status FROM seats WHERE id = $1', [
      seatId,
    ]);
    expect(seat.rows[0].status).toBe('AVAILABLE');
  });
});
