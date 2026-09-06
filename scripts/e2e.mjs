import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { cleanupBrowserFixtures } from '../tests/support/cleanup.ts';

const steps = ['create', 'reviewStart', 'review', 'voteOne', 'voteTwo', 'voteThree', 'duplicate', 'tallyStart', 'publish', 'exports'];
const downloadDirectory = process.argv[2];
if (process.argv.length !== 3 || typeof downloadDirectory !== 'string' || !isAbsolute(downloadDirectory)) throw new Error('Supply the existing Browser download directory: pnpm test:e2e /absolute/download/directory');
await readdir(downloadDirectory);
const token = randomBytes(32).toString('hex'), runId = randomBytes(5).toString('hex');
await mkdir('artifacts/e2e', { recursive: true });
await writeFile('artifacts/e2e/report.json', JSON.stringify({ runId, passed: false, failure: 'Run setup has not completed' }, null, 2) + '\n');
let fixtures = [];
try { fixtures = z.array(z.string().uuid()).parse(JSON.parse(await readFile('.runtime/e2e-polls.json', 'utf8'))); }
catch (error) { if (!(error instanceof Error) || error.code !== 'ENOENT') throw error; }
await cleanupBrowserFixtures(fixtures);
await writeFile('.runtime/e2e-polls.json', '[]', { mode: 0o600 });
async function sourceDigest() {
  const files = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', '.gitmodules', 'apps/api/package.json', 'packages/domain/package.json', 'apps/web/package.json', 'apps/web/index.html', 'apps/web/vite.config.ts'];
  for (const directory of ['apps/api/src', 'apps/web/src', 'packages/domain/src', 'tests', 'scripts', 'tools', 'migrations', 'infra']) {
    for (const name of await readdir(directory, { recursive: true, withFileTypes: true })) if (name.isFile() && !name.parentPath.includes('__pycache__')) files.push(name.parentPath + '/' + name.name);
  }
  const digest = createHash('sha256');
  for (const file of files.sort()) digest.update(file).update('\0').update(await readFile(file)).update('\0');
  return digest.digest('hex');
}
const sourceHash = await sourceDigest();
await mkdir('.runtime', { recursive: true, mode: 0o700 });
const closesAt = new Date(Math.floor(Date.now() / 60000) * 60000 + 300000).toISOString();
await writeFile('.runtime/e2e-run.json', JSON.stringify({ endpoint: 'http://127.0.0.1:4329', token, runId, sourceHash, closesAt, downloadDirectory }), { mode: 0o600 });
const results = [];
let finished = false;
const startedAt = new Date().toISOString();
await mkdir('artifacts/e2e', { recursive: true });
async function report(passed, failure) {
  const finalSourceHash = await sourceDigest();
  await writeFile('artifacts/e2e/report.json', JSON.stringify({ runId, sourceHash, finalSourceHash,
    browser: 'Existing in-app Browser; supplied tab.playwright binding', standaloneBrowserStarted: false,
    startedAt, finishedAt: finished ? new Date().toISOString() : null,
    passed: passed && sourceHash === finalSourceHash, ...(failure === undefined ? {} : { failure }), results }, null, 2) + '\n');
  return passed && sourceHash === finalSourceHash;
}
await report(false, 'Run has not completed');
const server = createServer(async (req, res) => {
  if (req.headers.origin !== undefined || req.headers.authorization !== 'Bearer ' + token) { res.writeHead(403); res.end(); return; }
  if (req.method !== 'POST' || req.url !== '/event') { res.writeHead(404); res.end(); return; }
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 100000) { res.writeHead(413); res.end(); return; } }
  try {
    const input = z.strictObject({ step: z.string(), status: z.enum(['Passed', 'Failed']), assertions: z.array(z.string()).min(1), error: z.string().optional() }).parse(JSON.parse(text));
    if (input.step !== steps[results.length]) throw new Error('E2E_STEP_ORDER');
    results.push(input);
    console.log(input.step + ': ' + input.status + ' (' + input.assertions.length + ' assertions)');
    if (input.status === 'Failed' || results.length === steps.length) {
      finished = true;
      const passed = await report(results.length === steps.length && results.every(r => r.status === 'Passed'));
      process.exitCode = passed ? 0 : 1;
      clearTimeout(deadline);
      await rm('.runtime/e2e-run.json');
      server.close();
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ recorded: true }));
  } catch { res.writeHead(400); res.end(); }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
async function stop(reason) {
  if (finished) return;
  finished = true; clearTimeout(deadline); process.exitCode = 1;
  await report(false, reason); await rm('.runtime/e2e-run.json'); server.close();
}
const deadline = setTimeout(() => { void stop('E2E_INCOMPLETE: the existing in-app Browser did not complete every stage.'); }, 15 * 60000);
process.once('SIGINT', () => { void stop('Run interrupted'); });
process.once('SIGTERM', () => { void stop('Run terminated'); });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4329, '127.0.0.1', resolve); });
console.log('E2E run ' + runId + ' awaits the existing in-app Browser binding. No browser is launched.');
console.log('Import tests/e2e/inapp.mjs in that Browser runtime and call createRunner(existingTab). Run stages in the documented order.');
