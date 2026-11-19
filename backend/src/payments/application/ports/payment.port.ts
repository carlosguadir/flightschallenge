import type { PaymentMethod } from '@flight/shared';

export interface PaymentCommand {
  method: PaymentMethod;
  amountCents: number;
  currency: string;
}

export interface PaymentResult {
  status: 'APPROVED' | 'DECLINED';
  reference: string;
}

export interface PaymentPort {
  charge(command: PaymentCommand): Promise<PaymentResult>;
}

export const PAYMENT_PORT = Symbol('PAYMENT_PORT');
