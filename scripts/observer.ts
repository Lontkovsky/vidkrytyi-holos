import { link, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ObserverConfig, Observation, compareObservations } from '../packages/domain/src/observer.ts';
import { observePublic } from './observer-client.ts';

async function main() {
  const [action, configFile, stateFile, otherFile] = z.tuple([z.enum(['init', 'check', 'compare']), z.string().min(1), z.string().min(1), z.string().min(1).optional()]).parse(process.argv.slice(2));
  if ((action === 'compare') !== (otherFile !== undefined)) throw new Error('OBSERVER_ARGUMENTS_INVALID');
  const config = ObserverConfig.parse(JSON.parse(await readFile(configFile, 'utf8')));
  if (action === 'compare' && otherFile !== undefined) {
    const [left, right] = await Promise.all([readFile(stateFile, 'utf8'), readFile(otherFile, 'utf8')]);
    console.log(JSON.stringify(compareObservations(config.trust, JSON.parse(left), JSON.parse(right)))); return;
  }
  await mkdir(dirname(stateFile), { recursive: true, mode: 0o700 });
  const lock = stateFile + '.lock';
  await mkdir(lock, { mode: 0o700 });
  const pending = stateFile + '.pending-' + randomUUID();
  try {
    const prior = action === 'check' ? Observation.parse(JSON.parse(await readFile(stateFile, 'utf8'))) : null;
    const { observation } = await observePublic(config, prior);
    const file = await open(pending, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(observation, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
    if (action === 'init') await link(pending, stateFile);
    else await rename(pending, stateFile);
    const directory = await open(dirname(stateFile), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    console.log(JSON.stringify({ pollId: config.trust.pollId, verification: observation.verification, checkpoints: observation.checkpoints.length, status: 'ConsistentObservationSaved' }));
  } finally { await rm(pending, { force: true }); await rm(lock, { recursive: true }); }
}

try { await main(); }
catch (error) {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]{1,100}$/.test(error.message) ? error.message : 'OBSERVER_CHECK_FAILED';
  console.error(code); process.exitCode = 1;
}
