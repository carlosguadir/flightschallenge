import { Inject, Injectable } from '@nestjs/common';
import type { FlightSearchQuery, FlightStatus, FlightSummary } from '@flight/shared';
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

const SUMMARY_SELECT = `
  SELECT f.id,
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
`;

function mapSummary(row: FlightSummaryRow): FlightSummary {
  return {
    id: row.id,
    flightNumber: row.flight_number,
    origin: row.origin.trim(),
    destination: row.destination.trim(),
    departureAt: row.departure_at.toISOString(),
    arrivalAt: row.arrival_at.toISOString(),
    priceCents: row.price_cents,
    currency: row.currency.trim(),
    status: row.status,
    delayMinutes: row.delay_minutes,
    soldOut: row.sold_out,
    availableSeats: row.available_seats,
    version: Number(row.version),
  };
}

@Injectable()
export class PostgresFlightQueryAdapter implements FlightQueryPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getSummary(flightId: string): Promise<FlightSummary> {
    const result = await this.pool.query<FlightSummaryRow>(
      `${SUMMARY_SELECT}
       WHERE f.id = $1
       GROUP BY f.id`,
      [flightId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError('FLIGHT_NOT_FOUND', 404, 'Flight not found');
    }

    return mapSummary(row);
  }

  async search(query: FlightSearchQuery): Promise<FlightSummary[]> {
    const conditions: string[] = [];
    const params: string[] = [];

    if (query.origin) {
      params.push(query.origin.toUpperCase());
      conditions.push(`f.origin = $${params.length}`);
    }

    if (query.destination) {
      params.push(query.destination.toUpperCase());
      conditions.push(`f.destination = $${params.length}`);
    }

    if (query.date) {
      params.push(query.date);
      const placeholder = `$${params.length}`;
      conditions.push(
        `f.departure_at >= (${placeholder}::date::timestamp AT TIME ZONE 'UTC')`,
        `f.departure_at < ((${placeholder}::date::timestamp AT TIME ZONE 'UTC') + interval '1 day')`,
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query<FlightSummaryRow>(
      `${SUMMARY_SELECT}
       ${where}
       GROUP BY f.id
       ORDER BY f.departure_at ASC
       LIMIT 50`,
      params,
    );

    return result.rows.map(mapSummary);
  }
}
