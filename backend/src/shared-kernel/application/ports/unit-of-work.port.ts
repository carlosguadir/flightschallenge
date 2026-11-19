import type { QueryResult, QueryResultRow } from 'pg';

export interface DbTransaction {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export interface UnitOfWork {
  runInFlightTransaction<T>(flightId: string, work: (tx: DbTransaction) => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
