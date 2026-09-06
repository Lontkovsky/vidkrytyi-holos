import { spawn } from 'node:child_process';
import { z } from 'zod';

const pollId = z.string().regex(/^[A-Za-z0-9]{14}$/).parse(process.argv[2]);
// Mandatory trustee plus two of the three threshold trustees. Each invocation
// reads only its own key directory. All are local test operators, not independent.
for (const id of ['1', '2', '3']) await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/trustee.ts', pollId, id], { stdio: 'inherit', timeout: 120000 });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error('TEST_TRUSTEE_FAILED')));
});
