import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Seat } from '@flight/shared';

import { FlightBadges } from '../../components/Badges';
import { ApiError, getFlight, holdSeat, releaseSeat } from '../../lib/api';
import { formatDate, formatMoney, formatTime } from '../../lib/format';
import { CheckoutPanel } from '../checkout/CheckoutPanel';
import { isExpiringSoon, secondsRemaining } from './countdown';
import { SeatMapGrid } from './SeatMapGrid';
import { useSeatMap } from './useSeatMap';

export function SeatMapPage(): JSX.Element {
  const params = useParams<{ flightId: string }>();
  const flightId = params.flightId ?? '';
  const controller = useSeatMap(flightId);
  const { state, dispatch, refresh, error } = controller;
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [pendingSeatId, setPendingSeatId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const flightQuery = useQuery({
    queryKey: ['flight', flightId],
    queryFn: () => getFlight(flightId),
    enabled: Boolean(flightId),
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const live = state.phase === 'live';
  const flight = flightQuery.data;
  const status = live ? state.status : (flight?.status ?? 'SCHEDULED');
  const delayMinutes = live ? state.delayMinutes : (flight?.delayMinutes ?? 0);
  const soldOut = live ? state.soldOut : (flight?.soldOut ?? false);
  const availableSeats = live ? state.availableSeats : (flight?.availableSeats ?? 0);
  const currency = flight?.currency ?? 'USD';

  const selectedSeat = state.selectedSeatId ? (state.seats[state.selectedSeatId] ?? null) : null;
  const remainingSeconds =
    selectedSeat?.expiresAt && selectedSeat.isMine
      ? secondsRemaining(selectedSeat.expiresAt, state.serverOffsetMs, now)
      : null;

  useEffect(() => {
    if (live && selectedSeat?.isMine && remainingSeconds !== null && remainingSeconds <= 0) {
      dispatch({ type: 'expireSelected' });
      refresh();
    }
  }, [live, selectedSeat, remainingSeconds, dispatch, refresh]);

  if (!flightId) {
    return <p className="error-banner">Flight not found.</p>;
  }

  const handleSeat = async (seat: Seat): Promise<void> => {
    if (!live || status === 'CANCELLED') return;

    if (seat.status === 'HELD' && seat.isMine) {
      dispatch({ type: 'select', seatId: seat.id });
      return;
    }
    if (seat.status !== 'AVAILABLE') return;

    setPendingSeatId(seat.id);
    setActionError(null);

    try {
      const hold = await holdSeat(flightId, seat.id);
      dispatch({
        type: 'holdSucceeded',
        seatId: seat.id,
        expiresAt: hold.expiresAt,
      });
    } catch (caught) {
      setActionError(
        caught instanceof ApiError && caught.code === 'SEAT_UNAVAILABLE'
          ? 'That seat was just taken. The map has been refreshed.'
          : caught instanceof Error
            ? caught.message
            : 'Could not hold the seat',
      );
      refresh();
    } finally {
      setPendingSeatId(null);
    }
  };

  const handleRelease = async (): Promise<void> => {
    if (!selectedSeat) return;
    await releaseSeat(flightId, selectedSeat.id);
    dispatch({ type: 'releaseSucceeded', seatId: selectedSeat.id });
  };

  const loading = !live && state.order.length === 0;

  return (
    <section className="page seat-page" data-testid="seat-map-page">
      <div className="page-heading">
        <Link className="back-link" to="/">
          ← Back to search
        </Link>
        <p className="eyebrow">US2 · Seat selection</p>
        <h1>
          {flight?.flightNumber ?? 'Flight'}{' '}
          <span className="route-inline">
            {flight ? `${flight.origin} → ${flight.destination}` : ''}
          </span>
        </h1>
        <p className="muted">
          {flight
            ? `${formatDate(flight.departureAt)} · ${formatTime(flight.departureAt)} UTC · ${formatMoney(
                flight.priceCents,
                flight.currency,
              )}`
            : 'Loading flight details…'}
        </p>
        <div className="badge-row">
          <FlightBadges status={status} delayMinutes={delayMinutes} soldOut={soldOut} />
          <span className="muted">{availableSeats} seats available</span>
          <Link className="text-link" to={`/dashboard/${flightId}`}>
            Watch live dashboard
          </Link>
        </div>
      </div>

      {status === 'CANCELLED' ? (
        <p className="notice notice-danger" role="status">
          This flight is cancelled. The seat map is read-only and checkout is disabled.
        </p>
      ) : null}

      <div aria-live="polite">
        {error ? <p className="error-banner">{error}</p> : null}
        {actionError ? <p className="error-banner">{actionError}</p> : null}
        {pendingSeatId ? <p className="muted">Holding seat…</p> : null}
      </div>

      {loading ? (
        <div className="card loading-card">Connecting to the live seat map…</div>
      ) : (
        <div className="seat-layout">
          <div className="card seat-panel">
            <SeatMapGrid
              state={state}
              selectedSeatId={state.selectedSeatId}
              readOnly={!live || status === 'CANCELLED'}
              currency={currency}
              onSeatClick={(seat) => void handleSeat(seat)}
            />
          </div>

          <CheckoutPanel
            flightId={flightId}
            seat={selectedSeat}
            currency={currency}
            flightStatus={status}
            remainingSeconds={remainingSeconds}
            expiringSoon={remainingSeconds !== null && isExpiringSoon(remainingSeconds)}
            onRelease={handleRelease}
            onBooked={(code) => navigate(`/booking/${code}`)}
            refresh={refresh}
          />
        </div>
      )}
    </section>
  );
}
