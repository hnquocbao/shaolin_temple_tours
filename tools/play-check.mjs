// Drives the hero in the dev yard with real keyboard events: run up the steps, leap onto a roof,
// come back down and return to the start. Asserts on window.__game.hero at each stage.
//
//   pnpm play-check                      build, then run
//   pnpm play-check -- --no-build        use the existing dist/
//   pnpm play-check -- --shots dir       also save a screenshot at each stage (--size 1920x1080, --ui)
//
// Built to survive a software renderer at a few frames per second: every wait is on a position
// condition checked once per frame, with a generous timeout. Nothing depends on wall-clock speed.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const [width, height] = (value('--size') ?? '960x540').split('x').map(Number);
const shotsDir = value('--shots') ? path.resolve(root, value('--shots')) : undefined;
const place = value('--place') ?? 'yard';
const WAIT = 150_000; // per condition; a few fps still gets there
const TOTAL = 300_000; // the whole script, from the first stage to the last
const deadline = Date.now() + TOTAL;
const remaining = () => deadline - Date.now();

const problems = [];
const log = (message) => console.log(`  ${message}`);

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

class Stage extends Error {}

/** Reject if `promise` takes longer than `ms`, so no wait can hang the gate. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Stage(`${label}: no answer from the page within ${Math.round(ms / 1000)} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function run(page) {
  const hero = async () => {
    const h = await withTimeout(page.evaluate(() => window.__game?.hero), 60_000, 'read hero');
    if (h && h.respawns === undefined) throw new Stage('the hero probe does not report respawns');
    if (h && h.respawns > 0) throw new Stage(`the hero was respawned ${h.respawns} time(s) at ${h.x.toFixed(1)}, ${h.y.toFixed(1)}, ${h.z.toFixed(1)}`);
    return h;
  };
  /** Resolve when `test(hero)` holds, checked every animation frame. */
  const until = async (label, test) => {
    if (remaining() <= 0) throw new Stage(`${label}: the 5 minute limit for the whole check has passed`);
    try {
      await page.waitForFunction(
        `(() => { const h = window.__game && window.__game.hero; return !!h && (${test})(h); })()`,
        null,
        { polling: 'raf', timeout: Math.min(WAIT, remaining()) },
      );
    } catch {
      const h = await hero();
      throw new Stage(`${label}: condition never held (hero at ${h ? `${h.x.toFixed(1)}, ${h.y.toFixed(1)}, ${h.z.toFixed(1)}` : 'none'})`);
    }
    return hero();
  };
  /** Wait a few rendered frames, so the game has time to react. */
  const frames = (n) => withTimeout(page.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve(undefined) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n), Math.max(1000, Math.min(120_000, remaining())), 'wait for frames');
  const settled = async (label, test) => {
    // The same grounded spot on two reads several frames apart.
    let previous = await until(label, test);
    for (let i = 0; i < 40; i++) {
      await frames(4);
      const now = await hero();
      if (Math.hypot(now.x - previous.x, now.y - previous.y, now.z - previous.z) < 0.02 && test_(test, now)) return now;
      previous = now;
    }
    throw new Stage(`${label}: hero never came to rest`);
  };
  const test_ = (test, h) => new Function('h', `return (${test})(h)`)(h);
  const shot = async (name) => {
    if (!shotsDir) return;
    mkdirSync(shotsDir, { recursive: true });
    writeFileSync(path.join(shotsDir, `${name}.png`), await page.screenshot({ type: 'png' }));
  };
  const expect = (cond, message) => {
    if (!cond) throw new Stage(message);
  };
  const near = (h) => `${h.x.toFixed(1)}, ${h.y.toFixed(1)}, ${h.z.toFixed(1)}`;

  const start = await until('hero appears', '(h) => true');
  log(`spawn at ${near(start)}`);
  expect(Math.abs(start.z + 40) < 1 && start.y < 0.1, `spawn is not on the ground at (0, 0, -40): ${near(start)}`);
  await frames(6);
  await shot('1-spawn');

  // ---- stage 1: run forward over the stepped mound (steps of 0.5 m)
  await page.keyboard.down('KeyW');
  const onMound = await until('run up the steps', '(h) => h.z > -22 && h.y > 1.4');
  log(`on the mound top at ${near(onMound)}`);
  await shot('2-run');
  const pastMound = await until('run past the mound', '(h) => h.z > -9');
  await page.keyboard.up('KeyW');
  log(`past the mound at ${near(pastMound)}`);
  expect(Math.abs(pastMound.x) < 2, `forward run drifted sideways: ${near(pastMound)}`);
  const down = await settled('walk down the steps', '(h) => h.y < 0.05 && h.z > -9');
  expect(down.y < 0.05, `did not come down the far steps: ${near(down)}`);

  // ---- the yard wall (x 22..23, z -8..12, 5 m high) must stop the hero: A strafes left (+x) into it
  await page.keyboard.down('KeyW');
  await until('walk alongside the wall', '(h) => h.z > 0');
  await page.keyboard.up('KeyW');
  await settled('settle beside the wall', '(h) => h.z > 0 && h.y < 0.05');
  await page.keyboard.down('KeyA');
  await until('reach the wall', '(h) => h.x > 20');
  await frames(40); // keep pushing: a broken wall lets the hero through
  const atWall = await hero();
  await page.keyboard.up('KeyA');
  log(`pressed into the wall at ${near(atWall)}`);
  expect(atWall.x > 20.5 && atWall.x <= 21.7, `the wall did not stop the hero at x 21.65: ${near(atWall)}`);

  // ---- stage 2: line up with the 4 m house (x -17..-7, z 5..32), D strafes right (-x)
  await page.keyboard.down('KeyD');
  await until('strafe to the house', '(h) => h.x < -11.5');
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS');
  await until('back to the run-up line', '(h) => h.z < -9');
  await page.keyboard.up('KeyS');
  await settled('settle before the leap', '(h) => h.x < -11.5 && h.z < -8 && h.y < 0.05');

  // ---- stage 3: sprint and leap onto the roof
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await until('sprint to the launch point', '(h) => h.z > -6.5');
  await page.keyboard.down('Space');
  const rising = await until('leave the ground in a leap', '(h) => h.y > 6');
  log(`rising at ${near(rising)}`);
  await shot('3-leap');
  const onRoofTest = '(h) => h.y > 3.9 && h.y < 4.1 && h.x > -17 && h.x < -7 && h.z > 5 && h.z < 32';
  await until('touch down on the roof', onRoofTest);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('Space');
  await page.keyboard.up('ShiftLeft');
  const roof = await settled('come to rest on the roof', onRoofTest);
  log(`on the roof at ${near(roof)}`);
  expect(roof.y > 3.9 && roof.y < 4.1, `not standing on the 4 m roof: ${near(roof)}`);
  await frames(6);
  await shot('4-roof');

  // ---- stage 4: walk back off the roof and return to the start
  await page.keyboard.down('KeyS');
  const off = await until('step off the roof', '(h) => h.z < 3 && h.y < 0.05');
  log(`down again at ${near(off)}`);
  await until('walk back south', '(h) => h.z < -37');
  await page.keyboard.up('KeyS');
  await page.keyboard.down('KeyA'); // left is +x
  await until('walk back to the start line', '(h) => h.x > -1');
  await page.keyboard.up('KeyA');
  const end = await settled('come to rest at the start', '(h) => h.y < 0.1');
  log(`finished at ${near(end)}`);
  expect(Math.hypot(end.x - start.x, end.z - start.z) < 5, `did not return near the start: ${near(end)} vs ${near(start)}`);
  await shot('5-return');

  // ---- the hero must not have been put back (a respawn) or teleported on the way
  const last = await hero(); // throws if respawns > 0
  expect(last.respawns === 0, `respawns: ${last.respawns}`);
  const track = await page.evaluate(() => window.__track);
  log(`max height ${track.maxY.toFixed(1)} m, largest one-frame move ${track.maxStep.toFixed(1)} m`);
  expect(track.maxY > 8, `the leap was too low: max height ${track.maxY.toFixed(1)}`);
  expect(track.maxStep < 6, `the hero jumped ${track.maxStep.toFixed(1)} m in one frame (respawn or teleport)`);
}

/** With the flight enabled: the phase starts as 'arrival', the hero stays put, a key press skips to 'play'. */
async function runArrival(page, base) {
  await page.goto(`${base}/?place=${place}&ui=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.ready === true || window.__game?.error !== undefined, null, { timeout: 120_000 });
  const read = () => page.evaluate(() => ({ phase: window.__game.phase, hero: window.__game.hero }));
  const first = await read();
  if (first.phase !== 'arrival') throw new Stage(`arrival: expected phase "arrival" on entering the place, got "${first.phase}"`);
  await withTimeout(page.evaluate(() => new Promise((resolve) => {
    let left = 12;
    const tick = () => (--left <= 0 ? resolve(undefined) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  })), 120_000, 'arrival: wait for frames');
  const during = await read();
  if (during.phase !== 'arrival') throw new Stage(`arrival: the flight ended by itself after a few frames (phase "${during.phase}")`);
  const moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  if (moved(first.hero, during.hero) > 0.05) throw new Stage('arrival: the hero moved during the flight');
  await page.keyboard.press('Space'); // any key skips; the key itself must not make the hero jump
  await page.waitForFunction(() => window.__game.phase === 'play', null, { polling: 'raf', timeout: 60_000 });
  const after = await read();
  if (moved(first.hero, after.hero) > 0.05) throw new Stage('arrival: skipping the flight moved the hero');
  log('flight starts as "arrival", the hero stays put, a key press hands over to "play"');
}

async function main() {
  if (!has('--no-build')) {
    const build = spawnSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });
    if (build.status !== 0) {
      console.error(`PLAY FAIL: build exited with code ${build.status}`);
      process.exitCode = 1;
      return;
    }
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
  let watchdog;
  try {
    await waitForServer(base, server);
    watchdog = setTimeout(() => {
      console.error('PLAY FAIL: the whole check ran past 5 minutes');
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        // already gone
      }
      process.exit(1);
    }, TOTAL + 60_000);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
    page.on('requestfailed', (req) => problems.push(`request failed: ${req.url()}`));
    page.on('response', (res) => {
      if (res.status() >= 400) problems.push(`request ${res.status()}: ${res.url()}`);
    });
    // Watch the hero every frame: highest point, and the biggest jump between two frames.
    await page.addInitScript(() => {
      const track = { maxY: 0, maxStep: 0 };
      window.__track = track;
      let last;
      const tick = () => {
        const h = window.__game && window.__game.hero;
        if (h) {
          track.maxY = Math.max(track.maxY, h.y);
          if (last) track.maxStep = Math.max(track.maxStep, Math.hypot(h.x - last.x, h.y - last.y, h.z - last.z));
          last = { x: h.x, y: h.y, z: h.z };
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    console.log(`play-check: ${place} at ${width}x${height}`);
    await page.goto(`${base}/?place=${place}&arrival=0${has('--ui') ? '' : '&ui=0'}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game?.ready === true || window.__game?.error !== undefined, null, { timeout: 120_000 });
    const probe = await page.evaluate(() => window.__game);
    if (probe.error) problems.push(`game error: ${probe.error}`);
    if (probe.mode !== 'play') problems.push(`expected play mode, got ${probe.mode}`);
    if (problems.length === 0) await run(page);
    if (problems.length === 0) await runArrival(page, base);
  } catch (cause) {
    problems.push(cause instanceof Error ? cause.message : String(cause));
    if (serverLog.trim()) console.error(serverLog.trim().split('\n').slice(-10).join('\n'));
  } finally {
    clearTimeout(watchdog);
    await browser?.close();
    try {
      process.kill(-server.pid, 'SIGTERM'); // by PID (the group we created), never by pattern
    } catch {
      // already gone
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`);
    console.error('PLAY FAIL');
    process.exitCode = 1;
  } else {
    console.log('PLAY PASS');
  }
}

await main();
