import type { FlightStatus } from '@flight/shared';

import type { DbTransaction } from '../../../shared-kernel/application/ports/unit-of-work.port';

export interface SeatChangeResult {
  seatEventVersion: number;
  flightVersion: number;
  status: FlightStatus;
  delayMinutes: number;
  soldOut: boolean;
  soldOutToggled: boolean;
  availableSeats: number;
}

export interface FlightStatePort {
  assertBookable(tx: DbTransaction, flightId: string): Promise<void>;
  recordSeatChange(
    tx: DbTransaction,
    flightId: string,
    seatEvents: number,
  ): Promise<SeatChangeResult>;
}

export const FLIGHT_STATE_PORT = Symbol('FLIGHT_STATE_PORT');
