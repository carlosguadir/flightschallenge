import type {
  BookingLookupRequest,
  BookingLookupResponse,
  BookingRequest,
  BookingResponse,
  ErrorCode,
  FlightMetrics,
  FlightSearchQuery,
  FlightSummary,
  HoldResponse,
  SeatMap,
  UpdateFlightStatusRequest,
  UpdateFlightStatusResponse,
} from '@flight/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  code?: ErrorCode;
  message?: string;
  details?: unknown;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const error = (body ?? {}) as ErrorBody;
    throw new ApiError(
      response.status,
      error.code ?? 'INTERNAL_ERROR',
      error.message ?? `Request failed with ${response.status}`,
      error.details,
    );
  }

  return body as T;
}

function queryString(query: FlightSearchQuery): string {
  const params = new URLSearchParams();
  if (query.origin) params.set('origin', query.origin);
  if (query.destination) params.set('destination', query.destination);
  if (query.date) params.set('date', query.date);
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function getHealth(): Promise<{ status: string; db: string }> {
  return request('/api/health');
}

export function getFlights(query: FlightSearchQuery): Promise<FlightSummary[]> {
  return request(`/api/flights${queryString(query)}`);
}

export function getFlight(flightId: string): Promise<FlightSummary> {
  return request(`/api/flights/${flightId}`);
}

export function getSeatMap(flightId: string): Promise<SeatMap> {
  return request(`/api/flights/${flightId}/seats`);
}

export function holdSeat(flightId: string, seatId: string): Promise<HoldResponse> {
  return request(`/api/flights/${flightId}/seats/${seatId}/hold`, {
    method: 'POST',
  });
}

export async function releaseSeat(flightId: string, seatId: string): Promise<void> {
  await request<null>(`/api/flights/${flightId}/seats/${seatId}/hold`, {
    method: 'DELETE',
  });
}

export function confirmBooking(
  body: BookingRequest,
  idempotencyKey: string,
): Promise<BookingResponse> {
  return request('/api/bookings', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
}

export function lookupBooking(body: BookingLookupRequest): Promise<BookingLookupResponse> {
  return request('/api/bookings/lookup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getMetrics(flightId: string): Promise<FlightMetrics> {
  return request(`/api/flights/${flightId}/metrics`);
}

export function updateFlightStatus(
  flightId: string,
  body: UpdateFlightStatusRequest,
): Promise<UpdateFlightStatusResponse> {
  return request(`/api/admin/flights/${flightId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
