import { describe, expect, it } from 'vitest';
import worker from './index.js';

describe('Worker API Routing', () => {
  const fakeCtx = {} as ExecutionContext;
  const fakeEnv = {
    FIREBASE_PROJECT_ID: 'test-project'
  };

  it('responds with 200 on /api/health', async () => {
    const req = new Request('http://localhost/api/health');
    const res = await worker.fetch(req, fakeEnv, fakeCtx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('responds with 401 when calling /api/auth/me without token', async () => {
    const req = new Request('http://localhost/api/auth/me');
    const res = await worker.fetch(req, fakeEnv, fakeCtx);
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Missing Bearer token');
  });

  it('responds with 404 for unknown /api routes', async () => {
    const req = new Request('http://localhost/api/unknown-endpoint');
    const res = await worker.fetch(req, fakeEnv, fakeCtx);
    expect(res.status).toBe(404);
  });
});
