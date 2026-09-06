import { link, mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ObserverConfig } from '../packages/domain/src/observer.ts';
import { observePublic } from './observer-client.ts';

async function main() {
  const [configFile, output] = z.tuple([z.string().min(1), z.string().min(1)]).parse(process.argv.slice(2));
  const config = ObserverConfig.parse(JSON.parse(await readFile(configFile, 'utf8')));
  const { observation, audit } = await observePublic(config, null);
  if (audit === null || observation.verification !== 'ReferenceVerified') throw new Error('AUDIT_NOT_PUBLISHABLE');
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const pending = output + '.pending-' + randomUUID();
  try {
    const file = await open(pending, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(audit, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
    await link(pending, output);
    const directory = await open(dirname(output), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    console.log(JSON.stringify({ pollId: config.trust.pollId, status: 'NativeAuditExported', archiveHash: observation.publishedArchiveHash }));
  } finally { await rm(pending, { force: true }); }
}

try { await main(); }
catch (error) {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]{1,100}$/.test(error.message) ? error.message : 'AUDIT_EXPORT_FAILED';
  console.error(code); process.exitCode = 1;
}
