import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { REDACT_PATHS } from '../../src/logging/logger-options';

describe('structured logging redaction', () => {
  it('redacts credentials and card data', () => {
    const lines: string[] = [];
    const stream = {
      write(line: string): void {
        lines.push(line);
      },
    };
    const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream);

    logger.info(
      {
        authorization: 'Bearer super-secret',
        cookie: 'sid=s%3Asecret.signature',
        password: 'plain-text',
        card: { number: '4111111111111111' },
      },
      'sample payload',
    );

    const entry = JSON.parse(lines[0]) as {
      authorization: string;
      cookie: string;
      password: string;
      card: { number: string };
    };

    expect(entry.authorization).toBe('[REDACTED]');
    expect(entry.cookie).toBe('[REDACTED]');
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.card.number).toBe('[REDACTED]');
  });
});
