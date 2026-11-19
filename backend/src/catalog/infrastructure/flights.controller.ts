import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  FlightSearchQuerySchema,
  type FlightSearchQuery,
  type FlightSummary,
} from '@flight/shared';

import { GetFlightDetail } from '../application/use-cases/get-flight-detail.use-case';
import { SearchFlights } from '../application/use-cases/search-flights.use-case';
import { ZodValidationPipe } from '../../validation/zod-validation.pipe';

@Controller('flights')
export class FlightsController {
  constructor(
    private readonly searchFlights: SearchFlights,
    private readonly getFlightDetail: GetFlightDetail,
  ) {}

  @Get()
  search(
    @Query(new ZodValidationPipe(FlightSearchQuerySchema)) query: FlightSearchQuery,
  ): Promise<FlightSummary[]> {
    return this.searchFlights.execute(query);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) flightId: string): Promise<FlightSummary> {
    return this.getFlightDetail.execute(flightId);
  }
}
