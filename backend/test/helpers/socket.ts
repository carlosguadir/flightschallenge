import type { FlightJoinAck } from '@flight/shared';
import { io, type Socket } from 'socket.io-client';

const DEFAULT_TIMEOUT_MS = 3000;

interface UntypedSocket {
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

export function connectSocket(port: number, cookie: string): Promise<Socket> {
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

export function joinFlight(
  socket: Socket,
  flightId: string,
  timeoutMs = 2000,
): Promise<FlightJoinAck> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('flight.join ack timeout')), timeoutMs);
    socket.emit('flight.join', { flightId }, (ack: FlightJoinAck) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

export function joinSearch(socket: Socket, timeoutMs = 2000): Promise<{ ok: boolean }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('search.join ack timeout')), timeoutMs);
    socket.emit('search.join', {}, (ack: { ok: boolean }) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

export function waitForSocketEvent<T = unknown>(
  socket: Socket,
  event: string,
  predicate?: (payload: T) => boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const untyped = socket as unknown as UntypedSocket;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      untyped.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const handler = (payload: unknown): void => {
      if (predicate && !predicate(payload as T)) return;
      clearTimeout(timer);
      untyped.off(event, handler);
      resolve(payload as T);
    };

    untyped.on(event, handler);
  });
}
