import { Inject, Injectable } from '@nestjs/common';
import type { ServerEvent } from '@flight/shared';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { APP_CONFIG, type AppConfig } from '../../config/config';
import { PG_POOL } from '../../database/database.tokens';
import type { DbTransaction, UnitOfWork } from '../application/ports/unit-of-work.port';
import { PostCommitEventPublisher } from './post-commit-event-publisher';

const MAX_ATTEMPTS = 3;
const TRANSIENT_CODES = new Set(['40001', '40P01', '55P03']);

class PgTransaction implements DbTransaction {
  constructor(private readonly client: PoolClient) {}

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    return this.client.query<T>(text, params as unknown[] | undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === 'string' && TRANSIENT_CODES.has(code);
}

@Injectable()
export class PostgresUnitOfWork implements UnitOfWork {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly publisher: PostCommitEventPublisher,
  ) {}

  async runInFlightTransaction<T>(
    flightId: string,
    work: (tx: DbTransaction) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const pending: ServerEvent[] = [];
      const client = await this.pool.connect();
      let began = false;

      try {
        await client.query('BEGIN');
        began = true;
        await client.query(
          `SELECT set_config('lock_timeout', $1, true),
                  set_config('statement_timeout', $2, true)`,
          [String(this.config.lockTimeoutMs), String(this.config.statementTimeoutMs)],
        );
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`flight:${flightId}`]);

        const result = await this.publisher.collect(pending, () => work(new PgTransaction(client)));
        await client.query('COMMIT');
        this.publisher.flush(pending);
        return result;
      } catch (error) {
        lastError = error;
        if (began) {
          await client.query('ROLLBACK').catch(() => undefined);
        }
        if (isTransient(error) && attempt < MAX_ATTEMPTS - 1) {
          await sleep(50 * 2 ** attempt);
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Transaction failed');
  }
}
