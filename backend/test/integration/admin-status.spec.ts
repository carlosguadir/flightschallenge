import type { INestApplication } from '@nestjs/common';
import type { FlightSummary, UpdateFlightStatusResponse } from '@flight/shared';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PRIMARY_TEST_FLIGHT, seedFlightId } from '../../src/database/seed';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

describe('10.16 admin flight status transitions', () => {
  let app: INestApplication;
  let server: Server;
  let flightId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    server = app.getHttpServer() as Server;
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('applies valid transitions with status, soldOut and version', async () => {
    const delayed = await request(server)
      .patch(`/api/admin/flights/${flightId}/status`)
      .send({ status: 'DELAYED', delayMinutes: 15 })
      .expect(200);
    expect(delayed.body as UpdateFlightStatusResponse).toMatchObject({
      flightId,
      status: 'DELAYED',
      delayMinutes: 15,
      soldOut: false,
      availableSeats: 180,
      version: 1,
    });

    const scheduled = await request(server)
      .patch(`/api/admin/flights/${flightId}/status`)
      .send({ status: 'SCHEDULED' })
      .expect(200);
    expect(scheduled.body as UpdateFlightStatusResponse).toMatchObject({
      status: 'SCHEDULED',
      delayMinutes: 0,
      version: 2,
    });

    const cancelled = await request(server)
      .patch(`/api/admin/flights/${flightId}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);
    expect(cancelled.body as UpdateFlightStatusResponse).toMatchObject({
      status: 'CANCELLED',
      version: 3,
    });

    const detail = await request(server).get(`/api/flights/${flightId}`).expect(200);
    expect((detail.body as FlightSummary).status).toBe('CANCELLED');
  });

  it('rejects invalid input and illegal transitions', async () => {
    const soldOut = await request(server)
      .patch(`/api/admin/flights/${flightId}/status`)
      .send({ status: 'SOLD_OUT' })
      .expect(400);
    expect((soldOut.body as { code?: string }).code).toBe('VALIDATION_ERROR');

    const missingDelay = await request(server)
      .patch(`/api/admin/flights/${flightId}/status`)
      .send({ status: 'DELAYED' })
      .expect(400);
    expect((missingDelay.body as { code?: string }).code).toBe('VALIDATION_ERROR');

    const terminal = await request(server)
      .patch(`/api/admin/flights/${flightId}/status`)
      .send({ status: 'SCHEDULED' })
      .expect(409);
    expect((terminal.body as { code?: string }).code).toBe('INVALID_STATUS_TRANSITION');
  });
});
