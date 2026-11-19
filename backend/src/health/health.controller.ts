import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @SkipThrottle()
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }
    return { status: 'ok', db: 'up' };
  }
}
