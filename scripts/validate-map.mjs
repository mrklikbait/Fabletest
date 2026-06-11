// Headless map sanity check: uniform row width, door placement, and
// flood-fill reachability from the player spawn (doors count as passable).
import { MAP, parseMap, findPath } from '../src/map.js';

const p = parseMap(MAP);
let ok = true;
const fail = (msg) => { ok = false; console.error('FAIL:', msg); };

const widths = new Set(MAP.map((r) => r.length));
if (widths.size > 1) fail(`row widths differ: ${[...widths].join(',')} (rows: ${MAP.map((r, i) => `${i}:${r.length}`).join(' ')})`);

if (!p.playerSpawn) fail('no player spawn P');
if (!p.exitCells.length) fail('no exit X');
if (!p.items.find((i) => i.type === 'K')) fail('no key K');
if (!p.items.find((i) => i.type === 'S')) fail('no shotgun S');

for (const d of p.doors) {
  const ns = !p.solid[d.z - 1]?.[d.x] && !p.solid[d.z + 1]?.[d.x];
  const ew = !p.solid[d.z]?.[d.x - 1] && !p.solid[d.z]?.[d.x + 1];
  if (!ns && !ew) fail(`door at ${d.x},${d.z} has no clear axis`);
}

// flood fill from spawn (treat low furniture as blocking, doors as open)
const seen = new Set();
const stack = [p.playerSpawn];
const key = (c) => `${c.x},${c.z}`;
const pass = (x, z) => x >= 0 && z >= 0 && x < p.w && z < p.h && !p.solid[z][x] && !p.lowBlock[z][x];
while (stack.length) {
  const c = stack.pop();
  if (seen.has(key(c))) continue;
  seen.add(key(c));
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (pass(c.x + dx, c.z + dz)) stack.push({ x: c.x + dx, z: c.z + dz });
  }
}
const reach = (label, c) => {
  // an entity is fine if its own cell or any open neighbour is reachable
  const cands = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ x: c.x + dx, z: c.z + dz }));
  if (!cands.some((cc) => seen.has(key(cc)))) fail(`${label} at ${c.x},${c.z} unreachable`);
};
for (const i of p.items) reach(`item ${i.type}`, i);
for (const e of p.enemies) reach(`enemy ${e.mode}`, e);
for (const d of p.doors) reach('door', d);
for (const x of p.exitCells) reach('exit', x);
if (p.teammate) reach('teammate', p.teammate);

// pathfinding smoke test: spawn -> key
const k = p.items.find((i) => i.type === 'K');
const path = findPath(p, null, p.playerSpawn, k);
if (!path) fail('no A* path from spawn to key');
else console.log(`path spawn->key: ${path.length} cells`);

console.log(`map ${p.w}x${p.h}: ${p.items.length} items, ${p.enemies.length} enemies, ${p.doors.length} doors, ${p.lights.length} lights, ${p.furniture.length} furniture`);
console.log(ok ? 'MAP OK' : 'MAP HAS ERRORS');
process.exit(ok ? 0 : 1);
