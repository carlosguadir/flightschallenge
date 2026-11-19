import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'SEAT_UNAVAILABLE',
  'HOLD_EXPIRED',
  'HOLD_LIMIT',
  'IDEMPOTENCY_CONFLICT',
  'PAYMENT_DECLINED',
  'FLIGHT_NOT_BOOKABLE',
  'FLIGHT_NOT_FOUND',
  'NOT_FOUND',
  'INVALID_STATUS_TRANSITION',
  'BOOKING_NOT_FOUND',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export const ERROR_CODES = ErrorCodeSchema.enum;

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
