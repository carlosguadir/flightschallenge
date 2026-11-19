import { Inject, Injectable } from '@nestjs/common';
import type { BookingLookupRequest, BookingLookupResponse } from '@flight/shared';

import { AppError } from '../../../shared-kernel';
import { BOOKING_REPOSITORY, type BookingRepository } from '../ports/booking-repository.port';

@Injectable()
export class LookupBooking {
  constructor(@Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository) {}

  async execute(query: BookingLookupRequest): Promise<BookingLookupResponse> {
    const booking = await this.bookings.findByCodeAndEmail(query.code, query.email);
    if (!booking) {
      throw new AppError('BOOKING_NOT_FOUND', 404, 'Booking not found');
    }

    return {
      code: booking.code,
      flightId: booking.flightId,
      flightNumber: booking.flightNumber,
      origin: booking.origin,
      destination: booking.destination,
      departureAt: booking.departureAt.toISOString(),
      seatLabel: booking.seatLabel,
      passengerName: booking.passengerName,
      amountCents: booking.amountCents,
      currency: booking.currency,
      createdAt: booking.createdAt.toISOString(),
    };
  }
}
