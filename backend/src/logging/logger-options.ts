import { randomUUID } from 'node:crypto';

import type { Options } from 'pino-http';

import type { AppConfig } from '../config/config';

export const REDACT_PATHS = [
  'authorization',
  'cookie',
  'set-cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'cvv',
  'cvc',
  'pan',
  'cardNumber',
  'card.number',
  '*.password',
  '*.cvv',
  '*.cvc',
  '*.pan',
  '*.cardNumber',
  '*.card.number',
];

export function buildPinoHttpOptions(config: AppConfig): Options {
  return {
    level: config.logLevel,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    genReqId(req, res) {
      const incoming = req.headers['x-request-id'];
      const requestId =
        typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
      res.setHeader('x-request-id', requestId);
      return requestId;
    },
    customProps() {
      return {
        service: 'flight-backend',
        version: config.appVersion,
      };
    },
    transport: config.logPretty
      ? {
          target: 'pino-pretty',
          options: { singleLine: true, colorize: true },
        }
      : undefined,
  };
}
