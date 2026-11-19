import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';
import type { FlightSummary, FlightUpdatedEvent } from '@flight/shared';

import { FlightBadges } from '../../components/Badges';
import { getFlights } from '../../lib/api';
import { formatDate, formatMoney, formatTime } from '../../lib/format';
import { emitWithAck, onServerEvent } from '../../lib/socket-context';
import { useSocket } from '../../lib/useSocket';

interface Filters {
  origin: string;
  destination: string;
  date: string;
}

const EMPTY_FILTERS: Filters = { origin: '', destination: '', date: '' };

export function SearchPage(): JSX.Element {
  const [form, setForm] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchReady, setSearchReady] = useState(false);
  const queryClient = useQueryClient();
  const { socket, connected } = useSocket();
  const flights = useQuery({
    queryKey: ['flights', filters],
    queryFn: () => getFlights(filters),
  });

  useEffect(() => {
    if (!socket || !connected) {
      setSearchReady(false);
      return;
    }

    let active = true;
    setSearchReady(false);
    void emitWithAck(socket, 'search.join', {})
      .then(() => {
        if (active) setSearchReady(true);
      })
      .catch(() => undefined);

    const off = onServerEvent<FlightUpdatedEvent>(socket, 'flight.updated', (event) => {
      queryClient.setQueryData<FlightSummary[]>(['flights', filters], (current) =>
        current?.map((flight) =>
          flight.id === event.flightId
            ? {
                ...flight,
                status: event.status,
                delayMinutes: event.delayMinutes,
                soldOut: event.soldOut,
                availableSeats: event.availableSeats,
                version: event.version,
              }
            : flight,
        ),
      );
      queryClient.setQueryData<FlightSummary>(['flight', event.flightId], (current) =>
        current
          ? {
              ...current,
              status: event.status,
              delayMinutes: event.delayMinutes,
              soldOut: event.soldOut,
              availableSeats: event.availableSeats,
              version: event.version,
            }
          : current,
      );
    });

    return () => {
      active = false;
      off();
    };
  }, [socket, connected, filters, queryClient]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFilters({
      origin: form.origin.trim().toUpperCase(),
      destination: form.destination.trim().toUpperCase(),
      date: form.date,
    });
  };

  const reset = (): void => {
    setForm(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  };

  const results = flights.data ?? [];

  return (
    <section
      className="page"
      data-testid="search-page"
      data-search-ready={searchReady ? 'true' : 'false'}
    >
      <header className="page-heading">
        <p className="eyebrow">US1 · Search</p>
        <h1>Find your next flight</h1>
        <p className="lede">Availability and operational status update live while you search.</p>
      </header>

      <form className="card search-form" onSubmit={submit} aria-label="Flight search">
        <div className="field">
          <label htmlFor="origin">From</label>
          <input
            id="origin"
            name="origin"
            value={form.origin}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                origin: event.target.value.toUpperCase().slice(0, 3),
              }))
            }
            placeholder="BOG"
            autoComplete="off"
            maxLength={3}
          />
        </div>
        <div className="field">
          <label htmlFor="destination">To</label>
          <input
            id="destination"
            name="destination"
            value={form.destination}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                destination: event.target.value.toUpperCase().slice(0, 3),
              }))
            }
            placeholder="MDE"
            autoComplete="off"
            maxLength={3}
          />
        </div>
        <div className="field">
          <label htmlFor="date">Date (UTC)</label>
          <input
            id="date"
            name="date"
            type="date"
            value={form.date}
            onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
          />
        </div>
        <div className="form-actions">
          <button className="button button-primary" type="submit">
            Search
          </button>
          <button className="button button-ghost" type="button" onClick={reset}>
            All flights
          </button>
        </div>
      </form>

      <p className="results-count" aria-live="polite">
        {flights.isPending
          ? 'Loading flights…'
          : flights.isError
            ? 'Could not load flights.'
            : `${results.length} flight${results.length === 1 ? '' : 's'} found`}
      </p>

      {flights.isError ? (
        <p className="error-banner" role="alert">
          {flights.error instanceof Error ? flights.error.message : 'Search failed'}
        </p>
      ) : null}

      {!flights.isPending && !flights.isError && results.length === 0 ? (
        <div className="empty-state">
          <h2>No flights match those filters</h2>
          <p>Try another route or clear the date.</p>
        </div>
      ) : null}

      <ul className="flight-list">
        {results.map((flight) => (
          <li className="card flight-card" key={flight.id} data-testid={`flight-${flight.id}`}>
            <div className="flight-card-main">
              <div>
                <p className="flight-number">{flight.flightNumber}</p>
                <p className="route">
                  {flight.origin} <span aria-hidden="true">→</span> {flight.destination}
                </p>
                <p className="muted">
                  {formatDate(flight.departureAt)} · {formatTime(flight.departureAt)} UTC
                </p>
              </div>
              <div className="flight-price">{formatMoney(flight.priceCents, flight.currency)}</div>
            </div>

            <div className="flight-card-meta">
              <div className="badge-row">
                <FlightBadges
                  status={flight.status}
                  delayMinutes={flight.delayMinutes}
                  soldOut={flight.soldOut}
                />
                <span className="muted">
                  {flight.availableSeats} seat{flight.availableSeats === 1 ? '' : 's'} available
                </span>
              </div>
              <div className="button-row">
                <Link className="button button-primary" to={`/flights/${flight.id}`}>
                  Choose seats
                </Link>
                <Link className="button button-ghost" to={`/dashboard/${flight.id}`}>
                  Live dashboard
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
