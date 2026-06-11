// Functional verification: drives the real game in headless Chromium and
// asserts the core mechanic pipelines end to end.
//
// Anatomy tests fire deterministic rays (exact muzzle->part direction via
// the real _bullet pipeline) because fear sway is SUPPOSED to make precise
// shots hard — the sway/aim relationship is covered by the torso check in
// the smoke run. Action-economy tests (reload/jam) use the full trigger path
// with the player isolated from interference.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4200 + Math.floor(Math.random() * 500);
mkdirSync('shots', { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
process.on('exit', () => { try { process.kill(-server.pid, 'SIGKILL'); } catch (e) {} });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); });
  setTimeout(() => rej(new Error('server timeout')), 15000);
});

const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

await page.goto(`http://localhost:${PORT}/`);
await page.click('#go');
await page.waitForTimeout(2500);

const isolate = async () => {
  await page.evaluate(() => {
    const g = window.__game;
    g.input.enabled = true;
    g.player.hp = 1e9;
    g.player.pos.set(21.75, 0, 29.25);
    g.fear.value = 0.05;
    for (const s of g.enemies.list) {
      if (s.dead) continue;
      s.pos.set(44.25, 0, 3.75);
      s.mode = 'wander'; s.awake = true; s.riseT = 0;
      s.wanderT = 1e9; s.target = null; s.path = null; s.bash = null;
    }
  });
  await page.waitForTimeout(300);
};
await isolate();

const stage = async (idx) => {
  await page.evaluate((i) => {
    const g = window.__game;
    const s = g.enemies.list[i];
    s.pos.set(21.75, 0, 26.25);
    s.yaw = Math.PI;
    s.staggerT = 30;
    s.body.root.rotation.y = s.yaw;
    s.body.root.updateMatrixWorld(true); // raycasts read matrixWorld directly; don't race the render
  }, idx);
  await page.waitForTimeout(250);
};

// fire one round through the REAL bullet pipeline, aimed exactly at a part
const shootPart = async (idx, part) => {
  await page.evaluate(([i, p]) => {
    const g = window.__game;
    const s = g.enemies.list[i];
    s.body.root.updateMatrixWorld(true);
    const target = g.player.pos.clone();
    s.body.meshes[p].getWorldPosition(target);
    const { pos } = g.weapons.muzzleWorld();
    const dir = target.sub(pos).normalize();
    g.weapons._bullet(pos, dir, 26);
  }, [idx, part]);
  await page.waitForTimeout(250);
};

// ---------------------------------------------------------------- anatomy
await stage(0);
await shootPart(0, 'torso');
let r = await page.evaluate(() => {
  const s = window.__game.enemies.list[0];
  return { hp: s.torsoHp, dead: s.dead, hits: window.__game.stats.hits };
});
check('torso hit registers via real pipeline', r.hp === 52 && !r.dead, `torsoHp ${r.hp}`);

await stage(0);
await shootPart(0, 'head');
r = await page.evaluate(() => ({ dead: window.__game.enemies.list[0].dead, kills: window.__game.stats.kills }));
check('headshot drops a standing subject', r.dead && r.kills === 1, `kills ${r.kills}`);

// ------------------------------------------------------------- crawler
await stage(1);
await shootPart(1, 'legL');
await stage(1);
await shootPart(1, 'legL');
r = await page.evaluate(() => {
  const s = window.__game.enemies.list[1];
  const leg = s.body.legL;
  return { crawler: s.crawler, dead: s.dead, legHp: s.legHp.L, detached: leg.parent !== s.body.root };
});
check('two leg hits sever the leg -> crawler', r.crawler && !r.dead && r.detached, `legHp ${r.legHp}, detached ${r.detached}`);

await stage(1);
await shootPart(1, 'head');
r = await page.evaluate(() => ({ dead: window.__game.enemies.list[1].dead }));
check('crawler headshot kills', r.dead);
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/09-bodies.png' });

// ---------------------------------------------------------- magazines
await isolate();
r = await page.evaluate(() => {
  const g = window.__game;
  return { mag: g.weapons.pistol.mag.r, items: g.level.items.filter((i) => !i.taken).length, state: g.state };
});
const itemsBefore = r.items;
check('test rig clean (full starting mag, playing)', r.mag === 7 && r.state === 'play', `mag ${r.mag}, state ${r.state}`);

await page.evaluate(() => { window.__game.weapons.pistol.reload(false, 0.0); });
await page.waitForFunction(() => window.__game.weapons.pistol.state === 'idle', null, { timeout: 20000 });
r = await page.evaluate(() => {
  const g = window.__game;
  const drops = g.level.items.filter((i) => !i.taken && i.payload);
  return { mag: g.weapons.pistol.mag ? g.weapons.pistol.mag.r : null, state: g.weapons.pistol.state, drops: drops.length, spares: g.weapons.pistol.spare.map((m) => m.r) };
});
check('speed reload seats best spare', r.mag === 12 && r.state === 'idle', `mag ${r.mag}, state ${r.state}`);
check('dropped partial exists in world', r.drops === 1, `${r.drops} dropped, spares [${r.spares}]`);

// retention reload pockets the partial instead
await page.evaluate(() => {
  const p = window.__game.weapons.pistol;
  p.mag.r = 3; // make current mag obviously partial
  p.reload(true, 0.0);
});
await page.waitForFunction(() => window.__game.weapons.pistol.state === 'idle', null, { timeout: 20000 });
r = await page.evaluate(() => {
  const p = window.__game.weapons.pistol;
  return { mag: p.mag ? p.mag.r : null, spares: p.spare.map((m) => m.r), state: p.state };
});
check('retention reload pockets the partial', r.state === 'idle' && r.spares.includes(3) && r.mag === 5, `mag ${r.mag}, spares [${r.spares}]`);

// -------------------------------------------------------------- jam
await page.evaluate(() => { const p = window.__game.weapons.pistol; p.dirt = 0.92; p.jamShots = 0; p.mag.r = 8; p.chambered = true; });
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.__game.weapons._firePistol());
  await page.waitForTimeout(600);
}
r = await page.evaluate(() => ({ jammed: window.__game.weapons.pistol.jammed, shots: window.__game.stats.shots }));
check('filthy gun jams after warning shots', r.jammed, `jammed ${r.jammed} after ${r.shots} total shots`);
await page.evaluate(() => window.__game.weapons.pistol.clearJam());
await page.waitForFunction(() => window.__game.weapons.pistol.state === 'idle', null, { timeout: 20000 });
r = await page.evaluate(() => {
  const p = window.__game.weapons.pistol;
  return { jammed: p.jammed, chambered: p.chambered, dirt: p.dirt };
});
check('tap-rack clears the stoppage', !r.jammed && r.chambered && r.dirt === 0.7, `dirt ${r.dirt}`);

// -------------------------------------------------------------- doors
await page.evaluate(() => { window.__game.level.toggleDoor(window.__game.level.doors[0], true); });
await page.waitForFunction(() => window.__game.level.doors[0].openT > 0.9, null, { timeout: 20000 }).catch(() => {});
r = await page.evaluate(() => ({ t: window.__game.level.doors[0].openT }));
check('door opens over time', r.t > 0.9, `openT ${r.t.toFixed(2)}`);

// ------------------------------------------------------ noise draws them
r = await page.evaluate(() => {
  const g = window.__game;
  const s = g.enemies.list.find((x) => !x.dead);
  g.enemies.hear(s.pos.clone(), 10);
  return { mode: s.mode };
});
check('noise flips wanderers to investigate', r.mode === 'investigate', `mode ${r.mode}`);

// ---------------------------------------------------------- exit / win
await page.evaluate(() => {
  const g = window.__game;
  g.belt.hasKey = true;
  g.player.pos.set(g.level.exitPos.x, 0, g.level.exitPos.z - 1.2);
  g.level.beginUnlock();
});
await page.waitForFunction(() => window.__game.level.exitState === 'open', null, { timeout: 40000 }).catch(() => {});
r = await page.evaluate(() => ({ state: window.__game.level.exitState }));
check('chain unlock sequence opens the exit', r.state === 'open', `exitState ${r.state}`);

await page.evaluate(() => {
  const g = window.__game;
  g.player.pos.set(g.level.exitPos.x, 0, g.level.exitPos.z);
});
await page.waitForFunction(() => window.__game.state === 'won', null, { timeout: 15000 }).catch(() => {});
r = await page.evaluate(() => ({ state: window.__game.state }));
check('stepping through the exit wins', r.state === 'won', `game state ${r.state}`);
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/10-win.png' });

await browser.close();
server.kill();
if (errors.length) {
  console.error('PAGE ERRORS:');
  for (const e of errors.slice(0, 10)) console.error(' ', e);
}
console.log(failed === 0 && errors.length === 0 ? 'VERIFY OK' : `VERIFY FAILED (${failed} checks, ${errors.length} errors)`);
process.exit(failed || errors.length ? 1 : 0);
