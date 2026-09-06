import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { FinalSet, verifyFinal } from '../packages/domain/src/checkpoints.ts';
import { Ceremony, writeOnce } from '../apps/api/src/provisioning.ts';
import { localCore } from './local-core.ts';

// Shared by the actual operator CLI and adversarial tests. No private key is
// read and no share is created until the native archive and finality guard pass.
export async function prepareTrusteeShare(input: unknown, trust: unknown, directory: string, trusteeId: number, now: number) {
  const final = FinalSet.parse(input);
  let prior: string | null = null;
  try { prior = await readFile(`${directory}/final.sha256`, 'utf8'); }
  catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
  const reference = await localCore({ action: 'verify', archive: final.archive });
  const { finalHash } = verifyFinal(final, trust, reference, now, prior);
  await writeOnce(`${directory}/final.sha256`, finalHash);
  let share: string;
  try { share = await readFile(`${directory}/share.jsons`, 'utf8'); }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    const trustee = Ceremony.shape.trustees.element.parse(JSON.parse(await readFile(`${directory}/private.json`, 'utf8')));
    if (trustee.id !== trusteeId) throw new Error('TRUSTEE_ROLE_MISMATCH');
    share = z.strictObject({ share: z.string() }).parse(await localCore({ action: 'share', archive: final.archive, trustee })).share;
    await writeOnce(`${directory}/share.jsons`, share);
  }
  return share;
}
