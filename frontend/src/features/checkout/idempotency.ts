export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredKey {
  key: string;
  fingerprint: string;
}

const PREFIX = 'flight-booking:idempotency:';

/**
 * `crypto.randomUUID` is restricted to secure contexts, so it is missing when
 * the app is served over plain HTTP under a non-localhost hostname (for
 * example the Playwright container talking to nginx). `getRandomValues` has no
 * such restriction; Math.random is only the last-resort fallback.
 */
export function generateIdempotencyKey(): string {
  const cryptoApi = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function storageKey(flightId: string, seatId: string): string {
  return `${PREFIX}${flightId}:${seatId}`;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(storage: StorageLike | null, key: string): StoredKey | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredKey>;
    if (typeof parsed.key === 'string' && typeof parsed.fingerprint === 'string') {
      return { key: parsed.key, fingerprint: parsed.fingerprint };
    }
    return null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null, key: string, value: StoredKey): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or quota errors: fall back to an ephemeral key.
  }
}

export function bookingFingerprint(input: {
  seatId: string;
  passengerName: string;
  passengerEmail: string;
  paymentMethod: string;
}): string {
  return JSON.stringify({
    seatId: input.seatId,
    passengerName: input.passengerName.trim(),
    passengerEmail: input.passengerEmail.trim().toLowerCase(),
    paymentMethod: input.paymentMethod,
  });
}

export function getOrCreateIdempotencyKey(
  flightId: string,
  seatId: string,
  fingerprint: string,
  storage: StorageLike | null = defaultStorage(),
  generate: () => string = generateIdempotencyKey,
): string {
  const key = storageKey(flightId, seatId);
  const stored = read(storage, key);
  if (stored && stored.fingerprint === fingerprint) {
    return stored.key;
  }

  const generated = generate();
  write(storage, key, { key: generated, fingerprint });
  return generated;
}

export function clearIdempotencyKey(
  flightId: string,
  seatId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(storageKey(flightId, seatId));
  } catch {
    // Ignore storage failures.
  }
}
