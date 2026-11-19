import { useState, type FormEvent, type JSX } from 'react';
import type { FlightStatus, PaymentMethod, Seat } from '@flight/shared';

import { ApiError, confirmBooking } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { bookingFingerprint, clearIdempotencyKey, getOrCreateIdempotencyKey } from './idempotency';
import { formatCountdown } from '../seatmap/countdown';

interface CheckoutPanelProps {
  flightId: string;
  seats: Seat[];
  currency: string;
  flightStatus: FlightStatus;
  remainingSeconds: number | null;
  expiringSoon: boolean;
  onRelease: (seatId: string) => Promise<void>;
  onBooked: (code: string) => void;
  refresh: () => void;
}

function bookingErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : 'Booking failed';
  }

  switch (error.code) {
    case 'PAYMENT_DECLINED':
      return 'Payment declined. Your holds are still active; try again or switch method.';
    case 'IDEMPOTENCY_CONFLICT':
      return 'This checkout was already used with different details. Refresh the seats and try again.';
    case 'HOLD_EXPIRED':
      return 'At least one hold expired. Select the seats again.';
    case 'SEAT_UNAVAILABLE':
      return 'At least one seat is no longer available. Refresh and pick seats again.';
    case 'FLIGHT_NOT_BOOKABLE':
      return 'This flight is no longer bookable.';
    default:
      return error.message;
  }
}

export function CheckoutPanel({
  flightId,
  seats,
  currency,
  flightStatus,
  remainingSeconds,
  expiringSoon,
  onRelease,
  onBooked,
  refresh,
}: CheckoutPanelProps): JSX.Element {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('TEST_OK');
  const [pending, setPending] = useState(false);
  const [releasingSeatId, setReleasingSeatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancelled = flightStatus === 'CANCELLED';
  const heldSeats = seats.filter((seat) => seat.status === 'HELD' && seat.isMine);
  const seatIds = heldSeats.map((seat) => seat.id).sort();
  const totalCents = heldSeats.reduce((total, seat) => total + seat.priceCents, 0);
  const disabled =
    heldSeats.length === 0 ||
    heldSeats.length !== seats.length ||
    cancelled ||
    pending ||
    releasingSeatId !== null;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (disabled || seatIds.length === 0) return;

    const fingerprint = bookingFingerprint({
      seatIds,
      passengerName: name,
      passengerEmail: email,
      paymentMethod: method,
    });
    const idempotencyKey = getOrCreateIdempotencyKey(flightId, seatIds, fingerprint);

    setPending(true);
    setError(null);

    try {
      const booking = await confirmBooking(
        {
          flightId,
          seatIds,
          passenger: { name: name.trim(), email: email.trim() },
          payment: { method },
        },
        idempotencyKey,
      );
      clearIdempotencyKey(flightId, seatIds);
      onBooked(booking.code);
    } catch (caught) {
      const message = bookingErrorMessage(caught);
      setError(message);

      if (
        caught instanceof ApiError &&
        ['IDEMPOTENCY_CONFLICT', 'HOLD_EXPIRED', 'SEAT_UNAVAILABLE'].includes(caught.code)
      ) {
        clearIdempotencyKey(flightId, seatIds);
        refresh();
      }
    } finally {
      setPending(false);
    }
  };

  const release = async (seatId: string): Promise<void> => {
    setReleasingSeatId(seatId);
    setError(null);
    try {
      await onRelease(seatId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not release the seat');
    } finally {
      setReleasingSeatId(null);
    }
  };

  return (
    <aside className="card checkout" aria-label="Checkout">
      <h2>Checkout</h2>

      {heldSeats.length === 0 ? (
        <p className="muted">
          Select up to four available seats to hold them for a few minutes. Holds are released
          automatically when the timer ends.
        </p>
      ) : (
        <>
          <div className="checkout-seat">
            <div>
              <p className="muted">Reservation</p>
              <p className="checkout-seat-label">
                {heldSeats.length} seat{heldSeats.length === 1 ? '' : 's'}
              </p>
              <p className="muted">{formatMoney(totalCents, currency)} total</p>
            </div>
            {remainingSeconds !== null ? (
              <div className={`countdown ${expiringSoon ? 'countdown-warning' : ''}`}>
                <span className="muted">Earliest hold expires in</span>
                <strong>{formatCountdown(remainingSeconds)}</strong>
              </div>
            ) : null}
          </div>

          <ul className="checkout-seats" aria-label="Held seats">
            {heldSeats.map((seat) => (
              <li className="checkout-seat-row" key={seat.id}>
                <div>
                  <strong>{seat.label}</strong>{' '}
                  <span className="muted">
                    {seat.class === 'BUSINESS' ? 'Business' : 'Economy'} ·{' '}
                    {formatMoney(seat.priceCents, currency)}
                  </span>
                </div>
                <button
                  className="button button-ghost button-small"
                  type="button"
                  onClick={() => void release(seat.id)}
                  disabled={pending || releasingSeatId !== null || cancelled}
                >
                  {releasingSeatId === seat.id ? 'Releasing…' : 'Release'}
                </button>
              </li>
            ))}
          </ul>

          {cancelled ? (
            <p className="notice notice-danger">
              This flight is cancelled. Existing holds cannot be booked.
            </p>
          ) : null}

          <form className="checkout-form" onSubmit={(event) => void submit(event)}>
            <div className="field">
              <label htmlFor="passenger-name">Passenger name</label>
              <input
                id="passenger-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
                disabled={disabled}
              />
            </div>

            <div className="field">
              <label htmlFor="passenger-email">Passenger email</label>
              <input
                id="passenger-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                disabled={disabled}
              />
            </div>

            <fieldset className="payment-methods" disabled={disabled}>
              <legend>Payment method</legend>
              <label className="radio">
                <input
                  type="radio"
                  name="payment"
                  value="TEST_OK"
                  checked={method === 'TEST_OK'}
                  onChange={() => setMethod('TEST_OK')}
                />
                Pay (test card)
              </label>
              <label className="radio">
                <input
                  type="radio"
                  name="payment"
                  value="TEST_DECLINE"
                  checked={method === 'TEST_DECLINE'}
                  onChange={() => setMethod('TEST_DECLINE')}
                />
                Decline test card
              </label>
            </fieldset>

            <button
              className="button button-primary"
              type="submit"
              disabled={disabled}
              data-testid="confirm-booking"
            >
              {pending
                ? 'Confirming…'
                : `Confirm booking (${heldSeats.length} seat${heldSeats.length === 1 ? '' : 's'})`}
            </button>
          </form>
        </>
      )}

      <div aria-live="polite">
        {error ? (
          <p className="error-banner" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
