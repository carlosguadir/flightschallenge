import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  BASE_URL,
  findFlight,
  getSeatStatus,
  hasMarker,
  markPage,
  metricValue,
  openSeatMap,
  resetData,
  waitForLive,
} from './helpers';

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((context) => context.close()));
});

test('E2E-1: a hold in one context appears live in another', async ({ browser, request }) => {
  const flight = await findFlight(request, 'AV1001');
  const contextA = await browser.newContext({ baseURL: BASE_URL });
  const contextB = await browser.newContext({ baseURL: BASE_URL });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const [seatA, seatB] = await Promise.all([
    openSeatMap(pageA, flight.id),
    openSeatMap(pageB, flight.id),
  ]);

  await markPage(pageB);
  await seatA.click();

  await expect(seatA).toHaveClass(/seat-mine/);
  await expect(seatB).toHaveClass(/seat-other/);
  await expect(seatB).toHaveAttribute('aria-label', /held/);
  await expect(seatB).toHaveAttribute('aria-pressed', 'false');
  expect(await hasMarker(pageB)).toBe(true);
  expect(await getSeatStatus(request, flight.id, '1A')).toBe('HELD');
});

test('E2E-2: booking in one context locks the seat in the other and shows the ticket', async ({
  browser,
  request,
}) => {
  const flight = await findFlight(request, 'AV1002');
  const contextA = await browser.newContext({ baseURL: BASE_URL });
  const contextB = await browser.newContext({ baseURL: BASE_URL });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const [seatA, seatB] = await Promise.all([
    openSeatMap(pageA, flight.id),
    openSeatMap(pageB, flight.id),
  ]);

  await seatA.click();
  await expect(seatA).toHaveClass(/seat-mine/);
  await expect(pageA.getByTestId('confirm-booking')).toBeEnabled();

  await pageA.getByLabel('Passenger name').fill('Ada Lovelace');
  await pageA.getByLabel('Passenger email').fill('ada@example.com');
  await pageA.getByTestId('confirm-booking').click();

  await expect(pageA).toHaveURL(/\/booking\/[A-HJ-NP-Z2-9]{6}$/);
  const code = pageA.url().split('/').pop() ?? '';
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  await expect(seatB).toHaveClass(/seat-booked/);
  await expect(seatB).toHaveAttribute('aria-disabled', 'true');
  await seatB.click({ force: true });
  await expect(seatB).toHaveAttribute('aria-pressed', 'false');
  await expect(
    pageB.getByText(
      'Select an available seat to hold it for a few minutes. Holds are released automatically when the timer ends.',
    ),
  ).toBeVisible();

  await expect(pageA.getByTestId('ticket-page')).toContainText(code);
  await pageA.getByLabel('Passenger email').fill('ada@example.com');
  await pageA.getByRole('button', { name: 'View ticket' }).click();
  await expect(pageA.getByTestId('ticket')).toContainText(code);
  await expect(pageA.getByTestId('ticket')).toContainText('1A');
  await expect(pageA.getByTestId('ticket')).toContainText('Ada Lovelace');
});

test('E2E-3: an admin status change reaches the search list and disables a cancelled flight', async ({
  browser,
  request,
}) => {
  const flight = await findFlight(request, 'AV1003');
  const contextB = await browser.newContext({ baseURL: BASE_URL });
  const pageB = await contextB.newPage();

  await pageB.goto('/');
  await waitForLive(pageB);

  const card = pageB.getByTestId(`flight-${flight.id}`);
  await expect(card).toBeVisible();
  await markPage(pageB);

  const update = await request.patch(`/api/admin/flights/${flight.id}/status`, {
    data: { status: 'CANCELLED' },
  });
  expect(update.status()).toBe(200);

  await expect(card.getByText('Cancelled')).toBeVisible();
  expect(await hasMarker(pageB)).toBe(true);

  await card.getByRole('link', { name: 'Choose seats' }).click();
  await expect(pageB).toHaveURL(new RegExp(`/flights/${flight.id}$`));
  await expect(
    pageB.getByText(
      'This flight is cancelled. The seat map is read-only and checkout is disabled.',
    ),
  ).toBeVisible();
  await expect(pageB.getByTestId('seat-1A')).toHaveAttribute('aria-disabled', 'true');
  await expect(pageB.getByTestId('confirm-booking')).toHaveCount(0);
});

test('E2E-4: an expired hold returns the seat and updates both contexts and the dashboard', async ({
  browser,
  request,
}) => {
  const flight = await findFlight(request, 'AV1004');
  const contextA = await browser.newContext({ baseURL: BASE_URL });
  const contextB = await browser.newContext({ baseURL: BASE_URL });
  const pageA = await contextA.newPage();
  const dashboardB = await contextB.newPage();
  const pageB = await contextB.newPage();

  await dashboardB.goto(`/dashboard/${flight.id}`);
  await waitForLive(dashboardB);
  await expect(metricValue(dashboardB, 'available')).toHaveText('180');
  await expect(metricValue(dashboardB, 'held')).toHaveText('0');

  const [seatA, seatB] = await Promise.all([
    openSeatMap(pageA, flight.id),
    openSeatMap(pageB, flight.id),
  ]);

  await seatA.click();
  await expect(seatA).toHaveClass(/seat-mine/);
  await expect(seatB).toHaveClass(/seat-other/);
  await expect(metricValue(dashboardB, 'held')).toHaveText('1');
  await expect(metricValue(dashboardB, 'available')).toHaveText('179');
  await expect(dashboardB.getByText('Seat 1A held')).toBeVisible();

  await expect(seatA).toHaveClass(/seat-available/, { timeout: 20_000 });
  await expect(seatB).toHaveClass(/seat-available/, { timeout: 20_000 });
  await expect(metricValue(dashboardB, 'held')).toHaveText('0', { timeout: 20_000 });
  await expect(metricValue(dashboardB, 'available')).toHaveText('180');
  await expect(dashboardB.getByText('Seat 1A released (expired)')).toBeVisible();
});

test('E2E-5: the seat map passes axe WCAG 2.1 AA checks', async ({ browser, request }) => {
  const flight = await findFlight(request, 'AV1005');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  await openSeatMap(page, flight.id);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
