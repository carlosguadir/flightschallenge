import { Inject, Injectable } from '@nestjs/common';
import type { Seat, SeatClass, SeatStatus } from '@flight/shared';
import type { Pool } from 'pg';

import { PG_POOL } from '../../database/database.tokens';
import type { DbTransaction } from '../../shared-kernel/application/ports/unit-of-work.port';
import type {
  AcquireHoldInput,
  AcquiredHold,
  ActiveHold,
  HoldLookupInput,
  ReleasedSeat,
  SeatRepository,
} from '../application/ports/seat-repository.port';

@Injectable()
export class PostgresSeatRepository implements SeatRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findActiveHold(tx: DbTransaction, input: HoldLookupInput): Promise<ActiveHold | null> {
    const result = await tx.query<{
      id: string;
      label: string;
      hold_expires_at: Date;
      flight_version: string;
    }>(
      `SELECT s.id,
              s.label,
              s.hold_expires_at,
              f.version AS flight_version
       FROM seats s
       JOIN flights f ON f.id = s.flight_id
       WHERE s.id = $1
         AND s.flight_id = $2
         AND s.status = 'HELD'
         AND s.held_by_session = $3
         AND s.hold_expires_at > now()`,
      [input.seatId, input.flightId, input.sessionId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      seatId: row.id,
      label: row.label,
      expiresAt: row.hold_expires_at,
      flightVersion: Number(row.flight_version),
    };
  }

  async countActiveHolds(tx: DbTransaction, flightId: string, sessionId: string): Promise<number> {
    const result = await tx.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM seats
       WHERE flight_id = $1
         AND status = 'HELD'
         AND held_by_session = $2
         AND hold_expires_at > now()`,
      [flightId, sessionId],
    );

    return result.rows[0]?.count ?? 0;
  }

  async acquireHold(tx: DbTransaction, input: AcquireHoldInput): Promise<AcquiredHold | null> {
    const result = await tx.query<{
      id: string;
      label: string;
      hold_expires_at: Date;
    }>(
      `UPDATE seats
       SET status = 'HELD',
           held_by_session = $3,
           hold_expires_at = now() + make_interval(secs => $4),
           version = version + 1
       WHERE id = $1
         AND flight_id = $2
         AND (status = 'AVAILABLE'
              OR (status = 'HELD' AND hold_expires_at <= now()))
         AND EXISTS (
           SELECT 1
           FROM flights f
           WHERE f.id = $2
             AND f.status IN ('SCHEDULED', 'DELAYED')
         )
       RETURNING id, label, hold_expires_at`,
      [input.seatId, input.flightId, input.sessionId, input.ttlSeconds],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      seatId: row.id,
      label: row.label,
      expiresAt: row.hold_expires_at,
    };
  }

  async releaseHold(tx: DbTransaction, input: HoldLookupInput): Promise<ReleasedSeat | null> {
    const result = await tx.query<{ id: string; label: string }>(
      `UPDATE seats
       SET status = 'AVAILABLE',
           held_by_session = NULL,
           hold_expires_at = NULL,
           version = version + 1
       WHERE id = $1
         AND flight_id = $2
         AND status = 'HELD'
         AND held_by_session = $3
       RETURNING id, label`,
      [input.seatId, input.flightId, input.sessionId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return { seatId: row.id, label: row.label };
  }

  async listByFlight(flightId: string, sessionId: string): Promise<Seat[]> {
    const result = await this.pool.query<{
      id: string;
      label: string;
      seat_row: number;
      seat_col: string;
      seat_class: SeatClass;
      price_cents: number;
      status: SeatStatus;
      is_mine: boolean;
      hold_expires_at: Date | null;
    }>(
      `SELECT id,
              label,
              seat_row,
              seat_col,
              class AS seat_class,
              price_cents,
              status,
              (status = 'HELD' AND held_by_session = $2 AND hold_expires_at > now()) AS is_mine,
              hold_expires_at
       FROM seats
       WHERE flight_id = $1
       ORDER BY seat_row, seat_col`,
      [flightId, sessionId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      label: row.label,
      row: row.seat_row,
      col: row.seat_col,
      class: row.seat_class,
      priceCents: row.price_cents,
      status: row.status,
      isMine: row.is_mine,
      expiresAt:
        row.status === 'HELD' && row.hold_expires_at ? row.hold_expires_at.toISOString() : null,
    }));
  }
}
