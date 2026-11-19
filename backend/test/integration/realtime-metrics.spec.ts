import type { INestApplication } from '@nestjs/common';
import type { FlightMetrics, FlightUpdatedEvent, SeatMap } from '@flight/shared';
import type { Server } from 'node:http';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { createTestApp } from '../helpers/create-test-app';
import { createSession, type TestSession } from '../helpers/session';
import { connectSocket, joinFlight, joinSearch, waitForSocketEvent } from '../helpers/socket';
import { ensureTestDatabase } from '../helpers/test-database';
import { waitFor } from '../helpers/wait';

describe('10.19/10.16 batched metrics and search room updates', () => {
  let app: INestApplication;
  let server: Server;
  let session: TestSession;
  let socket: Socket;
  let flightId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp({ metricsBatchMs: 300 });
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();
    await app.listen(0);

    server = app.getHttpServer() as Server;
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('HTTP server did not expose a port');
    }

    session = await createSession(server);
    socket = await connectSocket(address.port, session.cookie);
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    await joinFlight(socket, flightId);
  });

  afterAll(async () => {
    socket.close();
    await app.close();
  });

  it('batches seat events into one flight.metrics event', async () => {
    const metricsEvents: FlightMetrics[] = [];
    socket.on('flight.metrics', (event: FlightMetrics) => metricsEvents.push(event));

    await session.agent
      .post(`/api/flights/${flightId}/seats/${seedSeatId(PRIMARY_TEST_FLIGHT, '1A')}/hold`)
      .expect(200);
    await session.agent
      .post(`/api/flights/${flightId}/seats/${seedSeatId(PRIMARY_TEST_FLIGHT, '2A')}/hold`)
      .expect(200);

    await waitFor(() => metricsEvents.length > 0, 3000);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(metricsEvents).toHaveLength(1);
    expect(metricsEvents[0]).toMatchObject({
      flightId,
      total: 180,
      available: 178,
      held: 2,
      booked: 0,
      occupancyPct: 1.11,
      version: 2,
    });
  });

  it('broadcasts flight.updated to the search room', async () => {
    await joinSearch(socket);
    const eventPromise = waitForSocketEvent<FlightUpdatedEvent>(
      socket,
      'flight.updated',
      (event) => event.flightId === flightId && event.status === 'DELAYED',
    );

    await request(server)
      .patch(`/api/admin/flights/${flightId}/status`)
      .send({ status: 'DELAYED', delayMinutes: 10 })
      .expect(200);

    const event = await eventPromise;
    expect(event).toMatchObject({
      flightId,
      status: 'DELAYED',
      delayMinutes: 10,
      soldOut: false,
      availableSeats: 178,
    });
    expect(event.version).toBeGreaterThanOrEqual(3);

    const seatMap = await session.agent.get(`/api/flights/${flightId}/seats`).expect(200);
    expect((seatMap.body as SeatMap).status).toBe('DELAYED');
  });
});
