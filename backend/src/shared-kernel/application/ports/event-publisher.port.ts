import type { ServerEvent } from '@flight/shared';

export interface EventPublisher {
  publish(event: ServerEvent): void;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
