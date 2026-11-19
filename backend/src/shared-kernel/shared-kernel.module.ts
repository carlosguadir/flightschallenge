import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { CLOCK } from './application/ports/clock.port';
import { EVENT_PUBLISHER } from './application/ports/event-publisher.port';
import { UNIT_OF_WORK } from './application/ports/unit-of-work.port';
import { InProcessEventBus } from './infrastructure/in-process-event-bus';
import { PostCommitEventPublisher } from './infrastructure/post-commit-event-publisher';
import { PostgresUnitOfWork } from './infrastructure/postgres-unit-of-work';
import { SystemClock } from './infrastructure/system-clock';

@Module({
  imports: [DatabaseModule],
  providers: [
    InProcessEventBus,
    PostCommitEventPublisher,
    SystemClock,
    PostgresUnitOfWork,
    { provide: EVENT_PUBLISHER, useExisting: PostCommitEventPublisher },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: UNIT_OF_WORK, useExisting: PostgresUnitOfWork },
  ],
  exports: [InProcessEventBus, PostCommitEventPublisher, EVENT_PUBLISHER, CLOCK, UNIT_OF_WORK],
})
export class SharedKernelModule {}
