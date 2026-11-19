import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule, RealtimeModule],
  controllers: [HealthController],
})
export class HealthModule {}
