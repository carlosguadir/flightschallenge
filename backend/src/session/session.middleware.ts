import { randomUUID } from 'node:crypto';

import cookieParser from 'cookie-parser';
import type { RequestHandler } from 'express';

import type { AppConfig } from '../config/config';

const SESSION_COOKIE = 'sid';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionMiddleware(config: AppConfig): RequestHandler {
  return (request, response, next) => {
    const signedCookies = request.signedCookies as Record<string, unknown> | undefined;
    const existing = signedCookies?.[SESSION_COOKIE];

    if (typeof existing === 'string' && existing.length > 0) {
      request.sessionId = existing;
      next();
      return;
    }

    const sessionId = randomUUID();
    request.sessionId = sessionId;
    response.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      maxAge: SESSION_MAX_AGE_MS,
      signed: true,
    });
    next();
  };
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }

  return undefined;
}

export function readSessionIdFromCookieHeader(
  cookieHeader: string | undefined,
  secret: string,
): string | null {
  const raw = readCookie(cookieHeader, SESSION_COOKIE);
  if (!raw || !raw.startsWith('s:')) return null;

  const unsigned = cookieParser.signedCookie(raw, secret);
  if (typeof unsigned !== 'string' || unsigned.length === 0) return null;

  return unsigned;
}
