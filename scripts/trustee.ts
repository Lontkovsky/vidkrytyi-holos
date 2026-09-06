import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { FinalSet, Trust } from '../packages/domain/src/checkpoints.ts';
import { jsonRequest, readConfig } from '../apps/api/src/common.ts';
import { prepareTrusteeShare } from './trustee-client.ts';

const pollId = z.string().regex(/^[A-Za-z0-9]{14}$/).parse(process.argv[2]);
const trusteeId = z.enum(['1', '2', '3', '4']).parse(process.argv[3]);
const directory = `.runtime/trustees/${trusteeId}/${pollId}`;
const trust = Trust.parse(JSON.parse(await readFile(`${directory}/trust.json`, 'utf8')));
const final = FinalSet.parse(await jsonRequest(`http://127.0.0.1:4302/internal/final/${pollId}`, {}, (await readConfig('ballot')).serviceToken));
const share = await prepareTrusteeShare(final, trust, directory, Number(trusteeId), Date.now());
await jsonRequest(`http://127.0.0.1:4302/internal/share/${pollId}`, { trusteeId: Number(trusteeId), share }, (await readConfig('ballot')).serviceToken);
console.log(`Test trustee ${trusteeId}: final set checked; share submitted for reference verification.`);
