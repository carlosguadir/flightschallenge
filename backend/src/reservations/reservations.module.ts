import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { DatabaseModule } from '../database/database.module';
import { SharedKernelModule } from '../shared-kernel/shared-kernel.module';
import { SEAT_REPOSITORY } from './application/ports/seat-repository.port';
import { AcquireHold } from './application/use-cases/acquire-hold.use-case';
import { GetSeatMap } from './application/use-cases/get-seat-map.use-case';
import { ReleaseHold } from './application/use-cases/release-hold.use-case';
import { PostgresSeatRepository } from './infrastructure/postgres-seat.repository';
import { SeatsController } from './infrastructure/seats.controller';

@Module({
  imports: [DatabaseModule, SharedKernelModule, CatalogModule],
  controllers: [SeatsController],
  providers: [
    PostgresSeatRepository,
    { provide: SEAT_REPOSITORY, useExisting: PostgresSeatRepository },
    AcquireHold,
    ReleaseHold,
    GetSeatMap,
  ],
})
export class ReservationsModule {}
