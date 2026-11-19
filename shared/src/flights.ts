import { z } from 'zod';

export const FLIGHT_STATUSES = ['SCHEDULED', 'DELAYED', 'CANCELLED'] as const;

export const FlightStatusSchema = z.enum(FLIGHT_STATUSES);
export type FlightStatus = z.infer<typeof FlightStatusSchema>;

export const FlightSummarySchema = z.object({
  id: z.string().uuid(),
  flightNumber: z.string(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  departureAt: z.string(),
  arrivalAt: z.string(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: FlightStatusSchema,
  delayMinutes: z.number().int().nonnegative(),
  soldOut: z.boolean(),
  availableSeats: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});

export type FlightSummary = z.infer<typeof FlightSummarySchema>;

export const FlightSearchQuerySchema = z.object({
  origin: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  destination: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD')
    .optional(),
});

export type FlightSearchQuery = z.infer<typeof FlightSearchQuerySchema>;

export const UpdateFlightStatusRequestSchema = z
  .object({
    status: FlightStatusSchema,
    delayMinutes: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'DELAYED' && value.delayMinutes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['delayMinutes'],
        message: 'delayMinutes is required when status is DELAYED',
      });
    }
  });

export type UpdateFlightStatusRequest = z.infer<typeof UpdateFlightStatusRequestSchema>;

export const UpdateFlightStatusResponseSchema = z.object({
  flightId: z.string().uuid(),
  status: FlightStatusSchema,
  delayMinutes: z.number().int().nonnegative(),
  soldOut: z.boolean(),
  availableSeats: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});

export type UpdateFlightStatusResponse = z.infer<typeof UpdateFlightStatusResponseSchema>;

export const FlightMetricsSchema = z.object({
  flightId: z.string().uuid(),
  total: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  held: z.number().int().nonnegative(),
  booked: z.number().int().nonnegative(),
  occupancyPct: z.number().min(0).max(100),
  version: z.number().int().nonnegative(),
});

export type FlightMetrics = z.infer<typeof FlightMetricsSchema>;
