import type { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

import { AppError } from '../shared-kernel/domain/app-error';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid request', result.error.flatten());
    }
    return result.data;
  }
}
