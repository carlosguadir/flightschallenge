import 'reflect-metadata';

import { Logger } from 'nestjs-pino';

import { createApplication } from './app.factory';
import { loadConfig } from './config/config';
import { DatabaseService } from './database/database.service';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await createApplication(config);
  const logger = app.get(Logger);
  const database = app.get(DatabaseService);

  const applied = await database.migrate();
  await database.seed();
  if (applied.length > 0) {
    logger.log(`Applied migrations: ${applied.join(', ')}`);
  }

  await app.listen(config.port, '0.0.0.0');
  logger.log(`API listening on port ${config.port}`);
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
