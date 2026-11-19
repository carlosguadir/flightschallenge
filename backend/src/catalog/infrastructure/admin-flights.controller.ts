import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import {
  UpdateFlightStatusRequestSchema,
  type UpdateFlightStatusRequest,
  type UpdateFlightStatusResponse,
} from '@flight/shared';

import { ZodValidationPipe } from '../../validation/zod-validation.pipe';
import { ChangeFlightStatus } from '../application/use-cases/change-flight-status.use-case';

@Controller('admin/flights')
export class AdminFlightsController {
  constructor(private readonly changeFlightStatus: ChangeFlightStatus) {}

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) flightId: string,
    @Body(new ZodValidationPipe(UpdateFlightStatusRequestSchema))
    body: UpdateFlightStatusRequest,
  ): Promise<UpdateFlightStatusResponse> {
    return this.changeFlightStatus.execute(flightId, body);
  }
}
