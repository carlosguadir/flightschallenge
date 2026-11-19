import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  FlightMetrics,
  FlightSummary,
  FlightUpdatedEvent,
  SeatBookedEvent,
  SeatHeldEvent,
  SeatReleasedEvent,
} from '@flight/shared';

import { FlightBadges } from '../../components/Badges';
import { getFlight, getMetrics } from '../../lib/api';
import { emitWithAck, onServerEvent } from '../../lib/socket-context';
import { useSocket } from '../../lib/useSocket';

interface FeedItem {
  id: number;
  time: string;
  text: string;
}

export function DashboardPage(): JSX.Element {
  const params = useParams<{ flightId: string }>();
  const flightId = params.flightId ?? '';
  const queryClient = useQueryClient();
  const { socket, connected } = useSocket();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const feedId = useRef(0);

  const flightQuery = useQuery({
    queryKey: ['flight', flightId],
    queryFn: () => getFlight(flightId),
    enabled: Boolean(flightId),
  });
  const metricsQuery = useQuery({
    queryKey: ['metrics', flightId],
    queryFn: () => getMetrics(flightId),
    enabled: Boolean(flightId),
  });

  const pushFeed = useCallback((text: string): void => {
    feedId.current += 1;
    const item: FeedItem = {
      id: feedId.current,
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      text,
    };
    setFeed((current) => [item, ...current].slice(0, 8));
  }, []);

  useEffect(() => {
    if (!socket || !connected || !flightId) return;

    const offs = [
      onServerEvent<FlightMetrics>(socket, 'flight.metrics', (metrics) => {
        queryClient.setQueryData(['metrics', flightId], metrics);
      }),
      onServerEvent<FlightUpdatedEvent>(socket, 'flight.updated', (event) => {
        queryClient.setQueryData<FlightSummary>(['flight', flightId], (current) =>
          current ? { ...current, ...event } : current,
        );
        pushFeed(
          `Status → ${event.status}${event.delayMinutes > 0 ? ` (+${event.delayMinutes}m)` : ''}`,
        );
      }),
      onServerEvent<SeatHeldEvent>(socket, 'seat.held', (event) => {
        pushFeed(`Seat ${event.label} held`);
      }),
      onServerEvent<SeatReleasedEvent>(socket, 'seat.released', (event) => {
        pushFeed(`Seat ${event.label} released${event.reason === 'EXPIRED' ? ' (expired)' : ''}`);
      }),
      onServerEvent<SeatBookedEvent>(socket, 'seat.booked', (event) => {
        pushFeed(`Seat ${event.label} booked`);
      }),
    ];

    void emitWithAck(socket, 'flight.join', { flightId }).catch(() => undefined);

    return () => {
      for (const off of offs) off();
      socket.emit('flight.leave', { flightId });
    };
  }, [socket, connected, flightId, queryClient, pushFeed]);

  const flight = flightQuery.data;
  const metrics = metricsQuery.data;

  if (!flightId) {
    return <p className="error-banner">Flight not found.</p>;
  }

  return (
    <section className="page dashboard-page" data-testid="dashboard-page">
      <div className="page-heading">
        <Link className="back-link" to="/">
          ← Back to search
        </Link>
        <p className="eyebrow">US4 · Live dashboard</p>
        <h1>
          {flight?.flightNumber ?? 'Flight'}{' '}
          <span className="route-inline">
            {flight ? `${flight.origin} → ${flight.destination}` : ''}
          </span>
        </h1>
        <div className="badge-row">
          {flight ? (
            <FlightBadges
              status={flight.status}
              delayMinutes={flight.delayMinutes}
              soldOut={flight.soldOut}
            />
          ) : null}
          <span className="muted">Version {metrics?.version ?? flight?.version ?? 0}</span>
          <Link className="text-link" to={`/flights/${flightId}`}>
            Open seat map
          </Link>
        </div>
      </div>

      {metricsQuery.isError ? (
        <p className="error-banner" role="alert">
          Could not load metrics.
        </p>
      ) : null}

      <div className="metrics-grid">
        <article className="card metric-card">
          <p className="metric-label">Available</p>
          <p className="metric-value">{metrics?.available ?? '—'}</p>
        </article>
        <article className="card metric-card">
          <p className="metric-label">Held</p>
          <p className="metric-value">{metrics?.held ?? '—'}</p>
        </article>
        <article className="card metric-card">
          <p className="metric-label">Booked</p>
          <p className="metric-value">{metrics?.booked ?? '—'}</p>
        </article>
        <article className="card metric-card">
          <p className="metric-label">Total</p>
          <p className="metric-value">{metrics?.total ?? '—'}</p>
        </article>
      </div>

      <section className="card occupancy-card" aria-label="Occupancy">
        <div className="occupancy-heading">
          <h2>Occupancy</h2>
          <strong>{metrics ? `${metrics.occupancyPct.toFixed(2)}%` : '—'}</strong>
        </div>
        <div
          className="occupancy-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={metrics?.occupancyPct ?? 0}
          aria-label="Seats held or booked"
        >
          <span style={{ width: `${metrics?.occupancyPct ?? 0}%` }} />
        </div>
        <p className="muted">Held and booked seats over total seats.</p>
      </section>

      <section className="card feed-card" aria-label="Recent activity">
        <h2>Recent activity</h2>
        {feed.length === 0 ? (
          <p className="muted">Live events from this flight will appear here.</p>
        ) : (
          <ol className="event-feed" aria-live="polite">
            {feed.map((item) => (
              <li key={item.id}>
                <span className="event-time">{item.time}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
