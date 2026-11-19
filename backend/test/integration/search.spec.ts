import type { INestApplication } from '@nestjs/common';
import type { FlightSummary } from '@flight/shared';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PRIMARY_TEST_FLIGHT, seedFlightId } from '../../src/database/seed';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

describe('flight search and detail', () => {
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

  it('filters by origin, destination and UTC date', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/flights')
      .query({ origin: 'BOG', destination: 'MDE', date: '2026-12-01' })
      .expect(200);

    const flights = response.body as FlightSummary[];
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({
      flightNumber: PRIMARY_TEST_FLIGHT,
      origin: 'BOG',
      destination: 'MDE',
      availableSeats: 180,
      status: 'SCHEDULED',
    });
  });

  it('returns flight detail by id', async () => {
    const flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    const response = await request(app.getHttpServer() as Server)
      .get(`/api/flights/${flightId}`)
      .expect(200);

    expect((response.body as FlightSummary).flightNumber).toBe(PRIMARY_TEST_FLIGHT);
  });

  it('rejects an invalid search query', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/flights')
      .query({ origin: 'BO' })
      .expect(400);

    expect((response.body as { code?: string }).code).toBe('VALIDATION_ERROR');
  });
});
