import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8080';
export const RESET_TOKEN = process.env.TEST_RESET_TOKEN ?? 'e2e-reset-token';

export interface FlightSummary {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  status: 'SCHEDULED' | 'DELAYED' | 'CANCELLED';
  availableSeats: number;
  soldOut: boolean;
}

interface SeatMap {
  seats: Array<{
    id: string;
    label: string;
    status: 'AVAILABLE' | 'HELD' | 'BOOKED';
    isMine: boolean;
  }>;
}

interface MarkerWindow extends Window {
  __e2eMarker?: string;
}

export async function resetData(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/test/reset', {
    headers: { 'x-test-reset-token': RESET_TOKEN },
  });
  expect(response.status(), await response.text()).toBe(204);
}

export async function findFlight(
  request: APIRequestContext,
  flightNumber: string,
): Promise<FlightSummary> {
  const response = await request.get('/api/flights');
  expect(response.ok()).toBe(true);

  const flights = (await response.json()) as FlightSummary[];
  const flight = flights.find((entry) => entry.flightNumber === flightNumber);
  expect(flight, `seed flight ${flightNumber}`).toBeTruthy();
  return flight as FlightSummary;
}

export async function openSeatMap(
  page: Page,
  flightId: string,
  seatLabel = '1A',
): Promise<Locator> {
  await page.goto(`/flights/${flightId}`);
  await expect(page.getByTestId('seat-map-page')).toBeVisible();

  const seat = page.getByTestId(`seat-${seatLabel}`);
  await expect(seat).toBeVisible();
  await expect(seat).toHaveAttribute('aria-disabled', 'false');
  return seat;
}

export async function waitForLive(page: Page): Promise<void> {
  await expect(page.locator('.connection-live')).toHaveText('Live');
}

export async function waitForSearchReady(page: Page): Promise<void> {
  await expect(page.getByTestId('search-page')).toHaveAttribute('data-search-ready', 'true');
}

export function metricValue(page: Page, name: 'available' | 'held' | 'booked' | 'total'): Locator {
  return page.getByTestId(`metric-${name}`);
}

export async function markPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as MarkerWindow).__e2eMarker = 'kept';
  });
}

export async function hasMarker(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as MarkerWindow).__e2eMarker === 'kept');
}

export async function getSeatStatus(
  request: APIRequestContext,
  flightId: string,
  label: string,
): Promise<SeatMap['seats'][number]['status']> {
  const response = await request.get(`/api/flights/${flightId}/seats`);
  expect(response.ok()).toBe(true);
  const map = (await response.json()) as SeatMap;
  const seat = map.seats.find((entry) => entry.label === label);
  expect(seat, `seat ${label}`).toBeTruthy();
  return (seat as SeatMap['seats'][number]).status;
}
