import { spawn } from 'node:child_process';
const children = ['provider-A', 'provider-B', 'identity', 'ballot', 'management'].map(role => spawn(process.execPath, ['--watch', 'apps/api/src/server.ts', role], { stdio: 'inherit' }));
children.push(spawn('pnpm', ['--filter', '@openvote/web', 'dev'], { stdio: 'inherit' }));
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM'); }
for (const child of children) child.on('exit', code => { if (!stopping && code !== 0) { process.exitCode = 1; stop(); } });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
