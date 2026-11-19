import type { FlightSearchQuery, FlightSummary } from '@flight/shared';

export interface FlightQueryPort {
  getSummary(flightId: string): Promise<FlightSummary>;
  search(query: FlightSearchQuery): Promise<FlightSummary[]>;
}

export const FLIGHT_QUERY_PORT = Symbol('FLIGHT_QUERY_PORT');
