import type { QueryResult, QueryResultRow } from 'pg';

export interface DbTransaction {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export interface SweeperTransaction extends DbTransaction {
  lockFlight(flightId: string): Promise<void>;
}

export interface UnitOfWork {
  runInFlightTransaction<T>(flightId: string, work: (tx: DbTransaction) => Promise<T>): Promise<T>;
  /**
   * Runs a sweeper tick under the transaction-scoped `sweeper` advisory lock.
   * Returns null when another instance owns the tick.
   */
  runSweeperTransaction<T>(work: (tx: SweeperTransaction) => Promise<T>): Promise<T | null>;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
