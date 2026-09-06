import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import pg from 'pg';

async function exists(path) { try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function run(command, args) {
  await new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: 'inherit' }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(command + ' failed'))); });
}
function keyPair() {
  const pair = generateKeyPairSync('ed25519');
  return { signingKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }) };
}
const secret = () => randomBytes(32).toString('hex');
if (!await exists('.runtime/bootstrap.json')) {
  await mkdir('.runtime/secrets', { recursive: true, mode: 0o700 });
  const databasePassword = secret(), coreToken = secret();
  const identityToken = secret(), ballotToken = secret();
  const providerTokens = { A: secret(), B: secret() };
  const keys = { A: keyPair(), B: keyPair() };
  const roles = [
    { role: 'identity', port: 4301, serviceToken: identityToken, dedupKey: secret(), sealingKey: secret(),
      providerTokens, providerKeys: { A: keys.A.publicKey, B: keys.B.publicKey } },
    { role: 'ballot', port: 4302, serviceToken: ballotToken, coreToken, ...keyPair() },
    { role: 'management', port: 4303, serviceToken: secret(), coreToken, identityToken, ballotToken,
      quotas: { daily: 3, cooldownSeconds: 60, simultaneousOpen: 2 } },
    { role: 'provider-A', port: 4312, serviceToken: providerTokens.A, ...keys.A },
    { role: 'provider-B', port: 4313, serviceToken: providerTokens.B, ...keys.B },
  ];
  for (const config of roles) {
    const db = ['identity', 'ballot', 'management'].includes(config.role);
    if (db) config.database = { host: '127.0.0.1', port: 54329, database: 'openvote_' + config.role, user: 'openvote_' + config.role, password: secret() };
    await mkdir('.runtime/' + config.role, { recursive: true, mode: 0o700 });
    await writeFile('.runtime/' + config.role + '/config.json', JSON.stringify({ environment: 'development', ...config }, null, 2), { mode: 0o600, flag: 'wx' });
  }
  await writeFile('.runtime/secrets/database-password', databasePassword, { mode: 0o600, flag: 'wx' });
  await writeFile('.runtime/secrets/core-token', coreToken, { mode: 0o600, flag: 'wx' });
  await writeFile('.runtime/bootstrap.json', JSON.stringify({ initialized: true }), { mode: 0o600, flag: 'wx' });
}
await run('docker', ['build', '--platform', 'linux/amd64', '-f', 'infra/crypto.Dockerfile', '-t', 'openvote-crypto:3.3.0', '.']);
await run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '60']);
const admin = new pg.Client({ host: '127.0.0.1', port: 54329, user: 'bootstrap', database: 'postgres',
  password: await readFile('.runtime/secrets/database-password', 'utf8') });
await admin.connect();
for (const role of ['identity', 'ballot', 'management']) {
  const { database: db } = JSON.parse(await readFile('.runtime/' + role + '/config.json', 'utf8'));
  if ((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [db.user])).rowCount === 0) {
    if (!/^[a-z_]+$/.test(db.user) || !/^[a-f0-9]{64}$/.test(db.password)) throw new Error('Invalid bootstrap database material');
    await admin.query(`CREATE ROLE ${db.user} LOGIN PASSWORD '${db.password}'`);
    await admin.query(`CREATE DATABASE ${db.database} OWNER ${db.user}`);
    await admin.query(`REVOKE ALL ON DATABASE ${db.database} FROM PUBLIC`);
  }
}
await admin.end();
await run(process.execPath, ['scripts/migrate.ts']);
await mkdir('apps/web/public/crypto', { recursive: true });
await run('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--entrypoint', 'sh',
  '-v', process.cwd() + '/apps/web/public/crypto:/export', 'openvote-crypto:3.3.0', '-c', 'cp /opt/belenios/belenios.js /opt/belenios/libsodium.wasm /opt/belenios/COPYING.belenios /opt/belenios/LICENSE.libsodium /export/']);
console.log('Synthetic environment bootstrapped. Private local role configurations were generated without printing secrets.');
