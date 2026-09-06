import { afterAll, describe, expect, it } from 'vitest';
import { setTimeout } from 'node:timers/promises';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { Envelope, Poll, Receipt, ResultContract } from '../packages/domain/src/index.ts';
import { database, pseudonym, readConfig, required } from '../apps/api/src/common.ts';
import { call, createPoll, fixtureContent, generateBallot, login, ok, approvedReview } from './support/flow.ts';
import { FinalSet, Trust, verifyFinal } from '../packages/domain/src/checkpoints.ts';
import { localCore } from '../scripts/local-core.ts';

const created: { id: string; cryptoId: string }[] = [];
async function control(provider: 'A' | 'B', available: boolean, conflictingAttributes = false, delayMs = 0) {
  const config = await readConfig('provider-' + provider);
  const response = await fetch(`http://127.0.0.1:${config.port}/control`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.serviceToken }, body: JSON.stringify({ available, conflictingAttributes, delayMs }) });
  expect(response.status).toBe(200);
}
afterAll(async () => {
  await control('A', true); await control('B', true);
  for (const role of ['management', 'identity', 'ballot']) {
    const pool = database(await readConfig(role));
    for (const p of created) {
      if (role === 'management') { await pool.query('DELETE FROM events WHERE poll_id=$1', [p.id]); await pool.query('DELETE FROM appeals WHERE poll_id=$1', [p.id]); await pool.query('DELETE FROM polls WHERE id=$1', [p.id]); }
      if (role === 'identity') { await pool.query('DELETE FROM credentials WHERE poll_id=$1', [p.cryptoId]); await pool.query('DELETE FROM roster_locks WHERE poll_id=$1', [p.cryptoId]); }
      if (role === 'ballot') { for (const table of ['shares', 'checkpoints', 'ballots']) await pool.query(`DELETE FROM ${table} WHERE poll_id=$1`, [p.cryptoId]); await pool.query('DELETE FROM elections WHERE id=$1', [p.cryptoId]); }
    }
    await pool.end();
  }
  for (const p of created) for (const id of [1, 2, 3, 4]) await rm(`.runtime/trustees/${id}/${p.cryptoId}`, { recursive: true, force: true });
}, 20000);

describe('real service boundaries', () => {
  it('deduplicates A/B, replays late return and exposes outages without weaker admission', async () => {
    const [a, b] = await Promise.all([login('TEST-PERSON-0002', 'A'), login('TEST-PERSON-0002', 'B')]);
    const cfg = await readConfig('identity');
    const introspect = async (token: string) => {
      const r = await fetch('http://127.0.0.1:4301/internal/introspect', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.serviceToken }, body: JSON.stringify({ token }) });
      return z.object({ person: z.string() }).parse(await r.json()).person;
    };
    expect(await introspect(a.token)).toBe(await introspect(b.token));
    const start = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { provider: 'A', subject: 'TEST-PERSON-0002' }));
    await control('A', false);
    expect((await call('identity', '/v1/auth/finish', 'POST', start)).status).toBe(503);
    expect(await introspect((await login('TEST-PERSON-0002', 'B')).token)).toBe(await introspect(a.token));
    await control('A', true, false, 200);
    const [late, concurrent] = await Promise.all([ok('identity', '/v1/auth/finish', 'POST', start), ok('identity', '/v1/auth/finish', 'POST', start)]);
    expect(late).toEqual(concurrent);
    expect(await ok('identity', '/v1/auth/finish', 'POST', start)).toEqual(late);
    await control('A', false); await control('B', false);
    const unavailable = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { provider: 'B', subject: 'TEST-PERSON-0002' }));
    expect((await call('identity', '/v1/auth/finish', 'POST', unavailable)).status).toBe(503);
    expect((await call('identity', '/v1/auth/start', 'POST', { provider: 'A', subject: 'NOT-A-SYNTHETIC-PERSON' })).status).toBe(400);
    await control('A', true); await control('B', true);
  });

  it('expires pending identity returns before granting a session', async () => {
    const start = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { provider: 'A', subject: 'TEST-PERSON-0002' }));
    await control('A', true, false, 2000);
    const finishing = call('identity', '/v1/auth/finish', 'POST', start);
    const config = await readConfig('provider-A');
    let pending = 0;
    const deadline = Date.now() + 1000;
    while (pending === 0 && Date.now() < deadline) {
      const observed = await fetch('http://127.0.0.1:4312/control', { headers: { authorization: 'Bearer ' + config.serviceToken } });
      pending = z.object({ pending: z.number() }).parse(await observed.json()).pending;
      if (pending === 0) await setTimeout(10);
    }
    expect(pending).toBe(1);
    const pool = database(await readConfig('identity'));
    await pool.query('UPDATE attempts SET expires_at=now() WHERE id=$1', [start.attempt]);
    await pool.end();
    const result = await finishing;
    expect(result.status).toBe(410);
    expect(result.value).toEqual({ error: 'IDENTITY_RETURN_EXPIRED' });
    await control('A', true);
  });

  it('checks return expiry after waiting for the person transaction lock', async () => {
    const cfg = await readConfig('identity'), pool = database(cfg), lock = await pool.connect();
    try {
      const start = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { provider: 'A', subject: 'TEST-PERSON-0002' }));
      await lock.query('BEGIN');
      await lock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [pseudonym('TEST-PERSON-0002', required(cfg.dedupKey))]);
      const finishing = call('identity', '/v1/auth/finish', 'POST', start);
      let waiting = false;
      const deadline = Date.now() + 2000;
      while (!waiting && Date.now() < deadline) {
        const activity = await pool.query<{ waiting: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory') AS waiting");
        waiting = required(activity.rows[0]).waiting;
        if (!waiting) await setTimeout(10);
      }
      expect(waiting).toBe(true);
      await pool.query('UPDATE attempts SET expires_at=clock_timestamp() WHERE id=$1', [start.attempt]);
      await lock.query('COMMIT');
      const result = await finishing;
      expect(result.status).toBe(410);
      expect(result.value).toEqual({ error: 'IDENTITY_RETURN_EXPIRED' });
    } finally { await lock.query('ROLLBACK'); lock.release(); await pool.end(); }
  });

  it('enforces proof intake, final vote, recovery, signed finality and threshold tally', async () => {
    const author = await login('TEST-PERSON-0002'), moderator = await login('TEST-PERSON-0012');
    const unverified = await login('TEST-PERSON-0010');
    expect((await call('management', '/v1/drafts', 'POST', fixtureContent(new Date(Date.now() + 60000)), unverified.token)).status).toBe(403);
    const closesAt = new Date(Date.now() + 35000);
    const content = fixtureContent(closesAt, 'Чи підтримуєте відкриту перевірку синтетичного інтеграційного сценарію?');
    const poll = await createPoll(author.token, moderator.token, content);
    if (poll.cryptoId === null) throw new Error('Missing crypto id');
    const id = poll.cryptoId;
    created.push({ id: poll.id, cryptoId: id });
    expect(Poll.parse(z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${poll.id}/review`, 'POST', approvedReview, moderator.token)).poll).cryptoId).toBe(id);
    expect((await call('management', `/v1/polls/${poll.id}`, 'PATCH', { ...content, context: content.context + ' Прихована зміна.' }, author.token)).status).toBe(409);
    expect((await call('management', `/v1/polls/${poll.id}/close`, 'POST', {}, author.token)).status).toBe(403);
    expect((await call('management', `/v1/polls/${poll.id}/close`, 'POST', {}, moderator.token)).status).toBe(409);
    const pool = database(await readConfig('ballot'));
    const record = required((await pool.query<{ archive: string }>('SELECT archive FROM elections WHERE id=$1', [id])).rows[0]);
    await pool.end();
    const right = z.object({ credential: z.string(), manifestHash: z.string() });
    const credential = right.parse(await ok('identity', `/v1/credentials/${id}`, 'POST', {}, author.token));
    const otherDevice = await login('TEST-PERSON-0002', 'B');
    expect(right.parse(await ok('identity', `/v1/credentials/${id}`, 'POST', {}, otherDevice.token))).toEqual(credential);
    await control('A', false);
    expect(right.parse(await ok('identity', `/v1/credentials/${id}`, 'POST', {}, author.token))).toEqual(credential);
    await control('A', true);
    const ballot = await generateBallot(record.archive, credential.credential, 0);
    expect((await call('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot }, author.token)).status).toBe(400);
    expect((await call('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot, choice: 0 })).status).toBe(400);
    const responses = await Promise.all(Array.from({ length: 5 }, () => ok('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot })));
    const accepted = z.object({ receipt: Envelope, idempotent: z.boolean() });
    expect(responses.map(r => accepted.parse(r)).filter(r => !r.idempotent)).toHaveLength(1);
    const receipt = accepted.parse(responses[0]).receipt;
    const tracker = Receipt.parse(JSON.parse(receipt.payload)).tracker;
    expect(JSON.stringify(receipt)).not.toMatch(/TEST-PERSON|choice|credential|timestamp/);
    expect(z.object({ included: z.boolean() }).parse(await ok('ballot', `/v1/elections/${id}/tracker?tracker=${encodeURIComponent(tracker)}`)).included).toBe(true);
    const changed = await generateBallot(record.archive, credential.credential, 1);
    const duplicate = await call('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot: changed });
    expect(duplicate.status).toBe(422); expect(duplicate.value).toEqual({ error: 'FINAL_VOTE_ALREADY_CAST' });
    for (const [subject, choice] of [['TEST-PERSON-0003', 1], ['TEST-PERSON-0004', 2]]) {
      const input = z.tuple([z.string(), z.number()]).parse([subject, choice]);
      const voter = await login(input[0]);
      const c = right.parse(await ok('identity', `/v1/credentials/${id}`, 'POST', {}, voter.token));
      await ok('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot: await generateBallot(record.archive, c.credential, input[1]) });
    }
    expect((await call('ballot', `/v1/elections/${id}/result`)).status).toBe(409);
    await setTimeout(Math.max(0, closesAt.getTime() - Date.now() + 100));
    const expiredCredential = await call('identity', `/v1/credentials/${id}`, 'POST', {}, author.token);
    expect(expiredCredential.status).toBe(403);
    expect(expiredCredential.value).toEqual({ error: 'NO_ACTIVE_CREDENTIAL' });
    await ok('management', `/v1/polls/${poll.id}/close`, 'POST', {}, moderator.token);
    const config = await readConfig('ballot');
    const final = FinalSet.parse(await ok('ballot', `/internal/final/${id}`, 'POST', {}, config.serviceToken));
    const trust = Trust.parse(JSON.parse(await readFile(`.runtime/trustees/1/${id}/trust.json`, 'utf8')));
    const report = await localCore({ action: 'verify', archive: final.archive });
    const bound = verifyFinal(final, trust, report, Date.now(), null);
    expect(() => verifyFinal(final, trust, report, closesAt.getTime() - 1, null)).toThrow('NOT_UNPUBLISHED_FINAL_TALLY');
    expect(() => verifyFinal(final, trust, report, Date.now(), 'different-final')).toThrow('TRUSTEE_FINAL_SET_ALREADY_BOUND');
    expect(verifyFinal(final, trust, report, Date.now(), bound.finalHash).finalHash).toBe(bound.finalHash);
    expect(await ok('ballot', `/internal/tally/${id}`, 'POST', {}, config.serviceToken)).toEqual({ state: 'WaitingForQuorum' });
    await mkdir('artifacts/services', { recursive: true });
    await writeFile('artifacts/services/closed-public-set.json', JSON.stringify({ final, trust, report }, null, 2) + '\n');
    await ok('management', `/v1/polls/${poll.id}/demo-tally`, 'POST', {}, moderator.token);
    const result = ResultContract.parse(await ok('ballot', `/v1/elections/${id}/result`));
    expect(result.counts).toEqual([1, 1, 1]); expect(result.acceptedVotes).toBe(3);
    expect(result.selfSelected).toBe(true);
    expect(accepted.parse(await ok('ballot', `/v1/elections/${id}/ballots`, 'POST', { ballot })).receipt).toEqual(receipt);
    const audit = z.object({ archive: z.string() }).parse(await ok('ballot', `/v1/elections/${id}/audit`));
    await mkdir('artifacts/services', { recursive: true });
    await writeFile('artifacts/services/election.bel', Buffer.from(audit.archive, 'base64'));
    await writeFile('artifacts/services/result.json', JSON.stringify(result, null, 2) + '\n');
  }, 180000);
  it('denies conflicting attributes and invalidates previous sessions', async () => {
    const identity = await login('TEST-PERSON-0008', 'A');
    await control('B', true, true);
    const start = z.object({ attempt: z.string() }).parse(await ok('identity', '/v1/auth/start', 'POST', { provider: 'B', subject: 'TEST-PERSON-0008' }));
    expect((await call('identity', '/v1/auth/finish', 'POST', start)).value).toEqual({ error: 'PROVIDER_ATTRIBUTES_CONFLICT' });
    expect((await call('identity', '/v1/session', 'GET', undefined, identity.token)).status).toBe(401);
    await control('B', true);
    // Restore exactly this synthetic identity fixture for repeatable test runs.
    const { pseudonym } = await import('../apps/api/src/common.ts');
    const config = await readConfig('identity'), pool = database(config);
    await pool.query('UPDATE persons SET revoked=false WHERE person=$1', [pseudonym('TEST-PERSON-0008', required(config.dedupKey))]);
    await pool.end();
  });
});
