// The quality gate. Runs every check in order and stops at the first failure.
// Each step's own exit status decides; nothing here can pass by accident.
import { spawnSync } from 'node:child_process';

const steps = [
  ['typecheck', ['pnpm', 'typecheck']],
  ['lint', ['pnpm', 'lint']],
  ['test', ['pnpm', 'test']],
  ['build', ['pnpm', 'build']],
  ['shoot', ['pnpm', 'shoot', '--', '--no-build']],
  ['play-check', ['pnpm', 'play-check', '--', '--no-build']],
];

const results = [];
for (const [name, [cmd, ...args]] of steps) {
  console.log(`\n=== gate: ${name} ===`);
  const started = Date.now();
  const run = spawnSync(cmd, args, { stdio: 'inherit' });
  const status = run.status ?? 1;
  results.push({ name, status, seconds: ((Date.now() - started) / 1000).toFixed(1) });
  if (status !== 0) break;
}

console.log('\n=== gate summary ===');
for (const r of results) console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${r.name.padEnd(10)} exit ${r.status}  ${r.seconds}s`);
for (const [name] of steps.slice(results.length)) console.log(`SKIP  ${name}`);

const ok = results.length === steps.length && results.every((r) => r.status === 0);
console.log(ok ? '\nGATE PASS' : '\nGATE FAIL');
process.exit(ok ? 0 : 1);
