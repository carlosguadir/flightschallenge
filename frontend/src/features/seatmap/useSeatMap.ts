import { useCallback, useEffect, useReducer, useState, type Dispatch } from 'react';
import type {
  FlightUpdatedEvent,
  SeatBookedEvent,
  SeatHeldEvent,
  SeatReleasedEvent,
} from '@flight/shared';

import { getSeatMap } from '../../lib/api';
import { emitWithAck, onServerEvent } from '../../lib/socket-context';
import { useSocket } from '../../lib/useSocket';
import {
  initialSeatMapState,
  seatMapReducer,
  type SeatMapAction,
  type SeatMapState,
} from './seatMapReducer';

export interface SeatMapController {
  state: SeatMapState;
  dispatch: Dispatch<SeatMapAction>;
  refresh: () => void;
  error: string | null;
}

export function useSeatMap(flightId: string): SeatMapController {
  const { socket, connected } = useSocket();
  const [state, dispatch] = useReducer(seatMapReducer, flightId, initialSeatMapState);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!socket || !connected) return;

    let cancelled = false;
    dispatch({ type: 'beginBuffering' });
    setError(null);

    const offs = [
      onServerEvent<SeatHeldEvent>(socket, 'seat.held', (payload) =>
        dispatch({ type: 'incoming', event: { name: 'seat.held', payload } }),
      ),
      onServerEvent<SeatReleasedEvent>(socket, 'seat.released', (payload) =>
        dispatch({ type: 'incoming', event: { name: 'seat.released', payload } }),
      ),
      onServerEvent<SeatBookedEvent>(socket, 'seat.booked', (payload) =>
        dispatch({ type: 'incoming', event: { name: 'seat.booked', payload } }),
      ),
      onServerEvent<FlightUpdatedEvent>(socket, 'flight.updated', (payload) =>
        dispatch({ type: 'incoming', event: { name: 'flight.updated', payload } }),
      ),
    ];

    const sync = async (): Promise<void> => {
      try {
        await emitWithAck<{ ok: boolean; flightId: string }>(socket, 'flight.join', { flightId });
        const snapshot = await getSeatMap(flightId);
        if (!cancelled) {
          dispatch({
            type: 'snapshot',
            snapshot,
            receivedAtMs: Date.now(),
          });
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load the seat map');
        }
      }
    };

    void sync();

    return () => {
      cancelled = true;
      for (const off of offs) off();
      socket.emit('flight.leave', { flightId });
      dispatch({ type: 'beginBuffering' });
    };
  }, [socket, connected, flightId, reloadToken]);

  return { state, dispatch, refresh, error };
}
