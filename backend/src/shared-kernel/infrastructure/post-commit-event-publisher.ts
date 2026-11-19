import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import type { ServerEvent } from '@flight/shared';

import type { EventPublisher } from '../application/ports/event-publisher.port';
import { InProcessEventBus } from './in-process-event-bus';

@Injectable()
export class PostCommitEventPublisher implements EventPublisher {
  private readonly storage = new AsyncLocalStorage<ServerEvent[]>();

  constructor(private readonly bus: InProcessEventBus) {}

  publish(event: ServerEvent): void {
    const pending = this.storage.getStore();
    if (pending) {
      pending.push(event);
      return;
    }
    this.bus.publish(event);
  }

  collect<T>(pending: ServerEvent[], work: () => Promise<T>): Promise<T> {
    return this.storage.run(pending, work);
  }

  flush(pending: ServerEvent[]): void {
    for (const event of pending) {
      this.bus.publish(event);
    }
  }
}
