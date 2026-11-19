CREATE TABLE flights (
  id uuid PRIMARY KEY,
  flight_number text NOT NULL UNIQUE,
  origin char(3) NOT NULL,
  destination char(3) NOT NULL,
  departure_at timestamptz NOT NULL,
  arrival_at timestamptz NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'DELAYED', 'CANCELLED')),
  sold_out boolean NOT NULL DEFAULT false,
  delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  version bigint NOT NULL DEFAULT 0
);

CREATE INDEX flights_search_idx ON flights (origin, destination, departure_at);

CREATE TABLE seats (
  id uuid PRIMARY KEY,
  flight_id uuid NOT NULL REFERENCES flights (id) ON DELETE CASCADE,
  seat_row integer NOT NULL CHECK (seat_row > 0),
  seat_col text NOT NULL,
  label text NOT NULL,
  class text NOT NULL CHECK (class IN ('ECONOMY', 'BUSINESS')),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  status text NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'HELD', 'BOOKED')),
  held_by_session text,
  hold_expires_at timestamptz,
  booking_id uuid,
  version bigint NOT NULL DEFAULT 0,
  CONSTRAINT seats_flight_label_unique UNIQUE (flight_id, label),
  CONSTRAINT seats_state_shape CHECK (
    (status = 'AVAILABLE' AND held_by_session IS NULL AND hold_expires_at IS NULL AND booking_id IS NULL)
    OR (status = 'HELD' AND held_by_session IS NOT NULL AND hold_expires_at IS NOT NULL AND booking_id IS NULL)
    OR (status = 'BOOKED' AND held_by_session IS NULL AND hold_expires_at IS NULL AND booking_id IS NOT NULL)
  )
);

CREATE INDEX seats_flight_idx ON seats (flight_id);
CREATE INDEX seats_hold_expiry_idx ON seats (hold_expires_at) WHERE status = 'HELD';

CREATE TABLE bookings (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  flight_id uuid NOT NULL REFERENCES flights (id),
  seat_id uuid NOT NULL UNIQUE REFERENCES seats (id),
  session_id text NOT NULL,
  passenger_name text NOT NULL,
  passenger_email text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bookings_code_email_idx ON bookings (code, passenger_email);
CREATE INDEX bookings_flight_idx ON bookings (flight_id);
