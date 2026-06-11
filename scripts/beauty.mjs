// Stage the money shot: a subject mid-hunt in the flashlight beam.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4200 + Math.floor(Math.random() * 500);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
process.on('exit', () => { try { process.kill(-server.pid, 'SIGKILL'); } catch (e) {} });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); });
  setTimeout(() => rej(new Error('server timeout')), 15000);
});

const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${PORT}/`);
await page.click('#go');
await page.waitForTimeout(2500);

await page.evaluate(() => {
  const g = window.__game;
  g.input.enabled = true;
  g.player.hp = 1e9;
  for (const s of g.enemies.list) { s.pos.set(44.25, 0, 3.75); s.mode = 'wander'; s.wanderT = 1e9; s.target = null; s.path = null; }
  // player mid-corridor looking north, one subject closing in the beam
  g.player.pos.set(28.5, 0, 27.0);
  g.player.yaw = 0; g.player.pitch = 0;
  const s = g.enemies.list[0];
  s.pos.set(28.2, 0, 20.5);
  s.yaw = Math.PI;
  s.mode = 'hunt'; s.staggerT = 30; s.walkPhase = 2.1;
  g.fear.value = 0.72;
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/11-contact.png' });

// second: over the sights, closer
await page.evaluate(() => {
  const g = window.__game;
  const s = g.enemies.list[0];
  s.pos.set(28.4, 0, 23.5);
  s.staggerT = 30;
  s.yaw = Math.PI;
  g.fear.value = 0.85;
});
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(1400);
const dbg = await page.evaluate(() => {
  const g = window.__game;
  const list = g.enemies.list.map((s, i) => ({ i, x: +s.pos.x.toFixed(1), z: +s.pos.z.toFixed(1), mode: s.mode, dead: s.dead }))
    .filter((s) => Math.hypot(s.x - g.player.pos.x, s.z - g.player.pos.z) < 8);
  return {
    player: { x: +g.player.pos.x.toFixed(2), z: +g.player.pos.z.toFixed(2), yaw: +g.player.yaw.toFixed(2), pitch: +g.player.pitch.toFixed(2) },
    near: list, adsT: +g.weapons.adsT.toFixed(2), fov: g.camera.fov,
  };
});
console.log(JSON.stringify(dbg));
await page.evaluate(() => {
  const g = window.__game;
  g.input.mouseDX = 0; g.input.mouseDY = 0;
  g.player.yaw = 0; g.player.pitch = 0.02;
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/12-sights.png' });

await browser.close();
server.kill();
console.log('done');
process.exit(0);
