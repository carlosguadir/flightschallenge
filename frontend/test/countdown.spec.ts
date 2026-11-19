import { describe, expect, it } from 'vitest';

import {
  formatCountdown,
  isExpiringSoon,
  secondsRemaining,
} from '../src/features/seatmap/countdown';

describe('hold countdown', () => {
  it('uses the server offset instead of the client clock', () => {
    const expiresAt = '2026-12-01T00:05:00.000Z';
    const now = Date.parse('2026-12-01T00:00:00.000Z');

    expect(secondsRemaining(expiresAt, 0, now)).toBe(300);
    expect(secondsRemaining(expiresAt, 1000, now)).toBe(299);
    expect(secondsRemaining(expiresAt, -5000, now)).toBe(305);
    expect(secondsRemaining(expiresAt, 0, now + 300_000)).toBe(0);
  });

  it('formats minutes and seconds with padding', () => {
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(3599)).toBe('59:59');
    expect(formatCountdown(-10)).toBe('0:00');
  });

  it('marks the last minute as expiring soon', () => {
    expect(isExpiringSoon(61)).toBe(false);
    expect(isExpiringSoon(60)).toBe(true);
    expect(isExpiringSoon(1)).toBe(true);
    expect(isExpiringSoon(0)).toBe(false);
  });
});
