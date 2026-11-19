import { Module } from '@nestjs/common';

import { PAYMENT_PORT } from './application/ports/payment.port';
import { FakePaymentAdapter } from './infrastructure/fake-payment.adapter';

@Module({
  providers: [FakePaymentAdapter, { provide: PAYMENT_PORT, useExisting: FakePaymentAdapter }],
  exports: [PAYMENT_PORT],
})
export class PaymentsModule {}
