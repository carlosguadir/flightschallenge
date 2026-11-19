import type { FlightMetrics } from '@flight/shared';

export interface MetricsQueryPort {
  getMetrics(flightId: string): Promise<FlightMetrics>;
}

export const METRICS_QUERY_PORT = Symbol('METRICS_QUERY_PORT');
