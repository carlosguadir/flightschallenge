import { Module } from '@nestjs/common';
import { Pool } from 'pg';

import { APP_CONFIG, type AppConfig } from '../config/config';
import { DatabaseService } from './database.service';
import { PG_POOL } from './database.tokens';

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
