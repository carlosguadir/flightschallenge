import { FLIGHT_STATUSES, type FlightStatus } from '@flight/shared';

export const FLIGHT_STATUS_TRANSITIONS: Record<FlightStatus, readonly FlightStatus[]> = {
  SCHEDULED: ['DELAYED', 'CANCELLED'],
  DELAYED: ['SCHEDULED', 'CANCELLED'],
  CANCELLED: [],
};

export function canTransitionFlightStatus(from: FlightStatus, to: FlightStatus): boolean {
  return FLIGHT_STATUS_TRANSITIONS[from].includes(to);
}

export function isValidFlightStatus(value: string): value is FlightStatus {
  return (FLIGHT_STATUSES as readonly string[]).includes(value);
}
