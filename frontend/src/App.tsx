import type { JSX } from 'react';
import { Link, Route, Routes } from 'react-router-dom';

import { ConnectionBadge } from './components/Badges';
import { TicketPage } from './features/booking/TicketPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SearchPage } from './features/search/SearchPage';
import { SeatMapPage } from './features/seatmap/SeatMapPage';

function NotFound(): JSX.Element {
  return (
    <section className="page">
      <div className="card empty-state">
        <h1>Page not found</h1>
        <p className="muted">The route you followed does not exist.</p>
        <Link className="button button-primary" to="/">
          Back to search
        </Link>
      </div>
    </section>
  );
}

export function App(): JSX.Element {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            FB
          </span>
          <span>Flight Booking</span>
        </Link>
        <nav className="topnav" aria-label="Main navigation">
          <Link to="/">Search</Link>
        </nav>
        <ConnectionBadge />
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/flights/:flightId" element={<SeatMapPage />} />
          <Route path="/booking/:code" element={<TicketPage />} />
          <Route path="/dashboard/:flightId" element={<DashboardPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="footer">
        <p>Flight Booking Challenge · live inventory over one transactional core.</p>
      </footer>
    </div>
  );
}
