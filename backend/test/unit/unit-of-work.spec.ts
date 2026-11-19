import type { ServerEvent } from '@flight/shared';
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/config';
import { InProcessEventBus } from '../../src/shared-kernel/infrastructure/in-process-event-bus';
import { PostCommitEventPublisher } from '../../src/shared-kernel/infrastructure/post-commit-event-publisher';
import { PostgresUnitOfWork } from '../../src/shared-kernel/infrastructure/postgres-unit-of-work';

class FakeClient {
  readonly calls: string[] = [];

  constructor(private readonly sweeperLocked = true) {}

  async query<T>(text: string): Promise<{ rows: T[]; rowCount: number }> {
    this.calls.push(text);

    if (text.includes('pg_try_advisory_xact_lock')) {
      return {
        rows: [{ locked: this.sweeperLocked }] as T[],
        rowCount: 1,
      };
    }

    return { rows: [], rowCount: 0 };
  }

  release(): void {
    // no-op
  }
}

function buildUnitOfWork(client: FakeClient): {
  unitOfWork: PostgresUnitOfWork;
  events: ServerEvent[];
  publisher: PostCommitEventPublisher;
} {
  const pool = {
    connect: async (): Promise<PoolClient> => client as unknown as PoolClient,
  } as unknown as Pool;
  const bus = new InProcessEventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((event) => events.push(event));
  const publisher = new PostCommitEventPublisher(bus);
  const config = loadConfig({ NODE_ENV: 'test' });
  const unitOfWork = new PostgresUnitOfWork(pool, config, publisher);

  return { unitOfWork, events, publisher };
}

const event: ServerEvent = {
  name: 'seat.held',
  payload: {
    flightId: '11111111-1111-4111-8111-111111111111',
    seatId: '22222222-2222-4222-8222-222222222222',
    label: '1A',
    expiresAt: '2026-12-01T00:00:00.000Z',
    version: 1,
  },
};

describe('10.22 Unit of Work retries', () => {
  it('retries transient errors and publishes events only after commit', async () => {
    const client = new FakeClient();
    const { unitOfWork, events, publisher } = buildUnitOfWork(client);
    let attempts = 0;

    const result = await unitOfWork.runInFlightTransaction('flight-1', async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('serialization failure'), { code: '40001' });
      }
      publisher.publish(event);
      return 'committed';
    });

    expect(result).toBe('committed');
    expect(attempts).toBe(2);
    expect(events).toEqual([event]);
    expect(client.calls.filter((call) => call === 'BEGIN')).toHaveLength(2);
    expect(client.calls.filter((call) => call === 'ROLLBACK')).toHaveLength(1);
    expect(client.calls.filter((call) => call === 'COMMIT')).toHaveLength(1);
  });

  it('does not publish events when the transaction rolls back', async () => {
    const client = new FakeClient();
    const { unitOfWork, events, publisher } = buildUnitOfWork(client);

    await expect(
      unitOfWork.runInFlightTransaction('flight-1', async () => {
        publisher.publish(event);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(events).toHaveLength(0);
    expect(client.calls.filter((call) => call === 'COMMIT')).toHaveLength(0);
  });

  it('skips a sweeper tick when another instance owns the lock', async () => {
    const client = new FakeClient(false);
    const { unitOfWork } = buildUnitOfWork(client);
    let workCalled = false;

    const result = await unitOfWork.runSweeperTransaction(async () => {
      workCalled = true;
      return 'swept';
    });

    expect(result).toBeNull();
    expect(workCalled).toBe(false);
    expect(client.calls.filter((call) => call === 'ROLLBACK')).toHaveLength(1);
  });
});
