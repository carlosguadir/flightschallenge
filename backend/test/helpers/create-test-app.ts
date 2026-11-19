import type { INestApplication } from '@nestjs/common';

import { createApplication } from '../../src/app.factory';
import { loadConfig, type AppConfig } from '../../src/config/config';

export interface TestApplication {
  app: INestApplication;
  config: AppConfig;
}

export async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApplication> {
  const base = loadConfig({ ...process.env, NODE_ENV: 'test' });
  const config: AppConfig = {
    ...base,
    ...overrides,
    nodeEnv: overrides.nodeEnv ?? 'test',
    logLevel: overrides.logLevel ?? 'silent',
  };

  const app = await createApplication(config);
  await app.init();

  return { app, config };
}
