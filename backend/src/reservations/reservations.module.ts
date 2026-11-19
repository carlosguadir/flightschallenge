import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { DatabaseModule } from '../database/database.module';
import { PaymentsModule } from '../payments/payments.module';
import { SharedKernelModule } from '../shared-kernel/shared-kernel.module';
import { BOOKING_REPOSITORY } from './application/ports/booking-repository.port';
import { SEAT_REPOSITORY } from './application/ports/seat-repository.port';
import { AcquireHold } from './application/use-cases/acquire-hold.use-case';
import { ConfirmBooking } from './application/use-cases/confirm-booking.use-case';
import { ExpireHolds } from './application/use-cases/expire-holds.use-case';
import { GetSeatMap } from './application/use-cases/get-seat-map.use-case';
import { LookupBooking } from './application/use-cases/lookup-booking.use-case';
import { ReleaseHold } from './application/use-cases/release-hold.use-case';
import { BookingsController } from './infrastructure/bookings.controller';
import { HoldExpirySweeper } from './infrastructure/hold-expiry.sweeper';
import { PostgresBookingRepository } from './infrastructure/postgres-booking.repository';
import { PostgresSeatRepository } from './infrastructure/postgres-seat.repository';
import { SeatsController } from './infrastructure/seats.controller';

@Module({
  imports: [DatabaseModule, SharedKernelModule, CatalogModule, PaymentsModule],
  controllers: [SeatsController, BookingsController],
  providers: [
    PostgresSeatRepository,
    PostgresBookingRepository,
    { provide: SEAT_REPOSITORY, useExisting: PostgresSeatRepository },
    { provide: BOOKING_REPOSITORY, useExisting: PostgresBookingRepository },
    AcquireHold,
    ReleaseHold,
    GetSeatMap,
    ExpireHolds,
    ConfirmBooking,
    LookupBooking,
    HoldExpirySweeper,
  ],
})
export class ReservationsModule {}
