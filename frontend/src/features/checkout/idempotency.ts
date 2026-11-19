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
  generate: () => string = () => crypto.randomUUID(),
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
