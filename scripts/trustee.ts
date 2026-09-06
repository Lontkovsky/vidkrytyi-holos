import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { FinalSet, Trust, verifyFinal } from '../packages/domain/src/checkpoints.ts';
import { jsonRequest, readConfig } from '../apps/api/src/common.ts';
import { Ceremony, writeOnce } from '../apps/api/src/provisioning.ts';
import { localCore } from './local-core.ts';

const pollId = z.string().regex(/^[A-Za-z0-9]{14}$/).parse(process.argv[2]);
const trusteeId = z.enum(['1', '2', '3', '4']).parse(process.argv[3]);
const directory = `.runtime/trustees/${trusteeId}/${pollId}`;
const trust = Trust.parse(JSON.parse(await readFile(`${directory}/trust.json`, 'utf8')));
const final = FinalSet.parse(await jsonRequest(`http://127.0.0.1:4302/internal/final/${pollId}`, {}, (await readConfig('ballot')).serviceToken));
let prior: string | null = null;
try { prior = await readFile(`${directory}/final.sha256`, 'utf8'); }
catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
const reference = await localCore({ action: 'verify', archive: final.archive });
const { finalHash } = verifyFinal(final, trust, reference, Date.now(), prior);
await writeOnce(`${directory}/final.sha256`, finalHash);
let share: string;
try { share = await readFile(`${directory}/share.jsons`, 'utf8'); }
catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  const trustee = Ceremony.shape.trustees.element.parse(JSON.parse(await readFile(`${directory}/private.json`, 'utf8')));
  if (String(trustee.id) !== trusteeId) throw new Error('TRUSTEE_ROLE_MISMATCH');
  share = z.strictObject({ share: z.string() }).parse(await localCore({ action: 'share', archive: final.archive, trustee })).share;
  await writeOnce(`${directory}/share.jsons`, share);
}
await jsonRequest(`http://127.0.0.1:4302/internal/share/${pollId}`, { trusteeId: Number(trusteeId), share }, (await readConfig('ballot')).serviceToken);
console.log(`Test trustee ${trusteeId}: final set checked; share submitted for reference verification.`);
