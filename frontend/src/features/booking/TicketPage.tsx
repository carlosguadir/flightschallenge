import { useState, type FormEvent, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { BookingLookupResponse } from '@flight/shared';

import { lookupBooking } from '../../lib/api';
import { formatDateTime, formatMoney } from '../../lib/format';

export function TicketPage(): JSX.Element {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase();
  const [email, setEmail] = useState('');
  const [ticket, setTicket] = useState<BookingLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setTicket(null);

    if (code.length !== 6) {
      setError('No booking found for that code and email.');
      setPending(false);
      return;
    }

    try {
      const result = await lookupBooking({ code, email: email.trim() });
      setTicket(result);
    } catch {
      setError('No booking found for that code and email.');
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="page ticket-page" data-testid="ticket-page">
      <div className="page-heading">
        <Link className="back-link" to="/">
          ← Back to search
        </Link>
        <p className="eyebrow">Ticket lookup</p>
        <h1>Your booking</h1>
        <p className="lede">
          Enter the passenger email used at checkout to open booking <strong>{code || '—'}</strong>.
        </p>
      </div>

      <form className="card lookup-form" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label htmlFor="ticket-email">Passenger email</label>
          <input
            id="ticket-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            disabled={pending}
          />
        </div>
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? 'Looking up…' : 'View ticket'}
        </button>
      </form>

      <div aria-live="polite">
        {error ? (
          <p className="error-banner" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {ticket ? (
        <article className="card ticket" data-testid="ticket">
          <div className="ticket-header">
            <div>
              <p className="muted">Booking code</p>
              <p className="ticket-code">{ticket.code}</p>
            </div>
            <div className="ticket-route">
              <span>{ticket.origin}</span>
              <span aria-hidden="true">→</span>
              <span>{ticket.destination}</span>
            </div>
          </div>

          <dl className="ticket-grid">
            <div>
              <dt>Flight</dt>
              <dd>{ticket.flightNumber}</dd>
            </div>
            <div>
              <dt>Departure</dt>
              <dd>{formatDateTime(ticket.departureAt)}</dd>
            </div>
            <div>
              <dt>Seat{ticket.seats.length === 1 ? '' : 's'}</dt>
              <dd>{ticket.seats.map((seat) => seat.seatLabel).join(', ')}</dd>
            </div>
            <div>
              <dt>Passenger</dt>
              <dd>{ticket.passengerName}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatMoney(ticket.amountCents, ticket.currency)}</dd>
            </div>
            <div>
              <dt>Booked</dt>
              <dd>{formatDateTime(ticket.createdAt)}</dd>
            </div>
          </dl>
        </article>
      ) : null}
    </section>
  );
}
