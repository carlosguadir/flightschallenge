import { useEffect, useState, type JSX, type PropsWithChildren } from 'react';
import { io, type Socket } from 'socket.io-client';

import { SocketContext } from './socket-context';

/**
 * The SPA bootstraps the signed session cookie with its first REST call,
 * then opens the socket. Without this ordering the handshake would be rejected.
 */
export function SocketProvider({ children }: PropsWithChildren): JSX.Element {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let client: Socket | undefined;

    const bootstrap = async (): Promise<void> => {
      try {
        await fetch('/api/health');
      } catch {
        // The socket attempt below will surface the connection state.
      }

      if (cancelled) return;

      client = io({ path: '/socket.io' });
      client.on('connect', () => setConnected(true));
      client.on('disconnect', () => setConnected(false));
      setSocket(client);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      client?.close();
      setSocket(null);
      setConnected(false);
    };
  }, []);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}
