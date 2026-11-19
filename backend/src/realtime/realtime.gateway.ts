import { Inject } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import type { OnGatewayInit } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { APP_CONFIG, type AppConfig } from '../config/config';
import { readSessionIdFromCookieHeader } from '../session/session.middleware';

@WebSocketGateway({ path: '/socket.io' })
export class RealtimeGateway implements OnGatewayInit {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  afterInit(server: Server): void {
    server.use((socket: Socket, next: (error?: Error) => void) => {
      const sessionId = readSessionIdFromCookieHeader(
        socket.handshake.headers.cookie,
        this.config.cookieSecret,
      );

      if (!sessionId) {
        next(new Error('UNAUTHORIZED'));
        return;
      }

      const data = socket.data as { sessionId?: string };
      data.sessionId = sessionId;
      next();
    });
  }
}
