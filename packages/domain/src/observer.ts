import { verify } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { Envelope, Manifest, Poll, Receipt, ResultContract, representativenessWarning } from './index.ts';
import { CoreReport, Trust, digest, verifyChain } from './checkpoints.ts';

const Origin = z.url().refine(value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.username === '' && url.password === '' && url.pathname === '/' && url.search === '' && url.hash === '' && value === url.origin;
}, 'PUBLIC_ORIGIN_REQUIRED');
export const ObserverConfig = z.strictObject({ ballotOrigin: Origin, managementOrigin: Origin,
  trust: Trust.extend({ pollId: z.string().regex(/^[A-Za-z0-9]{14}$/), manifestHash: z.string().regex(/^[0-9a-f]{64}$/) }), receipts: z.array(Envelope) });
export const AuditPackage = z.strictObject({ format: z.literal('openvote-audit-v1'), core: z.literal('Belenios 3.3.0'),
  electionRaw: z.string(), archive: z.string(), checkpoints: z.array(Envelope).min(1), result: ResultContract });
export const Observation = z.strictObject({ format: z.literal('openvote-observer-v1'), config: ObserverConfig,
  managementId: z.string().uuid(), checkpoints: z.array(Envelope).min(1),
  verification: z.enum(['CheckpointsOnly', 'ReferenceVerified']), publishedArchiveHash: z.string().nullable() });
export const PublicView = z.strictObject({
  manifest: z.object({ electionRaw: z.string(), manifestHash: z.string(), checkpointPublicKey: z.string() }),
  checkpoints: z.object({ checkpoints: z.array(Envelope).min(1), publicKey: z.string() }),
  catalogue: z.object({ polls: z.array(z.object({ id: z.string().uuid(), cryptoId: z.string().nullable() })) }),
  poll: z.object({ poll: Poll }),
  trackerReplies: z.array(z.union([z.strictObject({ included: z.literal(false), scope: z.literal('InclusionOnly') }),
    z.strictObject({ included: z.literal(true), receipt: Envelope, scope: z.literal('InclusionOnly') })])),
  audit: AuditPackage.nullable(), result: ResultContract.nullable(), reference: CoreReport.nullable(),
});
export type ObserverConfigType = z.infer<typeof ObserverConfig>;
export type ObservationType = z.infer<typeof Observation>;

function same(left: unknown, right: unknown, code: string) {
  if (!isDeepStrictEqual(left, right)) throw new Error(code);
}
function receipt(envelope: z.infer<typeof Envelope>, trusted: z.infer<typeof Trust>) {
  if (!verify(null, Buffer.from(envelope.payload), trusted.publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('RECEIPT_SIGNATURE_INVALID');
  const value = Receipt.parse(JSON.parse(envelope.payload));
  if (value.pollId !== trusted.pollId || value.manifestHash !== trusted.manifestHash) throw new Error('RECEIPT_MANIFEST_MISMATCH');
  return value;
}
export function observerChain(input: unknown, trusted: z.infer<typeof Trust>) {
  const verified = verifyChain(input, trusted);
  let closedReceipts: string[] | null = null;
  let priorState: string | null = null;
  const transitions: Record<string, string[]> = {
    Scheduled: ['Open', 'Closed', 'ResultsSuppressed', 'Cancelled'],
    Open: ['Closed', 'ResultsSuppressed', 'Cancelled'],
    Closed: ['Published', 'Cancelled'], Published: ['Invalidated'],
    ResultsSuppressed: ['Cancelled'], Cancelled: [], Invalidated: [],
  };
  for (const payload of verified.payloads) {
    if (priorState === null ? payload.state !== 'Scheduled' : !transitions[priorState]?.includes(payload.state)) throw new Error('CHECKPOINT_STATE_TRANSITION_INVALID');
    if (closedReceipts !== null) same(payload.receipts, closedReceipts, 'CLOSED_BALLOT_SET_CHANGED');
    if (['Closed', 'ResultsSuppressed', 'Cancelled'].includes(payload.state)) closedReceipts = payload.receipts;
    priorState = payload.state;
  }
  return verified;
}

export function verifyPublicAudit(input: unknown, trust: unknown, reference: unknown, now: number) {
  const audit = AuditPackage.parse(input), trusted = Trust.parse(trust), report = CoreReport.parse(reference);
  if (digest(audit.electionRaw) !== trusted.manifestHash || report.election.uuid !== trusted.pollId) throw new Error('AUDIT_MANIFEST_MISMATCH');
  same(JSON.parse(audit.electionRaw), report.election, 'AUDIT_MANIFEST_MISMATCH');
  const manifest = Manifest.parse(JSON.parse(report.election.description));
  if (Date.parse(manifest.closesAt) > now) throw new Error('EARLY_PUBLICATION');
  const counts = z.strictObject({ result: z.tuple([z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()])]) }).parse(report.result).result[0];
  if (!report.closed || report.ballotCount < manifest.publicationThreshold) throw new Error('AUDIT_NOT_PUBLISHABLE');
  const { payloads } = observerChain(audit.checkpoints, trusted), last = payloads.at(-1);
  if (last === undefined || last.state !== 'Published' || last.archiveHash !== digest(Buffer.from(audit.archive, 'base64'))) throw new Error('AUDIT_ARCHIVE_MISMATCH');
  same([...last.receipts].sort(), [...report.trackers].sort(), 'AUDIT_BALLOT_SET_MISMATCH');
  if (report.trackers.length !== report.ballotCount) throw new Error('AUDIT_BALLOT_COUNT_MISMATCH');
  const expected = ResultContract.parse({ apiVersion: 'v1', question: manifest.question, version: manifest.version, pollId: trusted.pollId,
    policy: manifest.policy, acceptedVotes: report.ballotCount, counts, opensAt: manifest.opensAt, closesAt: manifest.closesAt,
    state: 'Published', verification: 'ReferenceVerified', selfSelected: true, representativenessWarning });
  same(audit.result, expected, 'AUDIT_RESULT_CONTRACT_MISMATCH');
  return { archiveHash: last.archiveHash };
}

export function inspectObservation(configInput: unknown, input: unknown, priorInput: unknown | null, now: number): ObservationType {
  const config = ObserverConfig.parse(configInput), view = PublicView.parse(input), trusted = config.trust;
  same(view.manifest.checkpointPublicKey, trusted.publicKey, 'OBSERVER_SIGNER_CHANGED');
  same(view.checkpoints.publicKey, trusted.publicKey, 'OBSERVER_SIGNER_CHANGED');
  if (view.manifest.manifestHash !== trusted.manifestHash || digest(view.manifest.electionRaw) !== trusted.manifestHash) throw new Error('OBSERVER_MANIFEST_CHANGED');
  const election = z.object({ uuid: z.string(), description: z.string() }).parse(JSON.parse(view.manifest.electionRaw));
  const manifest = Manifest.parse(JSON.parse(election.description));
  if (election.uuid !== trusted.pollId || view.poll.poll.id !== manifest.id || view.poll.poll.cryptoId !== trusted.pollId) throw new Error('OBSERVER_POLL_CHANGED');
  same(view.poll.poll.manifestRaw, view.manifest.electionRaw, 'VISIBLE_MANIFEST_CHANGED');
  for (const [key, value] of Object.entries(view.poll.poll.content)) same(value, Reflect.get(manifest, key), 'VISIBLE_CONTENT_CHANGED');
  if (view.poll.poll.version !== manifest.version) throw new Error('VISIBLE_VERSION_CHANGED');
  if (!view.catalogue.polls.some(poll => poll.id === manifest.id && poll.cryptoId === trusted.pollId)) throw new Error('OBSERVED_POLL_HIDDEN');
  const { chain, payloads } = observerChain(view.checkpoints.checkpoints, trusted), last = payloads.at(-1);
  if (last === undefined) throw new Error('CHECKPOINTS_MISSING');
  if (['Closed', 'Published', 'ResultsSuppressed'].includes(last.state) && Date.parse(manifest.closesAt) > now) throw new Error('EARLY_CLOSE_OBSERVED');
  if (priorInput !== null) {
    const prior = Observation.parse(priorInput);
    same(prior.config.trust, trusted, 'OBSERVER_TRUST_CHANGED');
    same(prior.managementId, manifest.id, 'OBSERVER_STATE_METADATA_CHANGED');
    same([prior.config.ballotOrigin, prior.config.managementOrigin], [config.ballotOrigin, config.managementOrigin], 'OBSERVER_ORIGIN_CHANGED');
    observerChain(prior.checkpoints, trusted);
    if (prior.checkpoints.length > chain.length) throw new Error('OBSERVER_HISTORY_ROLLBACK');
    same(chain.slice(0, prior.checkpoints.length), prior.checkpoints, 'OBSERVER_HISTORY_FORK');
    for (const priorReceipt of prior.config.receipts) if (!config.receipts.some(value => isDeepStrictEqual(value, priorReceipt))) throw new Error('OBSERVED_RECEIPT_REMOVED_FROM_CONFIG');
  }
  if (config.receipts.length !== view.trackerReplies.length) throw new Error('RECEIPT_RESPONSE_COUNT_MISMATCH');
  for (const [index, envelope] of config.receipts.entries()) {
    const claim = receipt(envelope, trusted), reply = view.trackerReplies[index];
    if (reply === undefined || !reply.included) throw new Error('ACKNOWLEDGED_BALLOT_MISSING');
    same(receipt(reply.receipt, trusted), claim, 'RECEIPT_CHANGED');
    if (['Closed', 'Published', 'ResultsSuppressed', 'Cancelled', 'Invalidated'].includes(last.state) && !last.receipts.includes(claim.tracker)) throw new Error('ACKNOWLEDGED_BALLOT_MISSING');
  }
  let publishedArchiveHash: string | null = null;
  if (last.state === 'Published') {
    if (view.poll.poll.state !== 'Published' || view.audit === null || view.result === null || view.reference === null) throw new Error('PUBLISHED_AUDIT_MISSING');
    same(view.result, view.audit.result, 'PUBLIC_RESULT_VIEW_CHANGED');
    same(view.audit.checkpoints, chain, 'AUDIT_CHECKPOINT_VIEW_CHANGED');
    publishedArchiveHash = verifyPublicAudit(view.audit, trusted, view.reference, now).archiveHash;
  } else if (view.audit !== null || view.result !== null || view.reference !== null || view.poll.poll.state === 'Published') throw new Error('UNPUBLISHED_AUDIT_EXPOSED');
  return Observation.parse({ format: 'openvote-observer-v1', config, managementId: manifest.id, checkpoints: chain,
    verification: publishedArchiveHash === null ? 'CheckpointsOnly' : 'ReferenceVerified', publishedArchiveHash });
}

export function compareObservations(trustInput: unknown, leftInput: unknown, rightInput: unknown) {
  const trusted = Trust.parse(trustInput), left = Observation.parse(leftInput), right = Observation.parse(rightInput);
  same(left.config.trust, trusted, 'OBSERVER_TRUST_CHANGED'); same(right.config.trust, trusted, 'OBSERVER_TRUST_CHANGED');
  observerChain(left.checkpoints, trusted); observerChain(right.checkpoints, trusted);
  const common = Math.min(left.checkpoints.length, right.checkpoints.length);
  same(left.checkpoints.slice(0, common), right.checkpoints.slice(0, common), 'OBSERVER_SPLIT_VIEW_DETECTED');
  return { pollId: trusted.pollId, compatibility: 'CompatibleCheckpointPrefixes', comparedCheckpoints: common };
}
