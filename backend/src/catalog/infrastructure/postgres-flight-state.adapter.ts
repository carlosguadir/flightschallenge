import { Injectable } from '@nestjs/common';
import type { FlightStatus } from '@flight/shared';

import { AppError } from '../../shared-kernel/domain/app-error';
import type { DbTransaction } from '../../shared-kernel/application/ports/unit-of-work.port';
import type { FlightStatePort, SeatChangeResult } from '../application/ports/flight-state.port';

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
      seatEventVersion: previousVersion + 1,
      flightVersion,
      status: flight.status,
      delayMinutes: flight.delay_minutes,
      soldOut,
      soldOutToggled,
      availableSeats,
    };
  }
}
