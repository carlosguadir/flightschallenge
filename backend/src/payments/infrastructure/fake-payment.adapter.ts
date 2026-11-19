import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../config/config';
import type { PaymentCommand, PaymentPort, PaymentResult } from '../application/ports/payment.port';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class FakePaymentAdapter implements PaymentPort {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async charge(command: PaymentCommand): Promise<PaymentResult> {
    if (this.config.paymentDelayMs > 0) {
      await sleep(this.config.paymentDelayMs);
    }

    if (command.method === 'TEST_DECLINE') {
      return { status: 'DECLINED', reference: `fake_declined_${randomUUID()}` };
    }

    return { status: 'APPROVED', reference: `fake_approved_${randomUUID()}` };
  }
}
