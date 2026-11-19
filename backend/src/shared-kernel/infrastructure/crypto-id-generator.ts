import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { IdGenerator } from '../application/ports/id-generator.port';

// 32 characters, no ambiguous I/O/1/0.
const BOOKING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class CryptoIdGenerator implements IdGenerator {
  uuid(): string {
    return randomUUID();
  }

  bookingCode(): string {
    const bytes = randomBytes(6);
    let code = '';
    for (const byte of bytes) {
      code += BOOKING_CODE_ALPHABET[byte & 31];
    }
    return code;
  }
}
