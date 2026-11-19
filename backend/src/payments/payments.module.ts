import { Module } from '@nestjs/common';

import { PAYMENT_PORT } from './application/ports/payment.port';
import { FakePaymentAdapter } from './infrastructure/fake-payment.adapter';

/**
 * TODO implement here payment platform like STRIPE any other
 * Using electronic payments
 */
@Module({
  providers: [FakePaymentAdapter, { provide: PAYMENT_PORT, useExisting: FakePaymentAdapter }],
  exports: [PAYMENT_PORT],
})
export class PaymentsModule {}
