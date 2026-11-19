import type { JSX } from 'react';
import type { FlightStatus } from '@flight/shared';

import { useSocket } from '../lib/useSocket';

export function FlightBadges({
  status,
  delayMinutes,
  soldOut,
}: {
  status: FlightStatus;
  delayMinutes: number;
  soldOut: boolean;
}): JSX.Element | null {
  if (status === 'CANCELLED') {
    return <span className="badge badge-cancelled">Cancelled</span>;
  }

  return (
    <>
      {status === 'DELAYED' ? (
        <span className="badge badge-delayed">
          Delayed {delayMinutes > 0 ? `+${delayMinutes}m` : ''}
        </span>
      ) : null}
      {soldOut ? <span className="badge badge-soldout">Sold out</span> : null}
    </>
  );
}

export function ConnectionBadge(): JSX.Element {
  const { socket, connected } = useSocket();
  const label = connected ? 'Live' : socket ? 'Reconnecting' : 'Connecting';

  return (
    <span className={`connection connection-${connected ? 'live' : 'pending'}`}>
      <span className="connection-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
