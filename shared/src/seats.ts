import { z } from 'zod';

import { FlightStatusSchema } from './flights';

export const SEAT_STATUSES = ['AVAILABLE', 'HELD', 'BOOKED'] as const;
export const SEAT_CLASSES = ['ECONOMY', 'BUSINESS'] as const;

export const SeatStatusSchema = z.enum(SEAT_STATUSES);
export type SeatStatus = z.infer<typeof SeatStatusSchema>;

export const SeatClassSchema = z.enum(SEAT_CLASSES);
export type SeatClass = z.infer<typeof SeatClassSchema>;

export const SeatSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  row: z.number().int().positive(),
  col: z.string().length(1),
  class: SeatClassSchema,
  priceCents: z.number().int().nonnegative(),
  status: SeatStatusSchema,
  isMine: z.boolean(),
  expiresAt: z.string().nullable(),
});

export type Seat = z.infer<typeof SeatSchema>;

export const SeatMapSchema = z.object({
  flightId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  status: FlightStatusSchema,
  delayMinutes: z.number().int().nonnegative(),
  soldOut: z.boolean(),
  availableSeats: z.number().int().nonnegative(),
  serverTime: z.string(),
  holdTtlSeconds: z.number().int().positive(),
  seats: z.array(SeatSchema),
});

export type SeatMap = z.infer<typeof SeatMapSchema>;

export const HoldResponseSchema = z.object({
  seatId: z.string().uuid(),
  expiresAt: z.string(),
  version: z.number().int().nonnegative(),
});

export type HoldResponse = z.infer<typeof HoldResponseSchema>;
