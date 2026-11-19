import type { INestApplication } from '@nestjs/common';
import type { BookingLookupResponse, BookingResponse } from '@flight/shared';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { bookingBody, idempotencyKey } from '../helpers/booking';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

describe('10.15 booking lookup', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let booking: BookingResponse;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    agent = request.agent(app.getHttpServer() as Server);
    const flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '1A');
    await agent.get('/api/health').expect(200);
    await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    const response = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send(bookingBody(flightId, seatId))
      .expect(201);
    booking = response.body as BookingResponse;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the ticket for the correct code and email', async () => {
    const response = await agent
      .post('/api/bookings/lookup')
      .send({ code: booking.code, email: 'ADA@EXAMPLE.COM' })
      .expect(200);

    expect(response.body as BookingLookupResponse).toMatchObject({
      code: booking.code,
      flightNumber: PRIMARY_TEST_FLIGHT,
      origin: 'BOG',
      destination: 'MDE',
      seatLabel: '1A',
      passengerName: 'Ada Lovelace',
      currency: 'USD',
    });
  });

  it('returns the same 404 for a wrong email or code', async () => {
    const wrongEmail = await agent
      .post('/api/bookings/lookup')
      .send({ code: booking.code, email: 'nobody@example.com' })
      .expect(404);

    const wrongCodeValue = booking.code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
    const wrongCode = await agent
      .post('/api/bookings/lookup')
      .send({ code: wrongCodeValue, email: 'ada@example.com' })
      .expect(404);

    expect(wrongEmail.body).toEqual(wrongCode.body);
    expect((wrongEmail.body as { code?: string }).code).toBe('BOOKING_NOT_FOUND');
  });
});
