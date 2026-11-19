import type { INestApplication } from '@nestjs/common';
import type { SeatHeldEvent } from '@flight/shared';
import type { Server } from 'node:http';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { createTestApp } from '../helpers/create-test-app';
import { createSession, type TestSession } from '../helpers/session';
import { connectSocket, joinFlight, waitForSocketEvent } from '../helpers/socket';
import { ensureTestDatabase } from '../helpers/test-database';

describe('10.8 realtime hold broadcast', () => {
  let app: INestApplication;
  let server: Server;
  let port: number;
  let sessionA: TestSession;
  let sessionB: TestSession;
  let socketA: Socket;
  let socketB: Socket;
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
    port = address.port;

    sessionA = await createSession(server);
    sessionB = await createSession(server);
    socketA = await connectSocket(port, sessionA.cookie);
    socketB = await connectSocket(port, sessionB.cookie);

    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    await joinFlight(socketA, flightId);
    await joinFlight(socketB, flightId);
  });

  afterAll(async () => {
    socketA.close();
    socketB.close();
    await app.close();
  });

  it('both clients receive one seat.held with the same version; re-hold emits nothing', async () => {
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '1A');
    const receivedA: SeatHeldEvent[] = [];
    const receivedB: SeatHeldEvent[] = [];
    socketA.on('seat.held', (event: SeatHeldEvent) => {
      if (event.seatId === seatId) receivedA.push(event);
    });
    socketB.on('seat.held', (event: SeatHeldEvent) => {
      if (event.seatId === seatId) receivedB.push(event);
    });

    const eventA = waitForSocketEvent<SeatHeldEvent>(
      socketA,
      'seat.held',
      (event) => event.seatId === seatId,
    );
    const eventB = waitForSocketEvent<SeatHeldEvent>(
      socketB,
      'seat.held',
      (event) => event.seatId === seatId,
    );

    await sessionA.agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    const [fromA, fromB] = await Promise.all([eventA, eventB]);
    expect(fromA).toMatchObject({ flightId, seatId, label: '1A' });
    expect(fromB.version).toBe(fromA.version);
    expect(fromA.version).toBeGreaterThanOrEqual(1);
    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);

    await sessionA.agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
  });
});
