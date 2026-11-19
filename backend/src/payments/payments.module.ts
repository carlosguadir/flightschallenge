import { Module } from '@nestjs/common';

/**
 * Phase 2: PaymentPort + fake payment adapter (TEST_OK / TEST_DECLINE).
 * Kept as an explicit module boundary from phase 0.
 */
@Module({})
export class PaymentsModule {}
