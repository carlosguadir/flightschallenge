import { Injectable } from '@nestjs/common';
import type { ServerEvent } from '@flight/shared';

export type DomainEventHandler = (event: ServerEvent) => void;

@Injectable()
export class InProcessEventBus {
  private readonly handlers = new Set<DomainEventHandler>();

  publish(event: ServerEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // A failing subscriber must not break the request or the other subscribers.
      }
    }
  }

  subscribe(handler: DomainEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
