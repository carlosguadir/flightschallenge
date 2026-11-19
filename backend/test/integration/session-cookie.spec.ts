import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

function setCookieHeader(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown;
  const value = Array.isArray(header)
    ? (header[0] as string | undefined)
    : (header as string | undefined);
  if (!value) throw new Error('Expected a Set-Cookie header');
  return value;
}

function connectSocket(port: number, cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      path: '/realtime',
      transports: ['websocket'],
      reconnection: false,
      timeout: 2000,
      extraHeaders: { Cookie: cookie },
    });

    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

describe('10.18 session cookie', () => {
  let app: INestApplication;
  let secureApp: INestApplication;
  let server: Server;
  let port: number;

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

    const secureCreated = await createTestApp({ cookieSecure: true });
    secureApp = secureCreated.app;
  });

  afterAll(async () => {
    await secureApp.close();
    await app.close();
  });

  it('issues a signed HttpOnly SameSite=Lax cookie', async () => {
    const response = await request(server).get('/api/health').expect(200);
    const cookie = setCookieHeader(response);

    expect(cookie).toMatch(/^sid=s%3A/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).not.toContain('Secure');
  });

  it('sets Secure only when COOKIE_SECURE=true', async () => {
    const secureServer = secureApp.getHttpServer() as Server;
    const response = await request(secureServer).get('/api/health').expect(200);
    expect(setCookieHeader(response)).toContain('Secure');
  });

  it('accepts a valid signed cookie on the socket handshake', async () => {
    const response = await request(server).get('/api/health').expect(200);
    const cookie = setCookieHeader(response).split(';')[0];

    const socket = await connectSocket(port, cookie);
    expect(socket.connected).toBe(true);
    socket.close();
  });

  it('rejects a tampered cookie on the socket handshake', async () => {
    await expect(
      connectSocket(port, 'sid=s%3A00000000-0000-4000-8000-000000000000.forged'),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });
});
