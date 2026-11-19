import type { FlightStatus, Seat, SeatMap, ServerEvent } from '@flight/shared';
import { describe, expect, it } from 'vitest';

import {
  initialSeatMapState,
  seatMapReducer,
  type SeatMapState,
} from '../src/features/seatmap/seatMapReducer';

const flightId = '11111111-1111-4111-8111-111111111111';
const seat1A = '22222222-2222-4222-8222-222222222222';
const seat1B = '33333333-3333-4333-8333-333333333333';
const serverTime = '2026-12-01T00:00:00.000Z';
const receivedAt = Date.parse(serverTime);

function seat(
  id: string,
  label: string,
  row: number,
  status: Seat['status'],
  isMine = false,
): Seat {
  return {
    id,
    label,
    row,
    col: label.slice(-1),
    class: 'ECONOMY',
    priceCents: 1000,
    status,
    isMine,
    expiresAt: status === 'HELD' ? '2026-12-01T00:05:00.000Z' : null,
  };
}

function snapshot(
  version: number,
  status: FlightStatus = 'SCHEDULED',
  seats: Seat[] = [seat(seat1A, '1A', 1, 'AVAILABLE'), seat(seat1B, '1B', 1, 'AVAILABLE')],
): SeatMap {
  return {
    flightId,
    version,
    status,
    delayMinutes: 0,
    soldOut: false,
    availableSeats: seats.filter((entry) => entry.status === 'AVAILABLE').length,
    serverTime,
    holdTtlSeconds: 300,
    seats,
  };
}

function heldEvent(version: number, seatId = seat1B): ServerEvent {
  return {
    name: 'seat.held',
    payload: {
      flightId,
      seatId,
      label: seatId === seat1B ? '1B' : '1A',
      expiresAt: '2026-12-01T00:05:00.000Z',
      version,
    },
  };
}

function releasedEvent(version: number, seatId = seat1B): ServerEvent {
  return {
    name: 'seat.released',
    payload: {
      flightId,
      seatId,
      label: seatId === seat1B ? '1B' : '1A',
      reason: 'USER',
      version,
    },
  };
}

function liveState(): SeatMapState {
  return seatMapReducer(initialSeatMapState(flightId), {
    type: 'snapshot',
    snapshot: snapshot(5),
    receivedAtMs: receivedAt,
  });
}

describe('seat map versioned reducer', () => {
  it('buffers events until the snapshot arrives and drains in version order', () => {
    let state = initialSeatMapState(flightId);
    state = seatMapReducer(state, { type: 'incoming', event: heldEvent(7) });
    expect(state.phase).toBe('buffering');
    expect(state.buffer).toHaveLength(1);
    expect(state.seats).toEqual({});

    state = seatMapReducer(state, {
      type: 'snapshot',
      snapshot: snapshot(5),
      receivedAtMs: receivedAt,
    });

    expect(state.phase).toBe('live');
    expect(state.version).toBe(7);
    expect(state.seats[seat1B]).toMatchObject({
      status: 'HELD',
      isMine: false,
      expiresAt: '2026-12-01T00:05:00.000Z',
    });
    expect(state.buffer).toHaveLength(0);
    expect(state.serverOffsetMs).toBe(0);
  });

  it('sorts buffered events and ignores versions at or below the snapshot', () => {
    let state = seatMapReducer(initialSeatMapState(flightId), {
      type: 'incoming',
      event: releasedEvent(8),
    });
    state = seatMapReducer(state, { type: 'incoming', event: heldEvent(7) });
    state = seatMapReducer(state, { type: 'incoming', event: heldEvent(6) });

    state = seatMapReducer(state, {
      type: 'snapshot',
      snapshot: snapshot(6),
      receivedAtMs: receivedAt,
    });

    expect(state.version).toBe(8);
    expect(state.seats[seat1B].status).toBe('AVAILABLE');
    expect(state.seats[seat1B].isMine).toBe(false);
  });

  it('applies live events once and ignores duplicates and older versions', () => {
    let state = liveState();
    state = seatMapReducer(state, { type: 'incoming', event: heldEvent(6) });
    expect(state.version).toBe(6);

    state = seatMapReducer(state, { type: 'incoming', event: heldEvent(6) });
    expect(state.version).toBe(6);

    state = seatMapReducer(state, { type: 'incoming', event: releasedEvent(5) });
    expect(state.version).toBe(6);
    expect(state.seats[seat1B].status).toBe('HELD');
  });

  it('holds ownership locally without advancing the event version', () => {
    let state = liveState();
    state = seatMapReducer(state, {
      type: 'holdSucceeded',
      seatId: seat1A,
      expiresAt: '2026-12-01T00:04:00.000Z',
    });

    expect(state.selectedSeatId).toBe(seat1A);
    expect(state.version).toBe(5);
    expect(state.seats[seat1A]).toMatchObject({
      status: 'HELD',
      isMine: true,
      expiresAt: '2026-12-01T00:04:00.000Z',
    });

    state = seatMapReducer(state, { type: 'expireSelected' });
    expect(state.selectedSeatId).toBeNull();
    expect(state.seats[seat1A]).toMatchObject({
      status: 'AVAILABLE',
      isMine: false,
      expiresAt: null,
    });
  });

  it('updates flight status from flight.updated and clears a selected booked seat', () => {
    let state = seatMapReducer(liveState(), {
      type: 'select',
      seatId: seat1A,
    });

    state = seatMapReducer(state, {
      type: 'incoming',
      event: {
        name: 'flight.updated',
        payload: {
          flightId,
          status: 'DELAYED',
          delayMinutes: 15,
          soldOut: false,
          availableSeats: 2,
          version: 9,
        },
      },
    });
    expect(state.status).toBe('DELAYED');
    expect(state.delayMinutes).toBe(15);
    expect(state.version).toBe(9);

    state = seatMapReducer(state, {
      type: 'incoming',
      event: {
        name: 'seat.booked',
        payload: { flightId, seatId: seat1A, label: '1A', version: 10 },
      },
    });
    expect(state.selectedSeatId).toBeNull();
    expect(state.seats[seat1A].status).toBe('BOOKED');
  });

  it('rebuffers on reconnect and replaces stale seats with the new snapshot', () => {
    let state = liveState();
    state = seatMapReducer(state, { type: 'beginBuffering' });
    state = seatMapReducer(state, { type: 'incoming', event: heldEvent(8) });

    state = seatMapReducer(state, {
      type: 'snapshot',
      snapshot: snapshot(7, 'DELAYED', [seat(seat1A, '1A', 1, 'BOOKED')]),
      receivedAtMs: receivedAt + 1000,
    });

    expect(state.phase).toBe('live');
    expect(state.status).toBe('DELAYED');
    expect(state.version).toBe(8);
    expect(state.order).toEqual([seat1A]);
    expect(state.seats[seat1B]).toBeUndefined();
    expect(state.serverOffsetMs).toBe(-1000);
  });
});
