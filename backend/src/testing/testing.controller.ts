import { Controller, Headers, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { APP_CONFIG, type AppConfig } from '../config/config';
import { DatabaseService } from '../database/database.service';
import { AppError } from '../shared-kernel';

/**
 * E2E-only reset hook. The module is only registered for NODE_ENV=test|e2e and
 * every call must present the shared token, so it cannot be used accidentally
 * from a normal deployment.
 */
@Controller('test')
export class TestingController {
  constructor(
    private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipThrottle()
  async reset(@Headers('x-test-reset-token') token: string | undefined): Promise<void> {
    if (!this.config.testResetToken || token !== this.config.testResetToken) {
      throw new AppError('NOT_FOUND', 404, 'Not found');
    }

    await this.database.reset();
  }
}
