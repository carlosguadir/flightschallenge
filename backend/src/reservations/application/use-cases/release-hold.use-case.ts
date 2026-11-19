import { Inject, Injectable } from '@nestjs/common';

import { FLIGHT_STATE_PORT, type FlightStatePort } from '../../../catalog';
import {
  AppError,
  EVENT_PUBLISHER,
  UNIT_OF_WORK,
  type EventPublisher,
  type UnitOfWork,
} from '../../../shared-kernel';
import { SEAT_REPOSITORY, type SeatRepository } from '../ports/seat-repository.port';

export interface ReleaseHoldCommand {
  flightId: string;
  seatId: string;
  sessionId: string;
}

@Injectable()
export class ReleaseHold {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SEAT_REPOSITORY) private readonly seats: SeatRepository,
    @Inject(FLIGHT_STATE_PORT) private readonly flightState: FlightStatePort,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  execute(command: ReleaseHoldCommand): Promise<void> {
    return this.unitOfWork.runInFlightTransaction(command.flightId, async (tx) => {
      const released = await this.seats.releaseHold(tx, command);
      if (!released) {
        throw new AppError('SEAT_UNAVAILABLE', 409, 'Hold is not owned by this session');
      }

      const state = await this.flightState.recordSeatChange(tx, command.flightId, 1);

      this.events.publish({
        name: 'seat.released',
        payload: {
          flightId: command.flightId,
          seatId: released.seatId,
          label: released.label,
          reason: 'USER',
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
    });
  }
}
