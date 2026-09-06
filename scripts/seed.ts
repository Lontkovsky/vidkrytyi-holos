import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { Poll } from '../packages/domain/src/index.ts';
import { login, fixtureContent, ok, approvedReview } from '../tests/support/flow.ts';

let seed: { id: string } | null = null;
try { seed = z.strictObject({ id: z.string().uuid() }).parse(JSON.parse(await readFile('.runtime/seed.json', 'utf8'))); }
catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
const author = await login('TEST-PERSON-0001');
if (seed === null) {
  const { poll } = z.object({ poll: Poll }).parse(await ok('management', '/v1/drafts', 'POST', fixtureContent(new Date(Date.now() + 7 * 86400000)), author.token));
  await writeFile('.runtime/seed.json', JSON.stringify({ id: poll.id }), { mode: 0o600, flag: 'wx' });
  seed = { id: poll.id };
}
let { poll } = z.object({ poll: Poll }).parse(await ok('management', '/v1/polls/' + seed.id, 'GET', undefined, author.token));
if (poll.state === 'Draft') {
  poll = z.object({ poll: Poll }).parse(await ok('management', `/v1/polls/${poll.id}/submit`, 'POST', {}, author.token)).poll;
}
if (poll.state === 'Review') {
  const moderator = await login('TEST-PERSON-0012');
  await ok('management', `/v1/polls/${poll.id}/review`, 'POST', approvedReview, moderator.token);
}
console.log('Synthetic poll: http://localhost:5173/#/poll/' + poll.id);
