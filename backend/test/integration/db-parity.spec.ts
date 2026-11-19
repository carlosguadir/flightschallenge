import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FLIGHT_STATUSES, SEAT_STATUSES } from '@flight/shared';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PG_POOL } from '../../src/database/database.tokens';
import { PRIMARY_TEST_FLIGHT, seedFlightId } from '../../src/database/seed';
import { isValidSeatShape } from '../../src/reservations/domain/seat-state';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

const FUTURE_HOLD = new Date(Date.now() + 60_000);

function isCheckViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23514';
}

describe('10.20 DB parity', () => {
  let app: INestApplication;
  let pool: Pool;
  let flightId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    pool = app.get<Pool>(PG_POOL);
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('validates every seat state shape exactly like the DB CHECK', async () => {
    const client = await pool.connect();
    let index = 0;

    try {
      await client.query('BEGIN');

      for (const status of SEAT_STATUSES) {
        for (const heldBySession of [null, 'session-1']) {
          for (const holdExpiresAt of [null, FUTURE_HOLD]) {
            for (const bookingId of [null, randomUUID()]) {
              index += 1;
              const shape = { status, heldBySession, holdExpiresAt, bookingId };
              const expected = isValidSeatShape(shape);

              await client.query('SAVEPOINT seat_shape');
              let accepted = true;
              try {
                await client.query(
                  `INSERT INTO seats (
                     id, flight_id, seat_row, seat_col, label, class, price_cents,
                     status, held_by_session, hold_expires_at, booking_id
                   ) VALUES ($1, $2, 90, 'A', $3, 'ECONOMY', 1000, $4, $5, $6, $7)`,
                  [
                    randomUUID(),
                    flightId,
                    `T${index}`,
                    status,
                    heldBySession,
                    holdExpiresAt,
                    bookingId,
                  ],
                );
              } catch (error) {
                if (!isCheckViolation(error)) throw error;
                accepted = false;
              }
              await client.query('ROLLBACK TO SAVEPOINT seat_shape');

              expect({ shape, accepted }).toEqual({ shape, accepted: expected });
            }
          }
        }
      }
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('accepts exactly the flight statuses allowed by the DB CHECK', async () => {
    const client = await pool.connect();
    const values: string[] = [...FLIGHT_STATUSES, 'SOLD_OUT'];

    try {
      await client.query('BEGIN');

      for (const value of values) {
        await client.query('SAVEPOINT flight_status');
        let accepted = true;
        try {
          await client.query('UPDATE flights SET status = $1 WHERE id = $2', [value, flightId]);
        } catch (error) {
          if (!isCheckViolation(error)) throw error;
          accepted = false;
        }
        await client.query('ROLLBACK TO SAVEPOINT flight_status');

        expect({ value, accepted }).toEqual({
          value,
          accepted: (FLIGHT_STATUSES as readonly string[]).includes(value),
        });
      }
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
