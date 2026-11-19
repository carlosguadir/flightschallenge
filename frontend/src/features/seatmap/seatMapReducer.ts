import type { FlightStatus, Seat, SeatMap, ServerEvent } from '@flight/shared';

export type SeatMapPhase = 'buffering' | 'live';

export interface SeatMapState {
  flightId: string;
  phase: SeatMapPhase;
  version: number;
  seats: Record<string, Seat>;
  order: string[];
  buffer: ServerEvent[];
  selectedSeatId: string | null;
  status: FlightStatus;
  delayMinutes: number;
  soldOut: boolean;
  availableSeats: number;
  holdTtlSeconds: number;
  serverOffsetMs: number;
}

export type SeatMapAction =
  | { type: 'beginBuffering' }
  | { type: 'incoming'; event: ServerEvent }
  | { type: 'snapshot'; snapshot: SeatMap; receivedAtMs: number }
  | { type: 'select'; seatId: string | null }
  | { type: 'holdSucceeded'; seatId: string; expiresAt: string }
  | { type: 'releaseSucceeded'; seatId: string }
  | { type: 'expireSelected' };

const MAX_BUFFER = 200;

export function initialSeatMapState(flightId: string): SeatMapState {
  return {
    flightId,
    phase: 'buffering',
    version: 0,
    seats: {},
    order: [],
    buffer: [],
    selectedSeatId: null,
    status: 'SCHEDULED',
    delayMinutes: 0,
    soldOut: false,
    availableSeats: 0,
    holdTtlSeconds: 300,
    serverOffsetMs: 0,
  };
}

function isStateEvent(event: ServerEvent): boolean {
  return event.name !== 'flight.metrics';
}

function eventVersion(event: ServerEvent): number {
  return event.name === 'flight.metrics' ? 0 : event.payload.version;
}

function deselectIf(state: SeatMapState, seatId: string): string | null {
  return state.selectedSeatId === seatId ? null : state.selectedSeatId;
}

function applyLiveEvent(state: SeatMapState, event: ServerEvent): SeatMapState {
  if (!isStateEvent(event) || event.payload.version <= state.version) {
    return state;
  }

  switch (event.name) {
    case 'seat.held': {
      const seat = state.seats[event.payload.seatId];
      if (!seat) return { ...state, version: event.payload.version };
      return {
        ...state,
        version: event.payload.version,
        seats: {
          ...state.seats,
          [seat.id]: {
            ...seat,
            status: 'HELD',
            expiresAt: event.payload.expiresAt,
          },
        },
      };
    }
    case 'seat.released': {
      const seat = state.seats[event.payload.seatId];
      if (!seat) return { ...state, version: event.payload.version };
      return {
        ...state,
        version: event.payload.version,
        selectedSeatId: deselectIf(state, seat.id),
        seats: {
          ...state.seats,
          [seat.id]: {
            ...seat,
            status: 'AVAILABLE',
            isMine: false,
            expiresAt: null,
          },
        },
      };
    }
    case 'seat.booked': {
      const seat = state.seats[event.payload.seatId];
      if (!seat) return { ...state, version: event.payload.version };
      return {
        ...state,
        version: event.payload.version,
        selectedSeatId: deselectIf(state, seat.id),
        seats: {
          ...state.seats,
          [seat.id]: {
            ...seat,
            status: 'BOOKED',
            isMine: false,
            expiresAt: null,
          },
        },
      };
    }
    case 'flight.updated':
      return {
        ...state,
        version: event.payload.version,
        status: event.payload.status,
        delayMinutes: event.payload.delayMinutes,
        soldOut: event.payload.soldOut,
        availableSeats: event.payload.availableSeats,
      };
    default:
      return state;
  }
}

export function seatMapReducer(state: SeatMapState, action: SeatMapAction): SeatMapState {
  switch (action.type) {
    case 'beginBuffering':
      return { ...state, phase: 'buffering', buffer: [] };

    case 'incoming': {
      if (!isStateEvent(action.event)) return state;
      if (state.phase === 'buffering') {
        return {
          ...state,
          buffer: [...state.buffer, action.event].slice(-MAX_BUFFER),
        };
      }
      return applyLiveEvent(state, action.event);
    }

    case 'snapshot': {
      const seats: Record<string, Seat> = {};
      const order: string[] = [];
      for (const seat of action.snapshot.seats) {
        seats[seat.id] = seat;
        order.push(seat.id);
      }

      const selected = state.selectedSeatId ? seats[state.selectedSeatId] : undefined;
      const selectedSeatId =
        selected &&
        (selected.status === 'AVAILABLE' || (selected.status === 'HELD' && selected.isMine))
          ? selected.id
          : null;

      let next: SeatMapState = {
        ...state,
        phase: 'live',
        version: action.snapshot.version,
        seats,
        order,
        buffer: [],
        status: action.snapshot.status,
        delayMinutes: action.snapshot.delayMinutes,
        soldOut: action.snapshot.soldOut,
        availableSeats: action.snapshot.availableSeats,
        holdTtlSeconds: action.snapshot.holdTtlSeconds,
        serverOffsetMs: Date.parse(action.snapshot.serverTime) - action.receivedAtMs,
        selectedSeatId,
      };

      const buffered = [...state.buffer].sort(
        (left, right) => eventVersion(left) - eventVersion(right),
      );
      for (const event of buffered) {
        next = applyLiveEvent(next, event);
      }

      return next;
    }

    case 'select':
      return { ...state, selectedSeatId: action.seatId };

    case 'holdSucceeded': {
      const seat = state.seats[action.seatId];
      if (!seat) return state;
      return {
        ...state,
        selectedSeatId: action.seatId,
        seats: {
          ...state.seats,
          [seat.id]: {
            ...seat,
            status: 'HELD',
            isMine: true,
            expiresAt: action.expiresAt,
          },
        },
      };
    }

    case 'releaseSucceeded': {
      const seat = state.seats[action.seatId];
      if (!seat) return state;
      return {
        ...state,
        selectedSeatId: deselectIf(state, seat.id),
        seats: {
          ...state.seats,
          [seat.id]: {
            ...seat,
            status: 'AVAILABLE',
            isMine: false,
            expiresAt: null,
          },
        },
      };
    }

    case 'expireSelected': {
      if (!state.selectedSeatId) return state;
      const seat = state.seats[state.selectedSeatId];
      if (!seat || !seat.isMine) return state;
      return {
        ...state,
        selectedSeatId: null,
        seats: {
          ...state.seats,
          [seat.id]: {
            ...seat,
            status: 'AVAILABLE',
            isMine: false,
            expiresAt: null,
          },
        },
      };
    }

    default:
      return state;
  }
}
