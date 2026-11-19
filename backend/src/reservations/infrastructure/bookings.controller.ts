import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  BookingLookupRequestSchema,
  BookingRequestSchema,
  IdempotencyKeySchema,
  type BookingLookupRequest,
  type BookingLookupResponse,
  type BookingRequest,
  type BookingResponse,
} from '@flight/shared';
import type { Request, Response } from 'express';

import { AppError } from '../../shared-kernel';
import { ZodValidationPipe } from '../../validation/zod-validation.pipe';
import { ConfirmBooking } from '../application/use-cases/confirm-booking.use-case';
import { LookupBooking } from '../application/use-cases/lookup-booking.use-case';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly confirmBooking: ConfirmBooking,
    private readonly lookupBooking: LookupBooking,
  ) {}

  @Post()
  async confirm(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(BookingRequestSchema)) body: BookingRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingResponse> {
    const key = IdempotencyKeySchema.safeParse(idempotencyKey?.trim());
    if (!key.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Idempotency-Key header is required and must be a UUID',
        key.error.flatten(),
      );
    }

    const result = await this.confirmBooking.execute({
      ...body,
      idempotencyKey: key.data,
      sessionId: request.sessionId,
    });

    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.booking;
  }

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  lookup(
    @Body(new ZodValidationPipe(BookingLookupRequestSchema))
    body: BookingLookupRequest,
  ): Promise<BookingLookupResponse> {
    return this.lookupBooking.execute(body);
  }
}
