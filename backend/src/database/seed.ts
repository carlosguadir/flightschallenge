import type { Pool, PoolClient } from 'pg';
import { v5 as uuidv5 } from 'uuid';

const SEED_NAMESPACE = '2f1e5d6c-9a0b-4c3d-8e7f-0123456789ab';

const ROUTES = [
  { origin: 'BOG', destination: 'MDE', basePriceCents: 189900 },
  { origin: 'BOG', destination: 'CTG', basePriceCents: 145000 },
  { origin: 'MDE', destination: 'CTG', basePriceCents: 210000 },
  { origin: 'BOG', destination: 'MEX', basePriceCents: 320000 },
  { origin: 'MEX', destination: 'CUN', basePriceCents: 275000 },
] as const;

export const SEED_DATES = ['2026-12-01', '2026-12-02', '2026-12-03'] as const;
export const SEAT_ROWS = 30;
export const SEAT_COLS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const PRIMARY_TEST_FLIGHT = 'AV1001';
export const PRIMARY_TEST_SEAT = '1A';

export interface SeedFlight {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  priceCents: number;
  currency: string;
}

export function seedFlightId(flightNumber: string): string {
  return uuidv5(`flight:${flightNumber}`, SEED_NAMESPACE);
}

export function seedSeatId(flightNumber: string, label: string): string {
  return uuidv5(`seat:${flightNumber}:${label}`, SEED_NAMESPACE);
}

export function buildSeedFlights(): SeedFlight[] {
  const flights: SeedFlight[] = [];
  let index = 0;

  for (const [dateIndex, date] of SEED_DATES.entries()) {
    for (const [routeIndex, route] of ROUTES.entries()) {
      const flightNumber = `AV${1001 + index}`;
      const departureHour = 8 + routeIndex * 2;
      const departureAt = new Date(`${date}T${String(departureHour).padStart(2, '0')}:00:00.000Z`);
      const arrivalAt = new Date(departureAt.getTime() + 150 * 60 * 1000);

      flights.push({
        id: seedFlightId(flightNumber),
        flightNumber,
        origin: route.origin,
        destination: route.destination,
        departureAt: departureAt.toISOString(),
        arrivalAt: arrivalAt.toISOString(),
        priceCents: route.basePriceCents + dateIndex * 15000,
        currency: 'USD',
      });
      index += 1;
    }
  }

  return flights;
}

interface SeedSeat {
  id: string;
  row: number;
  col: string;
  label: string;
  travelClass: 'ECONOMY' | 'BUSINESS';
  priceCents: number;
}

function buildSeatRows(flight: SeedFlight): SeedSeat[] {
  const seats: SeedSeat[] = [];

  for (let row = 1; row <= SEAT_ROWS; row += 1) {
    for (const col of SEAT_COLS) {
      const label = `${row}${col}`;
      const travelClass: SeedSeat['travelClass'] = row <= 4 ? 'BUSINESS' : 'ECONOMY';
      seats.push({
        id: seedSeatId(flight.flightNumber, label),
        row,
        col,
        label,
        travelClass,
        priceCents:
          travelClass === 'BUSINESS' ? Math.round(flight.priceCents * 2.5) : flight.priceCents,
      });
    }
  }

  return seats;
}

async function insertFlights(client: PoolClient, flights: SeedFlight[]): Promise<void> {
  for (const flight of flights) {
    await client.query(
      `INSERT INTO flights (
         id, flight_number, origin, destination, departure_at, arrival_at,
         price_cents, currency, status, sold_out, delay_minutes, version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED', false, 0, 0)
       ON CONFLICT (id) DO NOTHING`,
      [
        flight.id,
        flight.flightNumber,
        flight.origin,
        flight.destination,
        flight.departureAt,
        flight.arrivalAt,
        flight.priceCents,
        flight.currency,
      ],
    );

    const seats = buildSeatRows(flight);
    const values: unknown[] = [];
    const placeholders = seats.map((seat, index) => {
      const offset = index * 7;
      values.push(
        seat.id,
        flight.id,
        seat.row,
        seat.col,
        seat.label,
        seat.travelClass,
        seat.priceCents,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
    });

    await client.query(
      `INSERT INTO seats (id, flight_id, seat_row, seat_col, label, class, price_cents)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (id) DO NOTHING`,
      values,
    );
  }
}

export async function seedDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await insertFlights(client, buildSeedFlights());
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
