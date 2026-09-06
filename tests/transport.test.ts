import { expect, it } from 'vitest';
import { setTimeout } from 'node:timers/promises';
import { application } from '../apps/api/src/common.ts';

it('keeps a bounded eleven-second native-processing response connected', async () => {
  const app = await application({ environment: 'test', role: 'management', port: 0, serviceToken: 'synthetic-transport-test-token-not-a-real-secret' });
  let responseCompleted = false;
  app.post('/synthetic-processing', async () => { await setTimeout(11000); responseCompleted = true; return { state: 'Finished' }; });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const started = Date.now();
  try {
    const response = await fetch(origin + '/synthetic-processing', { method: 'POST', signal: AbortSignal.timeout(15000) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: 'Finished' });
    expect(responseCompleted).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(11000);
  } finally { await app.close(); }
}, 20000);
