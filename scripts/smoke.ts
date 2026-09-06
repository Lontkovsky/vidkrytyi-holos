import { z } from 'zod';
const origins = ['http://127.0.0.1:4301', 'http://127.0.0.1:4302', 'http://127.0.0.1:4303', 'http://127.0.0.1:4312', 'http://127.0.0.1:4313'];
for (const origin of origins) {
  const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Service health failed: ' + origin);
  const status = z.object({ state: z.literal('ok'), environment: z.enum(['development', 'test', 'demo']), role: z.string() }).parse(await response.json());
  console.log(status.role + ': healthy in ' + status.environment);
}
const page = await fetch('http://localhost:5173/', { signal: AbortSignal.timeout(5000) });
if (!page.ok || !(await page.text()).includes('Відкритий голос')) throw new Error('WEB_UNAVAILABLE');
console.log('Web page: reachable; this HTTP check does not replace in-app Browser verification.');
