import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { TestingController } from './testing.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [TestingController],
})
export class TestingModule {}
