import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bookingFingerprint,
  clearIdempotencyKey,
  generateIdempotencyKey,
  getOrCreateIdempotencyKey,
  type StorageLike,
} from '../src/features/checkout/idempotency';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('booking idempotency key lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reuses a key for the same payload and rotates when the payload changes', () => {
    const storage = new MemoryStorage();
    let counter = 0;
    const generate = (): string => `key-${(counter += 1)}`;
    const flightId = '11111111-1111-4111-8111-111111111111';
    const seatId = '22222222-2222-4222-8222-222222222222';

    const fingerprint = bookingFingerprint({
      seatId,
      passengerName: 'Ada Lovelace',
      passengerEmail: 'ada@example.com',
      paymentMethod: 'TEST_OK',
    });

    expect(getOrCreateIdempotencyKey(flightId, seatId, fingerprint, storage, generate)).toBe(
      'key-1',
    );
    expect(getOrCreateIdempotencyKey(flightId, seatId, fingerprint, storage, generate)).toBe(
      'key-1',
    );

    const declined = bookingFingerprint({
      seatId,
      passengerName: 'Ada Lovelace',
      passengerEmail: 'ada@example.com',
      paymentMethod: 'TEST_DECLINE',
    });
    expect(getOrCreateIdempotencyKey(flightId, seatId, declined, storage, generate)).toBe('key-2');
  });

  it('clears the stored key after a successful booking', () => {
    const storage = new MemoryStorage();
    const flightId = '11111111-1111-4111-8111-111111111111';
    const seatId = '22222222-2222-4222-8222-222222222222';
    const fingerprint = 'fingerprint';

    const first = getOrCreateIdempotencyKey(flightId, seatId, fingerprint, storage, () => 'key-1');
    expect(first).toBe('key-1');

    clearIdempotencyKey(flightId, seatId, storage);
    const second = getOrCreateIdempotencyKey(flightId, seatId, fingerprint, storage, () => 'key-2');
    expect(second).toBe('key-2');
  });

  it('generates a UUID v4 without relying on the secure-context randomUUID', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });

    const key = generateIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('normalizes passenger data in the fingerprint', () => {
    const left = bookingFingerprint({
      seatId: 'seat',
      passengerName: '  Ada  ',
      passengerEmail: 'ADA@EXAMPLE.COM',
      paymentMethod: 'TEST_OK',
    });
    const right = bookingFingerprint({
      seatId: 'seat',
      passengerName: 'Ada',
      passengerEmail: 'ada@example.com',
      paymentMethod: 'TEST_OK',
    });

    expect(left).toBe(right);
  });
});
