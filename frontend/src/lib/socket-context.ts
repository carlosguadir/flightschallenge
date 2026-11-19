import { createContext } from 'react';
import type { Socket } from 'socket.io-client';

export interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

export const SocketContext = createContext<SocketContextValue | null>(null);

interface UntypedSocket {
  on(event: string, listener: (payload: unknown) => void): void;
  off(event: string, listener: (payload: unknown) => void): void;
}

export function onServerEvent<T>(
  socket: Socket,
  event: string,
  handler: (payload: T) => void,
): () => void {
  const untyped = socket as unknown as UntypedSocket;
  const listener = (payload: unknown): void => handler(payload as T);
  untyped.on(event, listener);
  return () => untyped.off(event, listener);
}

export function emitWithAck<T>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event} ack`)),
      timeoutMs,
    );

    socket.emit(event, payload, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}
