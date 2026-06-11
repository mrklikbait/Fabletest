// Apartment floor as ASCII. Pure data + grid logic (no three.js) so it can
// be validated headlessly.
//
// Legend:
//   #  wall            W  boarded window (solid)      R  debris (solid, tall)
//   .  floor           D  door                        X  exit (chained double door)
//   P  player spawn    e  subject (wandering)         d  subject (dormant)
//   c  subject (crawler)
//   a  loose 9mm       m  spare magazine              s  shell box
//   S  shotgun         K  fire-exit key               B  field dressing
//   k  cleaning kit    T  fallen teammate (prop)
//   L  ceiling light (flickering)   l  ceiling light (steady, dim)
//   w  wardrobe (tall) f  fridge (tall)  o  clutter (tall)
//   b  bed (low)       t  table (low)    u  couch (low)

export const MAP = [
  '###W#########W######################', //  0
  '#.....d.w#s.....bb#w....d..#...RRR##', //  1
  '#.tK.....#...e....#..e.....#...RRR##', //  2
  '#........#........#......a.#..s...##', //  3
  '####D########D########D#######.#####', //  4
  '##......e...............L.........##', //  5  (hall)
  '##........................e.......##', //  6
  '##D###############..################', //  7
  '#o..#######w...d#.m#f.....##########', //  8
  '#.k.#######B....#..#....d.##########', //  9
  '#.a.#######.....D..#......##########', // 10
  '###########W.TS..#..D..t...#########', // 11
  '############.sm..#.e#..e...#########', // 12
  '############bb...#..#.....a#########', // 13
  '##################L.################', // 14
  '############.....#..#u...bb#########', // 15
  '############.t.u.#..D......#########', // 16
  '############..e..D..#...c..#########', // 17
  '############.....#..#....B.#########', // 18
  '############a....#e.#......#########', // 19
  '##################..################', // 20
  '##################..################', // 21
  '##############o.........############', // 22
  '##############.u..l.....############', // 23
  '##############.....P....############', // 24
  '##############a.........############', // 25
  '##################XX################', // 26
];

const SOLID = new Set(['#', 'W', 'R']);
const TALL_FURN = new Set(['w', 'f', 'o']);
const LOW_FURN = new Set(['b', 't', 'u']);
const ITEMS = new Set(['a', 'm', 's', 'S', 'K', 'B', 'k']);

export function parseMap(map = MAP) {
  const h = map.length;
  const w = Math.max(...map.map((r) => r.length));
  const solid = [];        // blocks movement + bullets + sight
  const lowBlock = [];     // blocks movement only
  const kind = [];
  const doors = [];
  const items = [];
  const enemies = [];
  const lights = [];
  const furniture = [];
  const windows = [];
  const debris = [];
  const exitCells = [];
  let playerSpawn = null;
  let teammate = null;

  for (let z = 0; z < h; z++) {
    solid.push(new Array(w).fill(true));
    lowBlock.push(new Array(w).fill(false));
    kind.push(new Array(w).fill('#'));
  }

  for (let z = 0; z < h; z++) {
    const row = map[z];
    for (let x = 0; x < w; x++) {
      const c = x < row.length ? row[x] : '#';
      kind[z][x] = c;
      if (SOLID.has(c)) {
        solid[z][x] = true;
        if (c === 'W') windows.push({ x, z });
        if (c === 'R') debris.push({ x, z });
        continue;
      }
      if (c === 'X') { solid[z][x] = true; exitCells.push({ x, z }); continue; }
      solid[z][x] = false;
      if (c === 'D') doors.push({ x, z });
      else if (c === 'P') playerSpawn = { x, z };
      else if (c === 'T') teammate = { x, z };
      else if (c === 'e') enemies.push({ x, z, mode: 'wander' });
      else if (c === 'd') enemies.push({ x, z, mode: 'dormant' });
      else if (c === 'c') enemies.push({ x, z, mode: 'crawler' });
      else if (c === 'L') lights.push({ x, z, flicker: true });
      else if (c === 'l') lights.push({ x, z, flicker: false });
      else if (ITEMS.has(c)) items.push({ x, z, type: c });
      else if (TALL_FURN.has(c)) { furniture.push({ x, z, type: c, tall: true }); solid[z][x] = true; }
      else if (LOW_FURN.has(c)) { furniture.push({ x, z, type: c, tall: false }); lowBlock[z][x] = true; }
    }
  }
  return { w, h, solid, lowBlock, kind, doors, items, enemies, lights, furniture, windows, debris, exitCells, playerSpawn, teammate };
}

// A* over the grid. Closed doors cost extra for enemies (they will bash
// through); low furniture is impassable for everyone.
export function findPath(grid, doorsClosed, from, to) {
  const { w, h, solid, lowBlock } = grid;
  const key = (x, z) => z * w + x;
  const blocked = (x, z) => x < 0 || z < 0 || x >= w || z >= h || solid[z][x] || lowBlock[z][x];
  const doorCost = (x, z) => (doorsClosed && doorsClosed.has(key(x, z)) ? 14 : 0);
  if (blocked(from.x, from.z) || blocked(to.x, to.z)) return null;

  const open = [{ x: from.x, z: from.z, g: 0, f: 0 }];
  const came = new Map();
  const gScore = new Map([[key(from.x, from.z), 0]]);
  const closed = new Set();
  const hCost = (x, z) => Math.abs(x - to.x) + Math.abs(z - to.z);

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.z);
    if (cur.x === to.x && cur.z === to.z) {
      const path = [{ x: cur.x, z: cur.z }];
      let k = ck;
      while (came.has(k)) { k = came.get(k); path.push({ x: k % w, z: Math.floor(k / w) }); }
      path.reverse();
      return path;
    }
    if (closed.has(ck)) continue;
    closed.add(ck);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const nx = cur.x + dx, nz = cur.z + dz;
      if (blocked(nx, nz)) continue;
      if (dx !== 0 && dz !== 0 && (blocked(cur.x + dx, cur.z) || blocked(cur.x, cur.z + dz))) continue; // no corner cutting
      const step = (dx !== 0 && dz !== 0) ? 1.414 : 1;
      const ng = cur.g + step + doorCost(nx, nz);
      const nk = key(nx, nz);
      if (gScore.has(nk) && gScore.get(nk) <= ng) continue;
      gScore.set(nk, ng);
      came.set(nk, ck);
      open.push({ x: nx, z: nz, g: ng, f: ng + hCost(nx, nz) });
    }
    if (closed.size > w * h) break;
  }
  return null;
}

// Grid line-of-sight (DDA) through solid cells only — used by AI senses and
// path smoothing. Doors and low furniture do not block this; precise bullet
// hits use real raycasts against meshes.
export function gridLos(grid, ax, az, bx, bz) {
  const { solid } = grid;
  const dx = bx - ax, dz = bz - az;
  const dist = Math.hypot(dx, dz);
  const steps = Math.ceil(dist * 3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor(ax + dx * t), z = Math.floor(az + dz * t);
    if (z < 0 || x < 0 || z >= grid.h || x >= grid.w || solid[z][x]) return false;
  }
  return true;
}
