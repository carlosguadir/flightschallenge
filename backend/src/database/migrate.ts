import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Pool } from 'pg';

const MIGRATION_FILE = /^\d+.*\.sql$/;

export function resolveMigrationsDir(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.MIGRATIONS_DIR,
    path.resolve(process.cwd(), 'src/database/migrations'),
    path.resolve(process.cwd(), 'backend/src/database/migrations'),
    path.resolve(process.cwd(), 'dist/database/migrations'),
    path.resolve(process.cwd(), 'backend/dist/database/migrations'),
    path.join(__dirname, 'migrations'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Migrations directory not found. Tried: ${candidates.join(', ')}`);
  }
  return found;
}

export async function runMigrations(pool: Pool, explicitDir?: string): Promise<string[]> {
  const migrationsDir = resolveMigrationsDir(explicitDir);
  const files = (await readdir(migrationsDir)).filter((file) => MIGRATION_FILE.test(file)).sort();
  const appliedNow: string[] = [];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['migrations']);
    await client.query(`
      CREATE TABLE IF NOT EXISTS __migrations (
        id text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query<{ id: string; checksum: string }>(
      'SELECT id, checksum FROM __migrations',
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.id, row.checksum]));

    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previousChecksum = applied.get(file);

      if (previousChecksum !== undefined) {
        if (previousChecksum !== checksum) {
          throw new Error(`Migration ${file} was modified after being applied`);
        }
        continue;
      }

      await client.query(sql);
      await client.query('INSERT INTO __migrations (id, checksum) VALUES ($1, $2)', [
        file,
        checksum,
      ]);
      appliedNow.push(file);
    }

    await client.query('COMMIT');
    return appliedNow;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
