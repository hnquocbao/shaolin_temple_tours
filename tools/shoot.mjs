// Loads every camera stop of every place in a real browser and writes a PNG for each.
// Fails on console errors, failed requests, broken frames, or a frozen view that is not repeatable.
//
//   pnpm shoot                       build, then shoot everything
//   pnpm shoot -- --no-build         shoot the existing dist/
//   pnpm shoot -- --place shaolin    one place
//   pnpm shoot -- --out shots/ST3T-12
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { analyseFrame, diffShare } from './frame-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const VIEW = { width: 1920, height: 1080 };
const outDir = path.resolve(root, value('--out') ?? 'shots');
const onlyPlace = value('--place');
const READY_TIMEOUT = 120_000; // software rendering in CI is slow

function fail(message) {
  console.error(`SHOOT FAIL: ${message}`);
  process.exitCode = 1;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`preview server exited with code ${child.exitCode}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('preview server did not start within 30 s');
}

async function capture(page, base, place, stop) {
  const problems = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
  };
  const onPageError = (err) => problems.push(`page error: ${err.message}`);
  const onFailed = (req) => problems.push(`request failed: ${req.url()} (${req.failure()?.errorText ?? 'unknown'})`);
  const onResponse = (res) => {
    if (res.status() >= 400) problems.push(`request ${res.status()}: ${res.url()}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onFailed);
  page.on('response', onResponse);
  try {
    await page.goto(`${base}/?place=${place}&stop=${stop}&freeze=1&ui=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game?.ready === true || window.__game?.error !== undefined, null, {
      timeout: READY_TIMEOUT,
    });
    const probe = await page.evaluate(() => window.__game);
    if (probe.error) problems.push(`game error: ${probe.error}`);
    const png = await page.screenshot({ type: 'png' });
    return { png, stats: probe.stats, problems };
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onFailed);
    page.off('response', onResponse);
  }
}

async function main() {
  if (!has('--no-build')) {
    const build = spawnSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });
    if (build.status !== 0) return fail(`build exited with code ${build.status}`);
  }

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group, so the whole tree can be stopped by PID
  });
  let serverLog = '';
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));

  let browser;
  try {
    await waitForServer(base, server);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
    const page = await context.newPage();

    await page.goto(`${base}/?freeze=1&ui=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game !== undefined, null, { timeout: READY_TIMEOUT });
    const catalog = await page.evaluate(() => window.__game.catalog);
    const wanted = catalog.filter((c) => !onlyPlace || c.place === onlyPlace);
    if (wanted.length === 0) return fail(onlyPlace ? `no place "${onlyPlace}"` : 'the game lists no places');

    const report = [];
    let firstShot;
    for (const { place, stops } of wanted) {
      mkdirSync(path.join(outDir, place), { recursive: true });
      for (const stop of stops) {
        const started = Date.now();
        const { png, stats, problems } = await capture(page, base, place, stop);
        const file = path.join(outDir, place, `${stop}.png`);
        writeFileSync(file, png);
        const decoded = PNG.sync.read(png);
        if (decoded.width !== VIEW.width || decoded.height !== VIEW.height) {
          problems.push(`screenshot is ${decoded.width}x${decoded.height}, expected ${VIEW.width}x${VIEW.height}`);
        }
        const frame = analyseFrame(decoded.data);
        problems.push(...frame.problems);
        firstShot ??= { place, stop, data: decoded.data };
        const row = {
          place,
          stop,
          file: path.relative(root, file),
          ms: Date.now() - started,
          ...stats,
          meanLuma: Math.round(frame.meanLuma),
          darkShare: Number(frame.darkShare.toFixed(3)),
          flatShare: Number(frame.flatShare.toFixed(3)),
          problems,
        };
        report.push(row);
        const verdict = problems.length === 0 ? 'ok  ' : 'FAIL';
        console.log(
          `${verdict} ${place}/${stop}  calls=${stats.drawCalls} tris=${stats.triangles} luma=${row.meanLuma} ${row.ms}ms`,
        );
        for (const p of problems) console.log(`       ${p}`);
      }
    }

    // A frozen view must be repeatable: shoot the first stop again and compare byte for byte.
    if (firstShot) {
      const again = await capture(page, base, firstShot.place, firstShot.stop);
      const share = diffShare(firstShot.data, PNG.sync.read(again.png).data);
      const repeatable = share === 0;
      console.log(`${repeatable ? 'ok  ' : 'FAIL'} repeatable frame (${firstShot.place}/${firstShot.stop})`);
      if (!repeatable) {
        report.push({
          place: firstShot.place,
          stop: `${firstShot.stop} (repeat)`,
          problems: [`frozen view is not repeatable: ${(share * 100).toFixed(3)}% of bytes differ between two runs`],
        });
      }
    }

    writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    const failed = report.filter((r) => r.problems.length > 0);
    if (failed.length > 0) return fail(`${failed.length} of ${report.length} checks have problems (see above)`);
    console.log(`SHOOT PASS: ${report.length} views in ${path.relative(root, outDir)}/`);
  } catch (cause) {
    fail(cause instanceof Error ? cause.message : String(cause));
    if (serverLog.trim()) console.error(serverLog.trim().split('\n').slice(-15).join('\n'));
  } finally {
    await browser?.close();
    try {
      process.kill(-server.pid, 'SIGTERM'); // by PID (the group we created), never by pattern
    } catch {
      // already gone
    }
  }
}

await main();
