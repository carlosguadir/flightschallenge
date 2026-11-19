export function secondsRemaining(
  expiresAt: string,
  serverOffsetMs: number,
  nowMs: number = Date.now(),
): number {
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) return 0;
  return Math.max(0, Math.ceil((expiresAtMs - (nowMs + serverOffsetMs)) / 1000));
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function isExpiringSoon(totalSeconds: number): boolean {
  return totalSeconds > 0 && totalSeconds <= 60;
}
