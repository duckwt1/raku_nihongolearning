import { describe, expect, it } from 'vitest';
import worker from './index.js';

describe('Worker API Routing & AI endpoints', () => {
  const fakeCtx = {} as ExecutionContext;
  const fakeEnv = {
    FIREBASE_PROJECT_ID: 'test-project',
    GEMINI_API_KEY: 'test-fake-key'
  };

  it('responds with 200 on /api/health', async () => {
    const req = new Request('http://localhost/api/health');
    const res = await worker.fetch(req, fakeEnv, fakeCtx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('rejects /api/ai/generate when no Authorization token is provided', async () => {
    const req = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    });
    const res = await worker.fetch(req, fakeEnv, fakeCtx);
    expect(res.status).toBe(401);
  });

  it('rejects /api/ai/import-analyze when no Authorization token is provided', async () => {
    const req = new Request('http://localhost/api/ai/import-analyze', {
      method: 'POST',
      body: JSON.stringify({ text: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    });
    const res = await worker.fetch(req, fakeEnv, fakeCtx);
    expect(res.status).toBe(401);
  });
});
