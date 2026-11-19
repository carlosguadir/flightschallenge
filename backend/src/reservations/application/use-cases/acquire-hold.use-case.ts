import { Inject, Injectable } from '@nestjs/common';
import type { HoldResponse } from '@flight/shared';

import { FLIGHT_STATE_PORT, type FlightStatePort } from '../../../catalog';
import { APP_CONFIG, type AppConfig } from '../../../config/config';
import {
  AppError,
  EVENT_PUBLISHER,
  UNIT_OF_WORK,
  type EventPublisher,
  type UnitOfWork,
} from '../../../shared-kernel';
import { SEAT_REPOSITORY, type SeatRepository } from '../ports/seat-repository.port';

export interface AcquireHoldCommand {
  flightId: string;
  seatId: string;
  sessionId: string;
}

@Injectable()
export class AcquireHold {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SEAT_REPOSITORY) private readonly seats: SeatRepository,
    @Inject(FLIGHT_STATE_PORT) private readonly flightState: FlightStatePort,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  execute(command: AcquireHoldCommand): Promise<HoldResponse> {
    return this.unitOfWork.runInFlightTransaction(command.flightId, async (tx) => {
      await this.flightState.assertBookable(tx, command.flightId);

      const existing = await this.seats.findActiveHold(tx, command);
      if (existing) {
        return {
          seatId: existing.seatId,
          expiresAt: existing.expiresAt.toISOString(),
          version: existing.flightVersion,
        };
      }

      const activeHolds = await this.seats.countActiveHolds(
        tx,
        command.flightId,
        command.sessionId,
      );
      if (activeHolds >= this.config.maxHoldsPerFlight) {
        throw new AppError(
          'HOLD_LIMIT',
          409,
          `A session can hold at most ${this.config.maxHoldsPerFlight} seats per flight`,
        );
      }

      const acquired = await this.seats.acquireHold(tx, {
        ...command,
        ttlSeconds: this.config.seatHoldTtlSeconds,
      });

      if (!acquired) {
        const raced = await this.seats.findActiveHold(tx, command);
        if (raced) {
          return {
            seatId: raced.seatId,
            expiresAt: raced.expiresAt.toISOString(),
            version: raced.flightVersion,
          };
        }
        throw new AppError('SEAT_UNAVAILABLE', 409, 'Seat is not available');
      }

      const state = await this.flightState.recordSeatChange(tx, command.flightId, 1);

      this.events.publish({
        name: 'seat.held',
        payload: {
          flightId: command.flightId,
          seatId: acquired.seatId,
          label: acquired.label,
          expiresAt: acquired.expiresAt.toISOString(),
          version: state.seatEventVersions[0] ?? state.flightVersion,
        },
      });

      if (state.soldOutToggled) {
        this.events.publish({
          name: 'flight.updated',
          payload: {
            flightId: command.flightId,
            status: state.status,
            delayMinutes: state.delayMinutes,
            soldOut: state.soldOut,
            availableSeats: state.availableSeats,
            version: state.flightVersion,
          },
        });
      }

      return {
        seatId: acquired.seatId,
        expiresAt: acquired.expiresAt.toISOString(),
        version: state.flightVersion,
      };
    });
  }
}
