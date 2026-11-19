import { Injectable } from '@nestjs/common';
import type { FlightStatus } from '@flight/shared';

import type { DbTransaction } from '../../shared-kernel';
import { AppError } from '../../shared-kernel';
import type {
  FlightStatePort,
  FlightStatusChangeResult,
  SeatChangeResult,
} from '../application/ports/flight-state.port';
import { canTransitionFlightStatus } from '../domain/flight-status';

interface FlightRow {
  status: FlightStatus;
  sold_out: boolean;
  delay_minutes: number;
  version: string;
}

@Injectable()
export class PostgresFlightStateAdapter implements FlightStatePort {
  async assertBookable(tx: DbTransaction, flightId: string): Promise<void> {
    const result = await tx.query<{ status: FlightStatus }>(
      'SELECT status FROM flights WHERE id = $1',
      [flightId],
    );

    if (result.rowCount === 0) {
      throw new AppError('FLIGHT_NOT_FOUND', 404, 'Flight not found');
    }
    if (result.rows[0].status === 'CANCELLED') {
      throw new AppError('FLIGHT_NOT_BOOKABLE', 409, 'Flight is cancelled');
    }
  }

  async changeStatus(
    tx: DbTransaction,
    flightId: string,
    status: FlightStatus,
    delayMinutes?: number,
  ): Promise<FlightStatusChangeResult> {
    const flightResult = await tx.query<FlightRow>(
      `SELECT status, sold_out, delay_minutes, version
       FROM flights
       WHERE id = $1
       FOR UPDATE`,
      [flightId],
    );

    if (flightResult.rowCount === 0) {
      throw new AppError('FLIGHT_NOT_FOUND', 404, 'Flight not found');
    }

    const flight = flightResult.rows[0];
    if (!canTransitionFlightStatus(flight.status, status)) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        409,
        `Cannot transition flight from ${flight.status} to ${status}`,
      );
    }

    const nextDelay =
      status === 'DELAYED'
        ? (delayMinutes ?? 0)
        : status === 'SCHEDULED'
          ? 0
          : flight.delay_minutes;
    const version = Number(flight.version) + 1;

    await tx.query(
      `UPDATE flights
       SET status = $2, delay_minutes = $3, version = $4
       WHERE id = $1`,
      [flightId, status, nextDelay, version],
    );

    const availabilityResult = await tx.query<{ available: number }>(
      `SELECT count(*)::int AS available
       FROM seats
       WHERE flight_id = $1 AND status = 'AVAILABLE'`,
      [flightId],
    );

    return {
      status,
      delayMinutes: nextDelay,
      soldOut: flight.sold_out,
      availableSeats: availabilityResult.rows[0]?.available ?? 0,
      version,
    };
  }

  async recordSeatChange(
    tx: DbTransaction,
    flightId: string,
    seatEvents: number,
  ): Promise<SeatChangeResult> {
    const flightResult = await tx.query<FlightRow>(
      `SELECT status, sold_out, delay_minutes, version
       FROM flights
       WHERE id = $1
       FOR UPDATE`,
      [flightId],
    );

    if (flightResult.rowCount === 0) {
      throw new AppError('FLIGHT_NOT_FOUND', 404, 'Flight not found');
    }

    const flight = flightResult.rows[0];
    const availabilityResult = await tx.query<{ available: number }>(
      `SELECT count(*)::int AS available
       FROM seats
       WHERE flight_id = $1 AND status = 'AVAILABLE'`,
      [flightId],
    );

    const availableSeats = availabilityResult.rows[0]?.available ?? 0;
    const soldOut = availableSeats === 0;
    const soldOutToggled = soldOut !== flight.sold_out;
    const eventCount = seatEvents + (soldOutToggled ? 1 : 0);
    const previousVersion = Number(flight.version);
    const flightVersion = previousVersion + eventCount;

    await tx.query('UPDATE flights SET sold_out = $2, version = $3 WHERE id = $1', [
      flightId,
      soldOut,
      flightVersion,
    ]);

    return {
      seatEventVersions: Array.from(
        { length: seatEvents },
        (_, index) => previousVersion + index + 1,
      ),
      flightVersion,
      status: flight.status,
      delayMinutes: flight.delay_minutes,
      soldOut,
      soldOutToggled,
      availableSeats,
    };
  }
}
