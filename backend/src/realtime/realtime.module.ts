import { Module } from '@nestjs/common';

import { InsightsModule } from '../insights/insights.module';
import { SharedKernelModule } from '../shared-kernel/shared-kernel.module';
import { RealtimeEventPublisher } from './realtime-event.publisher';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [SharedKernelModule, InsightsModule],
  providers: [RealtimeGateway, RealtimeEventPublisher],
})
export class RealtimeModule {}
