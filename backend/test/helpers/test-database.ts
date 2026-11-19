import { Client } from 'pg';

const RETRY_ATTEMPTS = 30;
const RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function testDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? 'postgres://flight:flight@localhost:5432/app_test';
}

export async function ensureTestDatabase(): Promise<void> {
  const target = new URL(testDatabaseUrl());
  const databaseName = target.pathname.replace(/^\//, '');

  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unsafe test database name: ${databaseName}`);
  }

  const adminUrl = new URL(target.toString());
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt += 1) {
    try {
      await admin.connect();
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      await sleep(RETRY_DELAY_MS);
    }
  }

  if (lastError) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Could not connect to the test database');
  }

  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }
}
