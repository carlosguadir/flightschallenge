export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'e2e' | 'staging' | 'production';
  port: number;
  databaseUrl: string;
  cookieSecret: string;
  cookieSecure: boolean;
  trustProxy: number;
  seatHoldTtlSeconds: number;
  maxHoldsPerFlight: number;
  paymentDelayMs: number;
  pgPoolMax: number;
  lockTimeoutMs: number;
  statementTimeoutMs: number;
  throttleEnabled: boolean;
  throttleLimit: number;
  throttleTtlSeconds: number;
  metricsBatchMs: number;
  logLevel: string;
  logPretty: boolean;
  appVersion: string;
  testResetToken: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

function readInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer environment value: ${value}`);
  }
  return parsed;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function readNodeEnv(value: string | undefined): AppConfig['nodeEnv'] {
  const allowed: AppConfig['nodeEnv'][] = ['development', 'test', 'e2e', 'staging', 'production'];
  const normalized = (value ?? 'development') as AppConfig['nodeEnv'];
  if (!allowed.includes(normalized)) {
    throw new Error(`Invalid NODE_ENV: ${value}`);
  }
  return normalized;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = readNodeEnv(env.NODE_ENV);
  const cookieSecret = env.COOKIE_SECRET ?? 'dev-only-cookie-secret-change-me';

  if (nodeEnv === 'production' && cookieSecret === 'dev-only-cookie-secret-change-me') {
    throw new Error('COOKIE_SECRET must be set in production');
  }

  return {
    nodeEnv,
    port: readInt(env.PORT, 3000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://flight:flight@localhost:5432/flight',
    cookieSecret,
    cookieSecure: readBoolean(env.COOKIE_SECURE, false),
    trustProxy: readInt(env.TRUST_PROXY, 0),
    seatHoldTtlSeconds: readInt(env.SEAT_HOLD_TTL_SECONDS, 300),
    maxHoldsPerFlight: readInt(env.MAX_HOLDS_PER_FLIGHT, 4),
    paymentDelayMs: readInt(env.PAYMENT_DELAY_MS, 300),
    pgPoolMax: readInt(env.PG_POOL_MAX, 20),
    lockTimeoutMs: readInt(env.LOCK_TIMEOUT_MS, 2000),
    statementTimeoutMs: readInt(env.STATEMENT_TIMEOUT_MS, 10000),
    throttleEnabled: readBoolean(env.THROTTLE_ENABLED, false),
    throttleLimit: readInt(env.THROTTLE_LIMIT, 100),
    throttleTtlSeconds: readInt(env.THROTTLE_TTL_SECONDS, 60),
    metricsBatchMs: readInt(env.METRICS_BATCH_MS, 75),
    logLevel: env.LOG_LEVEL ?? (nodeEnv === 'test' || nodeEnv === 'e2e' ? 'silent' : 'info'),
    logPretty: readBoolean(env.LOG_PRETTY, nodeEnv === 'development'),
    appVersion: env.APP_VERSION ?? 'dev',
    testResetToken: env.TEST_RESET_TOKEN ?? '',
  };
}
