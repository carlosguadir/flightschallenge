import type { Server } from 'node:http';
import request from 'supertest';

export function setCookieHeader(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown;
  const value = Array.isArray(header)
    ? (header[0] as string | undefined)
    : (header as string | undefined);
  if (!value) throw new Error('Expected a Set-Cookie header');
  return value;
}

export interface TestSession {
  agent: ReturnType<typeof request.agent>;
  cookie: string;
}

export async function createSession(server: Server): Promise<TestSession> {
  const agent = request.agent(server);
  const response = await agent.get('/api/health').expect(200);
  return {
    agent,
    cookie: setCookieHeader(response).split(';')[0],
  };
}
