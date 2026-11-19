import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ErrorCode } from '@flight/shared';
import type { Response } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../shared-kernel/domain/app-error';

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_NOT_FOUND = 404;
const HTTP_BAD_REQUEST = 400;

function codeForStatus(status: number): ErrorCode {
  if (status === HTTP_TOO_MANY_REQUESTS) return 'RATE_LIMITED';
  if (status === HTTP_NOT_FOUND) return 'NOT_FOUND';
  if (status === HTTP_BAD_REQUEST) return 'VALIDATION_ERROR';
  return 'INTERNAL_ERROR';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      response.status(exception.statusCode).json({
        code: exception.code,
        message: exception.message,
        ...(exception.details === undefined ? {} : { details: exception.details }),
      });
      return;
    }

    if (exception instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: exception.flatten(),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const rawMessage =
        typeof payload === 'string'
          ? payload
          : (payload as { message?: string | string[] }).message;

      const message = Array.isArray(rawMessage)
        ? rawMessage.join('; ')
        : (rawMessage ?? exception.message);

      response.status(status).json({
        code: codeForStatus(status),
        message,
      });
      return;
    }

    this.logger.error(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}
