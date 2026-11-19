import { z } from 'zod';

import { FlightMetricsSchema, FlightStatusSchema } from './flights';

export const SERVER_EVENT_NAMES = [
  'flight.updated',
  'seat.held',
  'seat.released',
  'seat.booked',
  'flight.metrics',
] as const;

export const ServerEventNameSchema = z.enum(SERVER_EVENT_NAMES);
export type ServerEventName = z.infer<typeof ServerEventNameSchema>;

export const FlightUpdatedEventSchema = z.object({
  flightId: z.string().uuid(),
  status: FlightStatusSchema,
  delayMinutes: z.number().int().nonnegative(),
  soldOut: z.boolean(),
  availableSeats: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});

export type FlightUpdatedEvent = z.infer<typeof FlightUpdatedEventSchema>;

export const SeatHeldEventSchema = z.object({
  flightId: z.string().uuid(),
  seatId: z.string().uuid(),
  label: z.string(),
  expiresAt: z.string(),
  version: z.number().int().nonnegative(),
});

export type SeatHeldEvent = z.infer<typeof SeatHeldEventSchema>;

export const SeatReleasedEventSchema = z.object({
  flightId: z.string().uuid(),
  seatId: z.string().uuid(),
  label: z.string(),
  reason: z.enum(['USER', 'EXPIRED']),
  version: z.number().int().nonnegative(),
});

export type SeatReleasedEvent = z.infer<typeof SeatReleasedEventSchema>;

export const SeatBookedEventSchema = z.object({
  flightId: z.string().uuid(),
  seatId: z.string().uuid(),
  label: z.string(),
  version: z.number().int().nonnegative(),
});

export type SeatBookedEvent = z.infer<typeof SeatBookedEventSchema>;

export const FlightMetricsEventSchema = FlightMetricsSchema;
export type FlightMetricsEvent = z.infer<typeof FlightMetricsEventSchema>;

export type ServerEvent =
  | { name: 'flight.updated'; payload: FlightUpdatedEvent }
  | { name: 'seat.held'; payload: SeatHeldEvent }
  | { name: 'seat.released'; payload: SeatReleasedEvent }
  | { name: 'seat.booked'; payload: SeatBookedEvent }
  | { name: 'flight.metrics'; payload: FlightMetricsEvent };

export const CLIENT_EVENT_NAMES = ['flight.join', 'flight.leave', 'search.join'] as const;
export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];

export const FlightJoinPayloadSchema = z.object({ flightId: z.string().uuid() });
export type FlightJoinPayload = z.infer<typeof FlightJoinPayloadSchema>;

export const FlightJoinAckSchema = z.object({ ok: z.boolean(), flightId: z.string().uuid() });
export type FlightJoinAck = z.infer<typeof FlightJoinAckSchema>;
