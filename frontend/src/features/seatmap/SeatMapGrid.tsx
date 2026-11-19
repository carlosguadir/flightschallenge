import { useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import type { Seat } from '@flight/shared';

import { formatMoney } from '../../lib/format';
import type { SeatMapState } from './seatMapReducer';

interface SeatMapGridProps {
  state: SeatMapState;
  selectedSeatId: string | null;
  readOnly: boolean;
  currency: string;
  onSeatClick: (seat: Seat) => void;
}

function statusText(seat: Seat): string {
  if (seat.status === 'BOOKED') return 'booked';
  if (seat.status === 'HELD') return seat.isMine ? 'held by you' : 'held';
  return 'available';
}

function seatIcon(seat: Seat): string {
  if (seat.status === 'BOOKED') return '×';
  if (seat.status === 'HELD') return seat.isMine ? '★' : '•';
  return '';
}

export function SeatMapGrid({
  state,
  selectedSeatId,
  readOnly,
  currency,
  onSeatClick,
}: SeatMapGridProps): JSX.Element {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [focusLabel, setFocusLabel] = useState<string | null>(null);

  const seats = useMemo(
    () => state.order.map((id) => state.seats[id]).filter(Boolean),
    [state.order, state.seats],
  );
  const rows = useMemo(
    () => [...new Set(seats.map((seat) => seat.row))].sort((a, b) => a - b),
    [seats],
  );
  const columns = useMemo(() => [...new Set(seats.map((seat) => seat.col))].sort(), [seats]);

  const isActionable = (seat: Seat): boolean =>
    !readOnly && (seat.status === 'AVAILABLE' || (seat.status === 'HELD' && seat.isMine));

  const firstActionable = seats.find(isActionable)?.label ?? null;
  const activeLabel = focusLabel ?? firstActionable;

  const findSeat = (row: number, col: string): Seat | undefined =>
    seats.find((seat) => seat.row === row && seat.col === col);

  const moveFocus = (seat: Seat, rowDelta: number, colDelta: number): void => {
    const columnIndex = columns.indexOf(seat.col);
    const nextCol = columns[columnIndex + colDelta];
    if (!nextCol) return;
    const target = findSeat(seat.row + rowDelta, nextCol);
    if (!target) return;
    setFocusLabel(target.label);
    refs.current.get(target.label)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, seat: Seat): void => {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(seat, -1, 0);
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(seat, 1, 0);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveFocus(seat, 0, -1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveFocus(seat, 0, 1);
        break;
      case 'Home': {
        event.preventDefault();
        const target = findSeat(seat.row, columns[0]);
        if (target) {
          setFocusLabel(target.label);
          refs.current.get(target.label)?.focus();
        }
        break;
      }
      case 'End': {
        event.preventDefault();
        const target = findSeat(seat.row, columns[columns.length - 1]);
        if (target) {
          setFocusLabel(target.label);
          refs.current.get(target.label)?.focus();
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div className="seat-map-wrap">
      <div className="legend" aria-label="Seat legend">
        <span className="legend-item">
          <span className="legend-swatch seat-available" aria-hidden="true" /> Available
        </span>
        <span className="legend-item">
          <span className="legend-swatch seat-held-mine" aria-hidden="true" /> Held by you
        </span>
        <span className="legend-item">
          <span className="legend-swatch seat-held" aria-hidden="true" /> Held
        </span>
        <span className="legend-item">
          <span className="legend-swatch seat-booked" aria-hidden="true" /> Booked
        </span>
      </div>

      <div className="seat-map-scroll">
        <div className="seat-map" role="group" aria-label="Seat map">
          <div className="seat-map-header" aria-hidden="true">
            <span />
            {columns.map((column) => (
              <span key={column}>{column}</span>
            ))}
            <span />
          </div>

          {rows.map((row) => (
            <div className="seat-row" key={row}>
              <span className="row-label" aria-hidden="true">
                {row}
              </span>
              {columns.map((column) => {
                const seat = findSeat(row, column);
                if (!seat) {
                  return <span className="seat-gap" key={`${row}${column}`} />;
                }

                const actionable = isActionable(seat);
                const selected = selectedSeatId === seat.id;
                const classes = [
                  'seat',
                  `seat-${seat.status.toLowerCase()}`,
                  seat.isMine ? 'seat-mine' : '',
                  seat.status === 'HELD' && !seat.isMine ? 'seat-other' : '',
                  selected ? 'seat-selected' : '',
                  seat.class === 'BUSINESS' ? 'seat-business' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <button
                    key={seat.id}
                    ref={(element) => {
                      if (element) refs.current.set(seat.label, element);
                      else refs.current.delete(seat.label);
                    }}
                    type="button"
                    className={classes}
                    aria-label={`Seat ${seat.label}, ${seat.class.toLowerCase()}, ${statusText(
                      seat,
                    )}, ${formatMoney(seat.priceCents, currency)}`}
                    aria-pressed={selected}
                    aria-disabled={!actionable}
                    tabIndex={seat.label === activeLabel ? 0 : -1}
                    data-testid={`seat-${seat.label}`}
                    onFocus={() => setFocusLabel(seat.label)}
                    onKeyDown={(event) => handleKeyDown(event, seat)}
                    onClick={() => {
                      if (actionable) onSeatClick(seat);
                    }}
                  >
                    <span className="seat-label">{seat.label}</span>
                    <span className="seat-icon" aria-hidden="true">
                      {seatIcon(seat)}
                    </span>
                  </button>
                );
              })}
              <span className="row-label" aria-hidden="true">
                {row}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
