import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { HoldResponse, SeatMap } from '@flight/shared';
import type { Request } from 'express';

import { AcquireHold } from '../application/use-cases/acquire-hold.use-case';
import { GetSeatMap } from '../application/use-cases/get-seat-map.use-case';
import { ReleaseHold } from '../application/use-cases/release-hold.use-case';

@Controller('flights')
export class SeatsController {
  constructor(
    private readonly acquireHold: AcquireHold,
    private readonly releaseHold: ReleaseHold,
    private readonly getSeatMap: GetSeatMap,
  ) {}

  @Get(':id/seats')
  seats(@Param('id', ParseUUIDPipe) flightId: string, @Req() request: Request): Promise<SeatMap> {
    return this.getSeatMap.execute({ flightId, sessionId: request.sessionId });
  }

  @Post(':id/seats/:seatId/hold')
  @HttpCode(HttpStatus.OK)
  hold(
    @Param('id', ParseUUIDPipe) flightId: string,
    @Param('seatId', ParseUUIDPipe) seatId: string,
    @Req() request: Request,
  ): Promise<HoldResponse> {
    return this.acquireHold.execute({ flightId, seatId, sessionId: request.sessionId });
  }

  @Delete(':id/seats/:seatId/hold')
  @HttpCode(HttpStatus.NO_CONTENT)
  release(
    @Param('id', ParseUUIDPipe) flightId: string,
    @Param('seatId', ParseUUIDPipe) seatId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.releaseHold.execute({ flightId, seatId, sessionId: request.sessionId });
  }
}
