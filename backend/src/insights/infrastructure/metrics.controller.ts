import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { FlightMetrics } from '@flight/shared';

import { GetMetrics } from '../application/use-cases/get-metrics.use-case';

@Controller('flights')
export class MetricsController {
  constructor(private readonly getMetrics: GetMetrics) {}

  @Get(':id/metrics')
  metrics(@Param('id', ParseUUIDPipe) flightId: string): Promise<FlightMetrics> {
    return this.getMetrics.execute(flightId);
  }
}
