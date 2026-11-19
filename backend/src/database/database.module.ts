import { Module } from '@nestjs/common';
import { Pool } from 'pg';

import { APP_CONFIG, type AppConfig } from '../config/config';
import { DatabaseService } from './database.service';
import { PG_POOL } from './database.tokens';

// TODO for db separate connections and permissions
// and admin session should allow run admin actions and a base user session buying tickets should
// only allow necessary actions on DB

/**
 * TODO consider sharding db base on older rows, the system should work with recent data and shard old rows
 * The benefits, faster response when millions of older rows are not spending
 * indexing time for queries and new transactions
 */
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Pool =>
        new Pool({
          connectionString: config.databaseUrl,
          max: config.pgPoolMax,
          application_name: 'flight-backend',
        }),
    },
    DatabaseService,
  ],
  exports: [PG_POOL, DatabaseService],
})
export class DatabaseModule {}
