import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { DatabaseService } from '../database/database.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get()
  @SkipThrottle()
  async check(): Promise<{ status: 'ok'; db: 'up'; realtime: 'up' }> {
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }

    if (!this.realtime.isReady()) {
      throw new ServiceUnavailableException('Realtime gateway is unavailable');
    }

    return { status: 'ok', db: 'up', realtime: 'up' };
  }
}
