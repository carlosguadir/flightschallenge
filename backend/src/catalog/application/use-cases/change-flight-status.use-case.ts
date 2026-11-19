import { Inject, Injectable } from '@nestjs/common';
import type { UpdateFlightStatusRequest, UpdateFlightStatusResponse } from '@flight/shared';

import {
  EVENT_PUBLISHER,
  UNIT_OF_WORK,
  type EventPublisher,
  type UnitOfWork,
} from '../../../shared-kernel';
import { FLIGHT_STATE_PORT, type FlightStatePort } from '../ports/flight-state.port';

@Injectable()
export class ChangeFlightStatus {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(FLIGHT_STATE_PORT) private readonly flightState: FlightStatePort,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  execute(
    flightId: string,
    request: UpdateFlightStatusRequest,
  ): Promise<UpdateFlightStatusResponse> {
    return this.unitOfWork.runInFlightTransaction(flightId, async (tx) => {
      const state = await this.flightState.changeStatus(
        tx,
        flightId,
        request.status,
        request.delayMinutes,
      );

      this.events.publish({
        name: 'flight.updated',
        payload: {
          flightId,
          status: state.status,
          delayMinutes: state.delayMinutes,
          soldOut: state.soldOut,
          availableSeats: state.availableSeats,
          version: state.version,
        },
      });

      return {
        flightId,
        status: state.status,
        delayMinutes: state.delayMinutes,
        soldOut: state.soldOut,
        availableSeats: state.availableSeats,
        version: state.version,
      };
    });
  }
}
