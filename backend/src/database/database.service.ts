import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';

import { APP_CONFIG, type AppConfig } from '../config/config';
import { PG_POOL } from './database.tokens';
import { runMigrations } from './migrate';
import { seedDatabase } from './seed';

const SEED_ENVIRONMENTS = new Set<AppConfig['nodeEnv']>(['development', 'staging', 'test', 'e2e']);

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async migrate(): Promise<string[]> {
    return runMigrations(this.pool);
  }

  async seed(): Promise<void> {
    if (!SEED_ENVIRONMENTS.has(this.config.nodeEnv)) {
      return;
    }
    await seedDatabase(this.pool);
  }

  async migrateAndSeed(): Promise<void> {
    await this.migrate();
    await this.seed();
  }

  async reset(): Promise<void> {
    if (!SEED_ENVIRONMENTS.has(this.config.nodeEnv)) {
      throw new Error('Test reset is disabled outside development/test/e2e/staging');
    }
    await this.pool.query(
      'TRUNCATE booking_seats, bookings, seats, flights RESTART IDENTITY CASCADE',
    );
    await seedDatabase(this.pool);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
