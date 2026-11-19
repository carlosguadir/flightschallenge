import { Inject, Injectable } from '@nestjs/common';
import type { BookingRequest, BookingResponse } from '@flight/shared';

import { FLIGHT_STATE_PORT, type FlightStatePort } from '../../../catalog';
import { PAYMENT_PORT, type PaymentPort } from '../../../payments';
import {
  AppError,
  EVENT_PUBLISHER,
  ID_GENERATOR,
  UNIT_OF_WORK,
  type DbTransaction,
  type EventPublisher,
  type IdGenerator,
  type UnitOfWork,
} from '../../../shared-kernel';
import { BookingWriteConflict } from '../../domain/booking-write-conflict';
import { hashBookingRequest } from '../booking-request-hash';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type BookingRepository,
  type NewBooking,
} from '../ports/booking-repository.port';
import { SEAT_REPOSITORY, type SeatRepository } from '../ports/seat-repository.port';

export interface ConfirmBookingCommand extends BookingRequest {
  idempotencyKey: string;
  sessionId: string;
}

export interface ConfirmBookingResult {
  created: boolean;
  booking: BookingResponse;
}

const BOOKING_CODE_ATTEMPTS = 3;

@Injectable()
export class ConfirmBooking {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SEAT_REPOSITORY) private readonly seats: SeatRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(FLIGHT_STATE_PORT) private readonly flightState: FlightStatePort,
    @Inject(PAYMENT_PORT) private readonly payments: PaymentPort,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: ConfirmBookingCommand): Promise<ConfirmBookingResult> {
    const requestHash = hashBookingRequest(command);

    const existing = await this.bookings.findByKey(command.idempotencyKey);
    if (existing) {
      return this.replay(existing, requestHash);
    }

    try {
      return await this.unitOfWork.runInFlightTransaction(command.flightId, async (tx) => {
        const existingInTransaction = await this.bookings.findByKeyInTransaction(
          tx,
          command.idempotencyKey,
        );
        if (existingInTransaction) {
          return this.replay(existingInTransaction, requestHash);
        }

        const seat = await this.seats.lockForBooking(tx, command.flightId, command.seatId);
        if (!seat) {
          throw new AppError('SEAT_UNAVAILABLE', 409, 'Seat does not belong to this flight');
        }

        if (seat.flightStatus === 'CANCELLED') {
          throw new AppError('FLIGHT_NOT_BOOKABLE', 409, 'Flight is cancelled');
        }

        const owned =
          seat.status === 'HELD' && seat.heldBySession === command.sessionId && seat.holdActive;

        if (!owned) {
          if (seat.status === 'HELD' && seat.heldBySession !== command.sessionId) {
            throw new AppError('SEAT_UNAVAILABLE', 409, 'Seat is held by another session');
          }

          const replay = await this.bookings.findByKeyInTransaction(tx, command.idempotencyKey);
          if (replay) {
            return this.replay(replay, requestHash);
          }

          throw new AppError('HOLD_EXPIRED', 410, 'Hold is not active');
        }

        const payment = await this.payments.charge({
          method: command.payment.method,
          amountCents: seat.priceCents,
          currency: seat.currency,
        });

        if (payment.status === 'DECLINED') {
          throw new AppError('PAYMENT_DECLINED', 402, 'Payment declined');
        }

        const booking = await this.insertWithCodeRetry(tx, {
          id: this.ids.uuid(),
          flightId: command.flightId,
          seatId: command.seatId,
          seatLabel: seat.label,
          sessionId: command.sessionId,
          passengerName: command.passenger.name,
          passengerEmail: command.passenger.email,
          amountCents: seat.priceCents,
          currency: seat.currency,
          idempotencyKey: command.idempotencyKey,
          requestHash,
        });

        const updated = await tx.query<{ id: string }>(
          `UPDATE seats
           SET status = 'BOOKED',
               held_by_session = NULL,
               hold_expires_at = NULL,
               booking_id = $3,
               version = version + 1
           WHERE id = $1
             AND flight_id = $2
             AND status = 'HELD'
             AND held_by_session = $4
             AND hold_expires_at > now()
           RETURNING id`,
          [command.seatId, command.flightId, booking.id, command.sessionId],
        );

        if (updated.rowCount !== 1) {
          throw new AppError('HOLD_EXPIRED', 410, 'Hold expired during payment', {
            refunded: true,
          });
        }

        const state = await this.flightState.recordSeatChange(tx, command.flightId, 1);

        this.events.publish({
          name: 'seat.booked',
          payload: {
            flightId: command.flightId,
            seatId: command.seatId,
            label: seat.label,
            version: state.seatEventVersions[0] ?? state.flightVersion,
          },
        });

        if (state.soldOutToggled) {
          this.events.publish({
            name: 'flight.updated',
            payload: {
              flightId: command.flightId,
              status: state.status,
              delayMinutes: state.delayMinutes,
              soldOut: state.soldOut,
              availableSeats: state.availableSeats,
              version: state.flightVersion,
            },
          });
        }

        return { created: true, booking: this.toResponse(booking) };
      });
    } catch (error) {
      if (error instanceof BookingWriteConflict) {
        const winner = await this.bookings.findByKey(command.idempotencyKey);
        if (winner) {
          return this.replay(winner, requestHash);
        }

        if (error.constraint === 'bookings_seat_id_key') {
          throw new AppError('SEAT_UNAVAILABLE', 409, 'Seat is already booked');
        }
        if (error.constraint === 'bookings_code_key') {
          throw new AppError('INTERNAL_ERROR', 500, 'Could not allocate a booking code');
        }

        throw new AppError('IDEMPOTENCY_CONFLICT', 409, 'Idempotency key conflict');
      }

      throw error;
    }
  }

  private async insertWithCodeRetry(
    tx: DbTransaction,
    booking: Omit<NewBooking, 'code'>,
  ): Promise<BookingRecord> {
    for (let attempt = 0; attempt < BOOKING_CODE_ATTEMPTS; attempt += 1) {
      const code = this.ids.bookingCode();
      await tx.query('SAVEPOINT booking_insert');

      try {
        const record = await this.bookings.insert(tx, { ...booking, code });
        await tx.query('RELEASE SAVEPOINT booking_insert');
        return record;
      } catch (error) {
        if (
          error instanceof BookingWriteConflict &&
          error.constraint === 'bookings_code_key' &&
          attempt < BOOKING_CODE_ATTEMPTS - 1
        ) {
          await tx.query('ROLLBACK TO SAVEPOINT booking_insert');
          continue;
        }
        throw error;
      }
    }

    throw new AppError('INTERNAL_ERROR', 500, 'Could not allocate a booking code');
  }

  private replay(record: BookingRecord, requestHash: string): ConfirmBookingResult {
    if (record.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        409,
        'Idempotency key was used with a different payload',
      );
    }

    return { created: false, booking: this.toResponse(record) };
  }

  private toResponse(record: BookingRecord): BookingResponse {
    return {
      code: record.code,
      flightId: record.flightId,
      seatId: record.seatId,
      seatLabel: record.seatLabel,
      amountCents: record.amountCents,
      currency: record.currency,
      passenger: {
        name: record.passengerName,
        email: record.passengerEmail,
      },
      createdAt: record.createdAt.toISOString(),
    };
  }
}
