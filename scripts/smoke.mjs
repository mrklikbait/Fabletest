// Headless smoke test: serve the built game, click through the title,
// walk and shoot for a few seconds, screenshot along the way, and fail
// on any page error.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4173;
mkdirSync('shots', { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
});
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); });
  server.on('exit', () => rej(new Error('vite preview exited')));
  setTimeout(() => rej(new Error('preview server timeout')), 15000);
});

const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', (e) => { errors.push(`pageerror: ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(`http://localhost:${PORT}/`);
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/01-title.png' });

await page.click('#go');
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__game.input.enabled = true; });
await page.screenshot({ path: 'shots/02-spawn.png' });

// look around + walk north out of the lobby
await page.evaluate(() => { const g = window.__game; g.player.yaw = Math.PI; g.player.pitch = 0; });
await page.keyboard.down('KeyW');
await page.waitForTimeout(2600);
await page.keyboard.up('KeyW');
await page.screenshot({ path: 'shots/03-corridor.png' });

// aim down sights
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/04-ads.png' });

// fire twice
await page.mouse.down({ button: 'left' });
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(300);
await page.mouse.down({ button: 'left' });
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(120);
await page.screenshot({ path: 'shots/05-fire.png' });
await page.mouse.up({ button: 'right' });

// reload (tap R), wait it out
await page.keyboard.press('KeyR');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/06-reload.png' });

// keep walking into the block, lights off then on
await page.keyboard.press('KeyT');
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/07-dark.png' });
await page.keyboard.press('KeyT');
await page.waitForTimeout(1800);
await page.keyboard.up('KeyW');
await page.screenshot({ path: 'shots/08-deeper.png' });

const state = await page.evaluate(() => {
  const g = window.__game;
  return {
    state: g.state,
    hp: g.player.hp,
    fear: +g.fear.value.toFixed(2),
    pos: { x: +g.player.pos.x.toFixed(1), z: +g.player.pos.z.toFixed(1) },
    shots: g.stats.shots,
    chambered: g.weapons.pistol.chambered,
    magRounds: g.weapons.pistol.mag ? g.weapons.pistol.mag.r : null,
    spareMags: g.weapons.pistol.spare.map((m) => m.r),
    enemiesAlive: g.enemies.list.filter((s) => !s.dead).length,
    hunting: g.enemies.list.filter((s) => s.mode === 'hunt').length,
  };
});
console.log('game state:', JSON.stringify(state, null, 2));

await browser.close();
server.kill();

if (errors.length) {
  console.error('ERRORS:');
  for (const e of errors.slice(0, 20)) console.error(' ', e);
  process.exit(1);
}
console.log('SMOKE OK');
