import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { ExpireHolds } from '../application/use-cases/expire-holds.use-case';

const TICK_INTERVAL_MS = 1000;

@Injectable()
export class HoldExpirySweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HoldExpirySweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly expireHolds: ExpireHolds) {}

  onApplicationBootstrap(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const startedAt = Date.now();

    try {
      const result = await this.expireHolds.execute();
      if (result && result.released > 0) {
        this.logger.log(
          JSON.stringify({
            event: 'sweeper.tick',
            released: result.released,
            lagMs: Date.now() - startedAt,
          }),
        );
      }
    } catch (error) {
      this.logger.error('sweeper.tick failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }
}
