import { z } from 'zod';

export const PaymentMethodSchema = z.enum(['TEST_OK', 'TEST_DECLINE']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const PassengerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
});

export type Passenger = z.infer<typeof PassengerSchema>;

export const BookingRequestSchema = z.object({
  flightId: z.string().uuid(),
  seatId: z.string().uuid(),
  passenger: PassengerSchema,
  payment: z.object({ method: PaymentMethodSchema }),
});

export type BookingRequest = z.infer<typeof BookingRequestSchema>;

export const BookingResponseSchema = z.object({
  code: z.string().length(6),
  flightId: z.string().uuid(),
  seatId: z.string().uuid(),
  seatLabel: z.string(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  passenger: PassengerSchema,
  createdAt: z.string(),
});

export type BookingResponse = z.infer<typeof BookingResponseSchema>;

export const BookingLookupRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6)
    .transform((value) => value.toUpperCase()),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
});

export type BookingLookupRequest = z.infer<typeof BookingLookupRequestSchema>;

export const BookingLookupResponseSchema = z.object({
  code: z.string().length(6),
  flightId: z.string().uuid(),
  flightNumber: z.string(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  departureAt: z.string(),
  seatLabel: z.string(),
  passengerName: z.string(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  createdAt: z.string(),
});

export type BookingLookupResponse = z.infer<typeof BookingLookupResponseSchema>;

export const IdempotencyKeySchema = z.string().uuid();
