import { createHash, verify } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { Checkpoint, Envelope, Manifest } from './index.ts';

export const FinalSet = z.strictObject({ archive: z.string(), checkpoints: z.array(Envelope).min(1), electionRaw: z.string() });
export const Trust = z.strictObject({ pollId: z.string(), manifestHash: z.string(), publicKey: z.string() });
export const CoreReport = z.object({ election: z.looseObject({ uuid: z.string(), description: z.string() }),
  closed: z.boolean(), result: z.unknown(), ballotCount: z.number().int(), trackers: z.array(z.string()) });
export function digest(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }

export function verifyChain(input: unknown, trusted: z.infer<typeof Trust>) {
  const chain = z.array(Envelope).min(1).parse(input);
  let previous: string | null = null;
  let receipts: string[] = [];
  const payloads = chain.map((entry, index) => {
    if (!verify(null, Buffer.from(entry.payload), trusted.publicKey, Buffer.from(entry.signature, 'base64'))) throw new Error('CHECKPOINT_SIGNATURE_INVALID');
    const payload = Checkpoint.parse(JSON.parse(entry.payload));
    if (payload.sequence !== index || payload.previous !== previous) throw new Error('CHECKPOINT_CHAIN_BROKEN');
    if (payload.pollId !== trusted.pollId || payload.manifestHash !== trusted.manifestHash) throw new Error('CHECKPOINT_MANIFEST_MISMATCH');
    if (new Set(payload.receipts).size !== payload.receipts.length || receipts.some(tracker => !payload.receipts.includes(tracker))) throw new Error('ACKNOWLEDGED_BALLOT_MISSING');
    previous = digest(JSON.stringify(entry));
    receipts = payload.receipts;
    return payload;
  });
  return { chain, payloads };
}

export function verifyFinal(input: unknown, trust: unknown, reference: unknown, now: number, priorFinal: string | null) {
  const final = FinalSet.parse(input), trusted = Trust.parse(trust), report = CoreReport.parse(reference);
  if (digest(final.electionRaw) !== trusted.manifestHash || !isDeepStrictEqual(JSON.parse(final.electionRaw), report.election)) throw new Error('FINAL_MANIFEST_MISMATCH');
  if (report.election.uuid !== trusted.pollId) throw new Error('WRONG_POLL');
  const manifest = Manifest.parse(JSON.parse(report.election.description));
  if (Date.parse(manifest.closesAt) > now || !report.closed || report.result !== null) throw new Error('NOT_UNPUBLISHED_FINAL_TALLY');
  if (report.ballotCount < manifest.publicationThreshold) throw new Error('RESULTS_SUPPRESSED');
  const { payloads } = verifyChain(final.checkpoints, trusted);
  const last = payloads.at(-1);
  if (last === undefined || last.state !== 'Closed' || last.archiveHash !== digest(Buffer.from(final.archive, 'base64'))) throw new Error('FINAL_ARCHIVE_MISMATCH');
  if (report.trackers.length !== report.ballotCount || JSON.stringify([...report.trackers].sort()) !== JSON.stringify([...last.receipts].sort())) throw new Error('FINAL_SET_MISMATCH');
  const finalHash = digest(JSON.stringify(final));
  if (priorFinal !== null && priorFinal !== finalHash) throw new Error('TRUSTEE_FINAL_SET_ALREADY_BOUND');
  return { finalHash, manifest };
}
