import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ServerEvent } from '@flight/shared';

import { APP_CONFIG, type AppConfig } from '../config/config';
import { GetMetrics } from '../insights';
import { InProcessEventBus } from '../shared-kernel';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeEventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeEventPublisher.name);
  private readonly metricsTimers = new Map<string, NodeJS.Timeout>();
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly bus: InProcessEventBus,
    private readonly gateway: RealtimeGateway,
    private readonly getMetrics: GetMetrics,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.bus.subscribe((event) => this.handle(event));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    for (const timer of this.metricsTimers.values()) {
      clearTimeout(timer);
    }
    this.metricsTimers.clear();
  }

  private handle(event: ServerEvent): void {
    this.gateway.emitToFlight(event.payload.flightId, event.name, event.payload);

    if (event.name === 'flight.updated') {
      this.gateway.emitToSearch(event.name, event.payload);
    }

    this.scheduleMetrics(event.payload.flightId);
  }

  private scheduleMetrics(flightId: string): void {
    if (this.metricsTimers.has(flightId)) return;

    const timer = setTimeout(() => {
      this.metricsTimers.delete(flightId);
      void this.emitMetrics(flightId);
    }, this.config.metricsBatchMs);

    timer.unref();
    this.metricsTimers.set(flightId, timer);
  }

  private async emitMetrics(flightId: string): Promise<void> {
    try {
      const metrics = await this.getMetrics.execute(flightId);
      this.gateway.emitToFlight(flightId, 'flight.metrics', metrics);
    } catch (error) {
      this.logger.warn(
        `Could not emit metrics for ${flightId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
