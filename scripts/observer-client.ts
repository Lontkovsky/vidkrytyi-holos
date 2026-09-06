import { z } from 'zod';
import { Envelope, Manifest, Receipt, ResultContract } from '../packages/domain/src/index.ts';
import { AuditPackage, ObserverConfig, inspectObservation, observerChain } from '../packages/domain/src/observer.ts';
import { digest } from '../packages/domain/src/checkpoints.ts';
import { localCore } from './local-core.ts';

async function publicGet(origin: string, path: string): Promise<unknown> {
  const response = await fetch(origin + path, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(response.status === 404 ? 'PUBLIC_RESOURCE_MISSING' : 'PUBLIC_RESOURCE_UNAVAILABLE');
  if (response.headers.get('content-type')?.split(';')[0] !== 'application/json' || response.body === null) throw new Error('PUBLIC_RESPONSE_INVALID');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '', size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('PUBLIC_RESPONSE_TOO_LARGE'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  return JSON.parse(text);
}

export async function observePublic(configInput: unknown, prior: unknown | null) {
  const config = ObserverConfig.parse(configInput), base = '/v1/elections/' + config.trust.pollId;
  const [manifestInput, checkpointInput, catalogue] = await Promise.all([
    publicGet(config.ballotOrigin, base + '/manifest'), publicGet(config.ballotOrigin, base + '/checkpoints'), publicGet(config.managementOrigin, '/v1/polls'),
  ]);
  const manifest = z.object({ electionRaw: z.string(), manifestHash: z.string(), checkpointPublicKey: z.string() }).parse(manifestInput);
  if (manifest.manifestHash !== config.trust.manifestHash || digest(manifest.electionRaw) !== config.trust.manifestHash) throw new Error('OBSERVER_MANIFEST_CHANGED');
  const content = Manifest.parse(JSON.parse(z.object({ description: z.string() }).parse(JSON.parse(manifest.electionRaw)).description));
  const checkpoints = z.object({ checkpoints: z.array(Envelope).min(1), publicKey: z.string() }).parse(checkpointInput);
  const last = observerChain(checkpoints.checkpoints, config.trust).payloads.at(-1);
  if (last === undefined) throw new Error('CHECKPOINTS_MISSING');
  const state = last.state;
  const poll = await publicGet(config.managementOrigin, '/v1/polls/' + content.id);
  if (z.object({ contentStatus: z.literal('Removed') }).safeParse(poll).success) throw new Error('PUBLIC_CONTENT_REMOVED');
  const trackerReplies: unknown[] = [];
  for (const envelope of config.receipts) {
    const claim = Receipt.parse(JSON.parse(envelope.payload));
    trackerReplies.push(await publicGet(config.ballotOrigin, base + '/tracker?tracker=' + encodeURIComponent(claim.tracker)));
  }
  const audit = state === 'Published' ? AuditPackage.parse(await publicGet(config.ballotOrigin, base + '/audit')) : null;
  const result = state === 'Published' ? ResultContract.parse(await publicGet(config.ballotOrigin, base + '/result')) : null;
  const reference = audit === null ? null : await localCore({ action: 'verify', archive: audit.archive });
  const observation = inspectObservation(config, { manifest, checkpoints, catalogue, poll, trackerReplies, audit, result, reference }, prior, Date.now());
  return { observation, audit };
}
