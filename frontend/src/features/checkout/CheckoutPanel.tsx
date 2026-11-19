import { useState, type FormEvent, type JSX } from 'react';
import type { FlightStatus, PaymentMethod, Seat } from '@flight/shared';

import { ApiError, confirmBooking } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { bookingFingerprint, clearIdempotencyKey, getOrCreateIdempotencyKey } from './idempotency';
import { formatCountdown } from '../seatmap/countdown';

interface CheckoutPanelProps {
  flightId: string;
  seat: Seat | null;
  currency: string;
  flightStatus: FlightStatus;
  remainingSeconds: number | null;
  expiringSoon: boolean;
  onRelease: () => Promise<void>;
  onBooked: (code: string) => void;
  refresh: () => void;
}

function bookingErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : 'Booking failed';
  }

  switch (error.code) {
    case 'PAYMENT_DECLINED':
      return 'Payment declined. Your hold is still active; try again or switch method.';
    case 'IDEMPOTENCY_CONFLICT':
      return 'This checkout was already used with different details. Refresh the seat and try again.';
    case 'HOLD_EXPIRED':
      return 'Your hold expired. Select the seat again.';
    case 'SEAT_UNAVAILABLE':
      return 'That seat is no longer available. Refresh and pick another one.';
    case 'FLIGHT_NOT_BOOKABLE':
      return 'This flight is no longer bookable.';
    default:
      return error.message;
  }
}

export function CheckoutPanel({
  flightId,
  seat,
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
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelled = flightStatus === 'CANCELLED';
  const disabled = !seat || cancelled || pending || seat.status !== 'HELD' || !seat.isMine;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!seat || disabled) return;

    const fingerprint = bookingFingerprint({
      seatId: seat.id,
      passengerName: name,
      passengerEmail: email,
      paymentMethod: method,
    });
    const idempotencyKey = getOrCreateIdempotencyKey(flightId, seat.id, fingerprint);

    setPending(true);
    setError(null);

    try {
      const booking = await confirmBooking(
        {
          flightId,
          seatId: seat.id,
          passenger: { name: name.trim(), email: email.trim() },
          payment: { method },
        },
        idempotencyKey,
      );
      clearIdempotencyKey(flightId, seat.id);
      onBooked(booking.code);
    } catch (caught) {
      const message = bookingErrorMessage(caught);
      setError(message);

      if (
        caught instanceof ApiError &&
        ['IDEMPOTENCY_CONFLICT', 'HOLD_EXPIRED', 'SEAT_UNAVAILABLE'].includes(caught.code)
      ) {
        clearIdempotencyKey(flightId, seat.id);
        refresh();
      }
    } finally {
      setPending(false);
    }
  };

  const release = async (): Promise<void> => {
    if (!seat) return;
    setReleasing(true);
    setError(null);
    try {
      await onRelease();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not release the seat');
    } finally {
      setReleasing(false);
    }
  };

  return (
    <aside className="card checkout" aria-label="Checkout">
      <h2>Checkout</h2>

      {!seat ? (
        <p className="muted">
          Select an available seat to hold it for a few minutes. Holds are released automatically
          when the timer ends.
        </p>
      ) : (
        <>
          <div className="checkout-seat">
            <div>
              <p className="muted">Selected seat</p>
              <p className="checkout-seat-label">{seat.label}</p>
              <p className="muted">
                {seat.class === 'BUSINESS' ? 'Business' : 'Economy'} ·{' '}
                {formatMoney(seat.priceCents, currency)}
              </p>
            </div>
            {remainingSeconds !== null ? (
              <div className={`countdown ${expiringSoon ? 'countdown-warning' : ''}`}>
                <span className="muted">Hold expires in</span>
                <strong>{formatCountdown(remainingSeconds)}</strong>
              </div>
            ) : null}
          </div>

          <button
            className="button button-ghost"
            type="button"
            onClick={() => void release()}
            disabled={releasing || pending || cancelled}
          >
            {releasing ? 'Releasing…' : 'Release seat'}
          </button>

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
              {pending ? 'Confirming…' : 'Confirm booking'}
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
