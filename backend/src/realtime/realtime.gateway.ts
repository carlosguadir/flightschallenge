import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { OnGatewayInit } from '@nestjs/websockets';
import { FlightJoinPayloadSchema, type FlightJoinAck, type ServerEventName } from '@flight/shared';
import type { Server, Socket } from 'socket.io';

import { APP_CONFIG, type AppConfig } from '../config/config';
import { readSessionIdFromCookieHeader } from '../session/session.middleware';

export const SEARCH_ROOM = 'search';

export function flightRoom(flightId: string): string {
  return `flight:${flightId}`;
}

@WebSocketGateway({ path: '/socket.io' })
export class RealtimeGateway implements OnGatewayInit {
  @WebSocketServer()
  private server!: Server;

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

  @SubscribeMessage('flight.join')
  async joinFlight(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<FlightJoinAck> {
    const parsed = FlightJoinPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new WsException('INVALID_PAYLOAD');
    }

    const { flightId } = parsed.data;
    await client.join(flightRoom(flightId));
    return { ok: true, flightId };
  }

  @SubscribeMessage('flight.leave')
  async leaveFlight(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<FlightJoinAck> {
    const parsed = FlightJoinPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new WsException('INVALID_PAYLOAD');
    }

    const { flightId } = parsed.data;
    await client.leave(flightRoom(flightId));
    return { ok: true, flightId };
  }

  @SubscribeMessage('search.join')
  async joinSearch(@ConnectedSocket() client: Socket): Promise<{ ok: true }> {
    await client.join(SEARCH_ROOM);
    return { ok: true };
  }

  emitToFlight(flightId: string, event: ServerEventName, payload: unknown): void {
    this.server.to(flightRoom(flightId)).emit(event, payload);
  }

  emitToSearch(event: ServerEventName, payload: unknown): void {
    this.server.to(SEARCH_ROOM).emit(event, payload);
  }
}
