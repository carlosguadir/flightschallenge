import { Inject, Injectable } from '@nestjs/common';
import type { FlightStatus, FlightSummary } from '@flight/shared';
import type { Pool } from 'pg';

import { PG_POOL } from '../../database/database.tokens';
import { AppError } from '../../shared-kernel/domain/app-error';
import type { FlightQueryPort } from '../application/ports/flight-query.port';

interface FlightSummaryRow {
  id: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_at: Date;
  arrival_at: Date;
  price_cents: number;
  currency: string;
  status: FlightStatus;
  delay_minutes: number;
  sold_out: boolean;
  available_seats: number;
  version: string;
}

@Injectable()
export class PostgresFlightQueryAdapter implements FlightQueryPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getSummary(flightId: string): Promise<FlightSummary> {
    const result = await this.pool.query<FlightSummaryRow>(
      `SELECT f.id,
              f.flight_number,
              f.origin,
              f.destination,
              f.departure_at,
              f.arrival_at,
              f.price_cents,
              f.currency,
              f.status,
              f.delay_minutes,
              f.sold_out,
              f.version,
              count(s.id) FILTER (WHERE s.status = 'AVAILABLE')::int AS available_seats
       FROM flights f
       LEFT JOIN seats s ON s.flight_id = f.id
       WHERE f.id = $1
       GROUP BY f.id`,
      [flightId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError('FLIGHT_NOT_FOUND', 404, 'Flight not found');
    }

    return {
      id: row.id,
      flightNumber: row.flight_number,
      origin: row.origin,
      destination: row.destination,
      departureAt: row.departure_at.toISOString(),
      arrivalAt: row.arrival_at.toISOString(),
      priceCents: row.price_cents,
      currency: row.currency,
      status: row.status,
      delayMinutes: row.delay_minutes,
      soldOut: row.sold_out,
      availableSeats: row.available_seats,
      version: Number(row.version),
    };
  }
}
