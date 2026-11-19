CREATE TABLE booking_seats (
  booking_id uuid NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  seat_id uuid NOT NULL UNIQUE REFERENCES seats (id),
  seat_label text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  PRIMARY KEY (booking_id, seat_id)
);

-- Preserve existing single-seat bookings as one-line reservations.
INSERT INTO booking_seats (booking_id, seat_id, seat_label, price_cents)
SELECT b.id, b.seat_id, s.label, b.amount_cents
FROM bookings b
JOIN seats s ON s.id = b.seat_id;

ALTER TABLE bookings DROP COLUMN seat_id;
