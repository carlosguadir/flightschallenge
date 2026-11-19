import { Inject, Injectable } from '@nestjs/common';
import type { FlightMetrics } from '@flight/shared';

import { METRICS_QUERY_PORT, type MetricsQueryPort } from '../ports/metrics-query.port';

@Injectable()
export class GetMetrics {
  constructor(@Inject(METRICS_QUERY_PORT) private readonly metrics: MetricsQueryPort) {}

  execute(flightId: string): Promise<FlightMetrics> {
    return this.metrics.getMetrics(flightId);
  }
}
