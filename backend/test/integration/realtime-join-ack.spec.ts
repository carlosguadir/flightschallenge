import type { INestApplication } from '@nestjs/common';
import type { SeatHeldEvent, SeatMap } from '@flight/shared';
import type { Server } from 'node:http';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { createTestApp } from '../helpers/create-test-app';
import { createSession, type TestSession } from '../helpers/session';
import { connectSocket, joinFlight, waitForSocketEvent } from '../helpers/socket';
import { ensureTestDatabase } from '../helpers/test-database';

describe('10.19 join ack before snapshot and version ordering', () => {
  let app: INestApplication;
  let server: Server;
  let sessionA: TestSession;
  let sessionB: TestSession;
  let socket: Socket;
  let flightId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
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

    sessionA = await createSession(server);
    sessionB = await createSession(server);
    socket = await connectSocket(address.port, sessionA.cookie);
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
  });

  afterAll(async () => {
    socket.close();
    await app.close();
  });

  it('resolves the ack, fetches the snapshot, then receives newer events', async () => {
    const order: string[] = [];
    const ack = await joinFlight(socket, flightId);
    order.push('ack');

    const snapshot = await sessionA.agent.get(`/api/flights/${flightId}/seats`).expect(200);
    order.push('snapshot');

    const eventPromise = waitForSocketEvent<SeatHeldEvent>(
      socket,
      'seat.held',
      (event) => event.seatId === seedSeatId(PRIMARY_TEST_FLIGHT, '1A'),
    );

    await sessionB.agent
      .post(`/api/flights/${flightId}/seats/${seedSeatId(PRIMARY_TEST_FLIGHT, '1A')}/hold`)
      .expect(200);

    const event = await eventPromise;
    const snapshotBody = snapshot.body as SeatMap;

    expect(ack).toEqual({ ok: true, flightId });
    expect(order).toEqual(['ack', 'snapshot']);
    expect(event.version).toBeGreaterThan(snapshotBody.version);
  });
});
