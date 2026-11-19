import { Inject, Injectable } from '@nestjs/common';

import { FLIGHT_STATE_PORT, type FlightStatePort } from '../../../catalog';
import {
  EVENT_PUBLISHER,
  UNIT_OF_WORK,
  type EventPublisher,
  type UnitOfWork,
} from '../../../shared-kernel';
import { SEAT_REPOSITORY, type SeatRepository } from '../ports/seat-repository.port';

export interface ExpireHoldsResult {
  released: number;
}

@Injectable()
export class ExpireHolds {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SEAT_REPOSITORY) private readonly seats: SeatRepository,
    @Inject(FLIGHT_STATE_PORT) private readonly flightState: FlightStatePort,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  execute(): Promise<ExpireHoldsResult | null> {
    return this.unitOfWork.runSweeperTransaction(async (tx) => {
      const flightIds = await this.seats.listFlightsWithExpiredHolds(tx);
      let released = 0;

      for (const flightId of flightIds) {
        await tx.lockFlight(flightId);
        const expiredSeats = await this.seats.expireSeats(tx, flightId);
        if (expiredSeats.length === 0) continue;

        const state = await this.flightState.recordSeatChange(tx, flightId, expiredSeats.length);

        expiredSeats.forEach((seat, index) => {
          this.events.publish({
            name: 'seat.released',
            payload: {
              flightId,
              seatId: seat.seatId,
              label: seat.label,
              reason: 'EXPIRED',
              version: state.seatEventVersions[index] ?? state.flightVersion,
            },
          });
        });

        if (state.soldOutToggled) {
          this.events.publish({
            name: 'flight.updated',
            payload: {
              flightId,
              status: state.status,
              delayMinutes: state.delayMinutes,
              soldOut: state.soldOut,
              availableSeats: state.availableSeats,
              version: state.flightVersion,
            },
          });
        }

        released += expiredSeats.length;
      }

      return { released };
    });
  }
}
