import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

interface HealthResponse {
  status: 'ok';
  db: 'up';
}

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new Error(`Health check failed with ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

export function App(): JSX.Element {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: 1 });

  return (
    <main className="shell">
      <p className="eyebrow">Flight Booking Challenge</p>
      <h1>Seats, holds and bookings in real time.</h1>
      <p className="lede">
        Phase 0 skeleton: the API, PostgreSQL, Podman Compose, session cookie and test harness are
        wired. Search, seat map and live updates arrive in the next phases.
      </p>

      <section className="status" aria-live="polite">
        <span className={health.isSuccess ? 'dot dot-ok' : 'dot dot-pending'} />
        <span>
          {health.isSuccess
            ? `API ${health.data.status} · database ${health.data.db}`
            : health.isError
              ? 'API unavailable'
              : 'Checking API…'}
        </span>
      </section>
    </main>
  );
}
