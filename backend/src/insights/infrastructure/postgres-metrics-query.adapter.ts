import { Inject, Injectable } from '@nestjs/common';
import type { FlightMetrics } from '@flight/shared';
import type { Pool } from 'pg';

import { PG_POOL } from '../../database/database.tokens';
import { AppError } from '../../shared-kernel';
import type { MetricsQueryPort } from '../application/ports/metrics-query.port';

interface MetricsRow {
  version: string;
  total: number;
  available: number;
  held: number;
  booked: number;
}

@Injectable()
export class PostgresMetricsQueryAdapter implements MetricsQueryPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getMetrics(flightId: string): Promise<FlightMetrics> {
    const result = await this.pool.query<MetricsRow>(
      `SELECT f.version,
              count(s.id)::int AS total,
              count(*) FILTER (WHERE s.status = 'AVAILABLE')::int AS available,
              count(*) FILTER (WHERE s.status = 'HELD')::int AS held,
              count(*) FILTER (WHERE s.status = 'BOOKED')::int AS booked
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

    const occupied = row.held + row.booked;
    const occupancyPct = row.total === 0 ? 0 : Math.round((occupied / row.total) * 10_000) / 100;

    return {
      flightId,
      total: row.total,
      available: row.available,
      held: row.held,
      booked: row.booked,
      occupancyPct,
      version: Number(row.version),
    };
  }
}
