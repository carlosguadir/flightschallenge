import type { FlightStatus } from '@flight/shared';

import type { DbTransaction } from '../../../shared-kernel';

export interface FlightStatusChangeResult {
  status: FlightStatus;
  delayMinutes: number;
  soldOut: boolean;
  availableSeats: number;
  version: number;
}

export interface SeatChangeResult {
  seatEventVersions: number[];
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
  changeStatus(
    tx: DbTransaction,
    flightId: string,
    status: FlightStatus,
    delayMinutes?: number,
  ): Promise<FlightStatusChangeResult>;
}

export const FLIGHT_STATE_PORT = Symbol('FLIGHT_STATE_PORT');
