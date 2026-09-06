import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { Failure } from './common.ts';

export const Ceremony = z.strictObject({ uuid: z.string(), electionRaw: z.string(), archive: z.string(),
  privateCredentials: z.record(z.string(), z.string()), trustees: z.array(z.union([
    z.strictObject({ id: z.literal(1), privateKey: z.string() }),
    z.strictObject({ id: z.number().int().min(2).max(4), key: z.string(), decryptionKey: z.string() }),
  ])) });

// A retry may reuse exactly the committed input. It must never generate a new
// credential roster or trustee set for the same provisioning operation.
export async function writeOnce(path: string, content: string): Promise<void> {
  try { await writeFile(path, content, { mode: 0o600, flag: 'wx', flush: true }); }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    if (await readFile(path, 'utf8') !== content) throw new Failure('IMMUTABLE_PROVISIONING_MISMATCH', 409);
  }
}

export async function provision(id: string, requestHash: string, create: () => Promise<unknown>) {
  const directory = `.runtime/provisioning/${id}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeOnce(`${directory}/input.sha256`, requestHash);
  const path = `${directory}/ceremony.json`;
  try { return Ceremony.parse(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  const setup = Ceremony.parse(await create());
  await writeOnce(path, JSON.stringify(setup));
  return setup;
}
