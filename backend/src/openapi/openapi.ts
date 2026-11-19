import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import {
  ApiErrorSchema,
  BookingLookupRequestSchema,
  BookingLookupResponseSchema,
  BookingRequestSchema,
  BookingResponseSchema,
  FlightMetricsSchema,
  FlightSearchQuerySchema,
  FlightSummarySchema,
  HoldResponseSchema,
  IdempotencyKeySchema,
  SeatMapSchema,
  UpdateFlightStatusRequestSchema,
  UpdateFlightStatusResponseSchema,
} from '@flight/shared';
import { z } from 'zod';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const ApiError = registry.register('ApiError', ApiErrorSchema);
const FlightSummary = registry.register('FlightSummary', FlightSummarySchema);
const SeatMap = registry.register('SeatMap', SeatMapSchema);
const FlightMetrics = registry.register('FlightMetrics', FlightMetricsSchema);
const HoldResponse = registry.register('HoldResponse', HoldResponseSchema);
const BookingRequest = registry.register('BookingRequest', BookingRequestSchema);
const BookingResponse = registry.register('BookingResponse', BookingResponseSchema);
const BookingLookupRequest = registry.register('BookingLookupRequest', BookingLookupRequestSchema);
const BookingLookupResponse = registry.register(
  'BookingLookupResponse',
  BookingLookupResponseSchema,
);
const UpdateFlightStatusRequest = registry.register(
  'UpdateFlightStatusRequest',
  UpdateFlightStatusRequestSchema,
);
const UpdateFlightStatusResponse = registry.register(
  'UpdateFlightStatusResponse',
  UpdateFlightStatusResponseSchema,
);
const HealthResponse = registry.register(
  'HealthResponse',
  z.object({
    status: z.literal('ok'),
    db: z.literal('up'),
    realtime: z.literal('up'),
  }),
);

registry.registerComponent('securitySchemes', 'sessionCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: 'sid',
  description:
    'Signed HttpOnly session cookie issued by the first same-origin API call. Swagger UI cannot edit it directly; open /api/health first so the browser receives it.',
});

const flightIdParams = z.object({
  id: z.string().uuid().openapi({ description: 'Flight id' }),
});

const seatParams = z.object({
  id: z.string().uuid().openapi({ description: 'Flight id' }),
  seatId: z.string().uuid().openapi({ description: 'Seat id' }),
});

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ApiError } },
});

registry.registerPath({
  method: 'get',
  path: '/api/health',
  tags: ['Health'],
  summary: 'Check database and realtime gateway readiness',
  security: [],
  responses: {
    200: {
      description: 'The API is ready',
      content: { 'application/json': { schema: HealthResponse } },
    },
    503: errorResponse('Database or realtime gateway is unavailable'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/flights',
  tags: ['Flights'],
  summary: 'Search flights',
  security: [],
  request: { query: FlightSearchQuerySchema },
  responses: {
    200: {
      description: 'Matching flights',
      content: { 'application/json': { schema: z.array(FlightSummary) } },
    },
    400: errorResponse('Invalid search query'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/flights/{id}',
  tags: ['Flights'],
  summary: 'Get a flight',
  security: [],
  request: { params: flightIdParams },
  responses: {
    200: {
      description: 'Flight detail',
      content: { 'application/json': { schema: FlightSummary } },
    },
    404: errorResponse('Flight not found'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/flights/{id}/seats',
  tags: ['Seats'],
  summary: 'Get the seat map snapshot',
  security: [],
  request: { params: flightIdParams },
  responses: {
    200: {
      description: 'Seat map with server time and version',
      content: { 'application/json': { schema: SeatMap } },
    },
    404: errorResponse('Flight not found'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/flights/{id}/metrics',
  tags: ['Insights'],
  summary: 'Get flight occupancy metrics',
  security: [],
  request: { params: flightIdParams },
  responses: {
    200: {
      description: 'Current metrics',
      content: { 'application/json': { schema: FlightMetrics } },
    },
    404: errorResponse('Flight not found'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/flights/{id}/seats/{seatId}/hold',
  tags: ['Seats'],
  summary: 'Hold a seat',
  description:
    'Idempotent for the owning session. The maximum is four active holds per session and flight.',
  security: [{ sessionCookie: [] }],
  request: { params: seatParams },
  responses: {
    200: {
      description: 'Seat held or existing hold returned',
      content: { 'application/json': { schema: HoldResponse } },
    },
    404: errorResponse('Flight not found'),
    409: errorResponse('SEAT_UNAVAILABLE, HOLD_LIMIT or FLIGHT_NOT_BOOKABLE; see the error code'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/flights/{id}/seats/{seatId}/hold',
  tags: ['Seats'],
  summary: 'Release a held seat',
  security: [{ sessionCookie: [] }],
  request: { params: seatParams },
  responses: {
    204: { description: 'Hold released' },
    404: errorResponse('Flight not found'),
    409: errorResponse('Seat is not held by this session'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/bookings',
  tags: ['Bookings'],
  summary: 'Confirm one reservation for one to four held seats',
  description:
    'Requires an Idempotency-Key UUID. All seatIds must be held by the same session and flight. The whole reservation is all-or-nothing and returns one code and the total amount. The first confirmation returns 201; a replay with the same payload returns 200.',
  security: [{ sessionCookie: [] }],
  request: {
    headers: z.object({
      'idempotency-key': IdempotencyKeySchema.describe('Client-generated UUID'),
    }),
    body: { content: { 'application/json': { schema: BookingRequest } } },
  },
  responses: {
    201: {
      description: 'Booking created',
      content: { 'application/json': { schema: BookingResponse } },
    },
    200: {
      description: 'Idempotent replay of the original booking',
      content: { 'application/json': { schema: BookingResponse } },
    },
    400: errorResponse('Invalid body or Idempotency-Key'),
    402: errorResponse('PAYMENT_DECLINED'),
    404: errorResponse('Flight not found'),
    409: errorResponse('SEAT_UNAVAILABLE, IDEMPOTENCY_CONFLICT or FLIGHT_NOT_BOOKABLE'),
    410: errorResponse('HOLD_EXPIRED'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/bookings/lookup',
  tags: ['Bookings'],
  summary: 'Look up a ticket by code and passenger email',
  security: [],
  request: {
    body: { content: { 'application/json': { schema: BookingLookupRequest } } },
  },
  responses: {
    200: {
      description: 'Ticket details',
      content: { 'application/json': { schema: BookingLookupResponse } },
    },
    400: errorResponse('Invalid code or email'),
    404: errorResponse('BOOKING_NOT_FOUND; same response for a wrong code or email'),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/admin/flights/{id}/status',
  tags: ['Admin'],
  summary: 'Change the operational flight status',
  description: 'Open in the demo. CANCELLED is terminal and DELAYED requires delayMinutes.',
  security: [],
  request: {
    params: flightIdParams,
    body: { content: { 'application/json': { schema: UpdateFlightStatusRequest } } },
  },
  responses: {
    200: {
      description: 'Updated flight status',
      content: { 'application/json': { schema: UpdateFlightStatusResponse } },
    },
    400: errorResponse('Invalid status payload'),
    404: errorResponse('Flight not found'),
    409: errorResponse('INVALID_STATUS_TRANSITION'),
  },
});

export function buildOpenApiDocument(
  appVersion: string,
): ReturnType<OpenApiGeneratorV3['generateDocument']> {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Flight Booking API',
      version: appVersion,
      description:
        'REST API for flight search, seat holds, booking and realtime metrics. Mutations use the same-origin signed session cookie. Errors use the shared `{code, message, details?}` shape.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Health', description: 'Readiness checks' },
      { name: 'Flights', description: 'Search and flight detail' },
      { name: 'Seats', description: 'Seat map and hold lifecycle' },
      { name: 'Bookings', description: 'Booking, payment and lookup' },
      { name: 'Insights', description: 'Occupancy metrics' },
      { name: 'Admin', description: 'Operational flight status' },
    ],
  });
}
