import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from './config.js';
import { findPath } from './map.js';

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(g, size, n, colors, maxR = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * maxR, 1 + Math.random() * maxR);
  }
}

function makeMaterials() {
  const wallpaper = canvasTex(64, (g, s) => {
    g.fillStyle = '#564e3c'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 8) { g.fillStyle = '#615741'; g.fillRect(x, 0, 3, s); }
    speckle(g, s, 90, ['#4a4334', '#3e382b', '#665c46']);
    g.fillStyle = '#332d22'; g.fillRect(0, s - 9, s, 9); // baseboard grime
  });
  const boards = canvasTex(64, (g, s) => {
    g.fillStyle = '#41311f'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 10) {
      g.fillStyle = ['#46351f', '#3c2d1c', '#4a3823'][(y / 10) | 0 % 3] || '#41311f';
      g.fillRect(0, y, s, 9);
      g.fillStyle = '#241a0e'; g.fillRect(0, y + 9, s, 1);
      g.fillRect(Math.random() * s, y, 1, 9);
    }
    speckle(g, s, 60, ['#2e2213', '#503d24']);
  });
  const ceiling = canvasTex(64, (g, s) => {
    g.fillStyle = '#4d4a42'; g.fillRect(0, 0, s, s);
    speckle(g, s, 120, ['#454239', '#3a372f', '#55524a'], 3);
    g.fillStyle = 'rgba(40,34,24,0.5)';
    for (let i = 0; i < 4; i++) { const r = 6 + Math.random() * 14; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, r, 0, 7); g.fill(); }
  });
  const wood = canvasTex(64, (g, s) => {
    g.fillStyle = '#4c3217'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 6) { g.fillStyle = x % 12 ? '#523a1d' : '#42290f'; g.fillRect(x, 0, 5, s); }
    g.strokeStyle = '#2e1d08'; g.strokeRect(8, 6, s - 16, s - 12);
  });
  const concrete = canvasTex(64, (g, s) => {
    g.fillStyle = '#3f3f41'; g.fillRect(0, 0, s, s);
    speckle(g, s, 160, ['#37373a', '#46464a', '#2f2f31'], 2);
  });
  const m = (map) => new THREE.MeshLambertMaterial({ map });
  return {
    wall: m(wallpaper), floor: m(boards), ceiling: m(ceiling), door: m(wood),
    concrete: m(concrete),
    dark: new THREE.MeshLambertMaterial({ color: 0x16161a }),
    boardWood: new THREE.MeshLambertMaterial({ color: 0x4a3a22 }),
    metal: new THREE.MeshLambertMaterial({ color: 0x33363b }),
    brass: new THREE.MeshLambertMaterial({ color: 0x8f7733 }),
    white: new THREE.MeshLambertMaterial({ color: 0x9a9a90 }),
  };
}

const box = (w, h, d, mat, x, y, z, ry = 0) => {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  me.position.set(x, y, z); me.rotation.y = ry;
  return me;
};

export class Level {
  constructor(scene, parsed, audio) {
    this.scene = scene;
    this.p = parsed;
    this.audio = audio;
    this.cell = CFG.cell;
    this.mats = makeMaterials();
    this.doors = [];
    this.items = [];
    this.lights = [];
    this.raycastList = [];
    this.exitState = 'chained'; // chained -> unlocking -> opening -> open
    this.exitT = 0;
    this._build();
  }

  cw(x, z, y = 0) { // cell center to world
    return new THREE.Vector3((x + 0.5) * this.cell, y, (z + 0.5) * this.cell);
  }
  worldToCell(v) { return { x: Math.floor(v.x / this.cell), z: Math.floor(v.z / this.cell) }; }

  _build() {
    const { p, cell, mats, scene } = this;
    const H = CFG.wallH;

    // --- walls (only faces near floor matter; keep cells adjacent to space)
    const wallGeos = [], darkGeos = [];
    const nearFloor = (x, z) => {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < p.w && nz < p.h && !p.solid[nz][nx]) return true;
      }
      return false;
    };
    for (let z = 0; z < p.h; z++) for (let x = 0; x < p.w; x++) {
      const k = p.kind[z][x];
      if ((k === '#' || k === 'R') && p.solid[z][x] && nearFloor(x, z)) {
        const g = new THREE.BoxGeometry(cell, H, cell);
        g.translate((x + 0.5) * cell, H / 2, (z + 0.5) * cell);
        wallGeos.push(g);
      } else if (k === 'W') {
        const g = new THREE.BoxGeometry(cell, H, cell);
        g.translate((x + 0.5) * cell, H / 2, (z + 0.5) * cell);
        darkGeos.push(g);
      }
    }
    this.wallMesh = new THREE.Mesh(mergeGeometries(wallGeos), mats.wall);
    scene.add(this.wallMesh);
    this.raycastList.push(this.wallMesh);
    if (darkGeos.length) {
      const wm = new THREE.Mesh(mergeGeometries(darkGeos), mats.dark);
      scene.add(wm); this.raycastList.push(wm);
    }

    // window dressing: board slats + cold moonlight bleeding through
    for (const w of p.windows) {
      const c = this.cw(w.x, w.z);
      // face direction: toward adjacent floor
      let dir = new THREE.Vector3(0, 0, 1);
      if (w.z + 1 < p.h && !p.solid[w.z + 1][w.x]) dir.set(0, 0, 1);
      else if (w.z - 1 >= 0 && !p.solid[w.z - 1][w.x]) dir.set(0, 0, -1);
      else if (w.x + 1 < p.w && !p.solid[w.z][w.x + 1]) dir.set(1, 0, 0);
      else dir.set(-1, 0, 0);
      const face = c.clone().addScaledVector(dir, cell / 2 + 0.03);
      const horizontal = dir.z !== 0;
      for (let i = 0; i < 4; i++) {
        const slat = box(horizontal ? 1.3 : 0.07, 0.16, horizontal ? 0.07 : 1.3, mats.boardWood,
          face.x, 1.0 + i * 0.42, face.z, 0);
        slat.rotation.z = (Math.random() - 0.5) * 0.12;
        scene.add(slat);
      }
      const moon = new THREE.PointLight(0x6f80c8, 2.6, 7.5, 1.7);
      moon.position.copy(face).addScaledVector(dir, 0.4).setY(1.8);
      scene.add(moon);
    }

    // debris piles in the stairwell
    for (const d of p.debris) {
      const c = this.cw(d.x, d.z);
      for (let i = 0; i < 3; i++) {
        const b = box(0.5 + Math.random() * 0.8, 0.3 + Math.random() * 0.7, 0.5 + Math.random() * 0.8,
          mats.concrete, c.x + (Math.random() - 0.5) * 0.7, 0.2 + i * 0.45, c.z + (Math.random() - 0.5) * 0.7,
          Math.random() * Math.PI);
        scene.add(b);
      }
    }

    // --- floor & ceiling
    const W = p.w * cell, D = p.h * cell;
    const floorMat = mats.floor.clone();
    floorMat.map = mats.floor.map.clone();
    floorMat.map.repeat.set(p.w, p.h);
    floorMat.map.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, D / 2);
    scene.add(floor);
    this.floorMesh = floor;

    const ceilMat = mats.ceiling.clone();
    ceilMat.map = mats.ceiling.map.clone();
    ceilMat.map.repeat.set(p.w, p.h);
    ceilMat.map.needsUpdate = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(W / 2, H, D / 2);
    scene.add(ceil);

    // --- furniture
    const tallGeos = [];
    for (const f of p.furniture) {
      const c = this.cw(f.x, f.z);
      let mesh = null;
      if (f.type === 'w') mesh = box(1.35, 1.95, 0.62, mats.door, c.x, 0.975, c.z);
      else if (f.type === 'f') mesh = box(0.8, 1.75, 0.8, mats.white, c.x, 0.875, c.z);
      else if (f.type === 'o') {
        mesh = box(1.2, 0.9, 1.1, mats.concrete, c.x, 0.45, c.z, Math.random() * 0.6);
        scene.add(box(0.9, 0.6, 0.8, mats.dark, c.x + 0.1, 1.2, c.z - 0.1, Math.random()));
      } else if (f.type === 'b') mesh = box(1.42, 0.52, 1.42, new THREE.MeshLambertMaterial({ color: 0x4a2e30 }), c.x, 0.26, c.z);
      else if (f.type === 't') mesh = box(1.25, 0.78, 1.0, mats.door, c.x, 0.39, c.z);
      else if (f.type === 'u') mesh = box(1.42, 0.72, 0.8, new THREE.MeshLambertMaterial({ color: 0x2e3a30 }), c.x, 0.36, c.z);
      if (mesh) {
        scene.add(mesh);
        if (f.tall) { this.raycastList.push(mesh); }
      }
    }

    // --- doors
    for (const d of p.doors) {
      // panel runs along X when the wall continues east+west of the gap
      const ew = p.solid[d.z][d.x - 1] && p.solid[d.z][d.x + 1];
      const c = this.cw(d.x, d.z);
      const pivot = new THREE.Group();
      // hinge at one edge of the cell
      const open = this._doorOpenDir(d, ew);
      if (ew) pivot.position.set(c.x - cell / 2 + 0.05, 0, c.z);
      else pivot.position.set(c.x, 0, c.z - cell / 2 + 0.05);
      const panel = box(ew ? cell * 0.94 : 0.1, 2.25, ew ? 0.1 : cell * 0.94, this.mats.door,
        ew ? cell * 0.47 : 0, 1.125, ew ? 0 : cell * 0.47);
      panel.userData.door = true;
      const knob = box(0.07, 0.07, 0.18, this.mats.brass, ew ? cell * 0.8 : 0.09, 1.05, ew ? 0.09 : cell * 0.8);
      pivot.add(panel); pivot.add(knob);
      this.scene.add(pivot);
      const door = {
        x: d.x, z: d.z, ew, pivot, panel, openT: 0, target: 0,
        openSign: open, bashHits: 0, busy: false, pos: c.clone().setY(1.1),
      };
      panel.userData.ref = door;
      this.doors.push(door);
      this.raycastList.push(panel);
    }

    // --- exit (chained double door, south wall of lobby)
    this._buildExit();

    // --- ceiling lights
    for (const l of p.lights) {
      const c = this.cw(l.x, l.z, H - 0.12);
      const fixMat = new THREE.MeshLambertMaterial({ color: 0x888877, emissive: 0xffd9a0, emissiveIntensity: 0.9 });
      const fix = box(0.5, 0.08, 0.5, fixMat, c.x, c.y, c.z);
      scene.add(fix);
      const pt = new THREE.PointLight(0xffd9a0, l.flicker ? 3.6 : 2.8, 10, 1.6);
      pt.position.copy(c).setY(H - 0.4);
      scene.add(pt);
      const buzz = this.audio.started ? this.audio.lightBuzz(pt.position) : null;
      this.lights.push({
        ...l, light: pt, mat: fixMat, on: true, timer: Math.random(),
        buzz, baseIntensity: pt.intensity, world: pt.position.clone(),
      });
    }

    // --- items
    for (const it of p.items) this._spawnItem(it.type, this.cw(it.x, it.z, 0));

    // --- fallen teammate
    if (p.teammate) {
      const c = this.cw(p.teammate.x, p.teammate.z);
      const olive = new THREE.MeshLambertMaterial({ color: 0x2f3326 });
      const body = box(0.55, 0.26, 1.0, olive, c.x, 0.13, c.z, 0.4);
      const legs = box(0.4, 0.2, 0.9, olive, c.x + 0.25, 0.1, c.z + 0.8, 0.7);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(0.85, 12), new THREE.MeshLambertMaterial({ color: 0x1d0608 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(c.x, 0.012, c.z + 0.2);
      scene.add(body, legs, pool);
    }

    // ambient — almost nothing; the flashlight carries the scene
    scene.add(new THREE.AmbientLight(0x404048, 0.14));
    scene.fog = new THREE.FogExp2(0x000000, CFG.fx.fogDensity);
  }

  _doorOpenDir(d, ew) {
    // open away from the corridor: toward whichever side has more open floor
    const { p } = this;
    let a = 0, b = 0;
    for (let i = 1; i <= 3; i++) {
      if (ew) {
        if (d.z - i >= 0 && !p.solid[d.z - i][d.x]) a++;
        if (d.z + i < p.h && !p.solid[d.z + i][d.x]) b++;
      } else {
        if (d.x - i >= 0 && !p.solid[d.z][d.x - i]) a++;
        if (d.x + i < p.w && !p.solid[d.z][d.x + i]) b++;
      }
    }
    return a >= b ? -1 : 1;
  }

  _buildExit() {
    const cells = this.p.exitCells;
    if (!cells.length) return;
    const c0 = this.cw(cells[0].x, cells[0].z);
    const c1 = this.cw(cells[cells.length - 1].x, cells[cells.length - 1].z);
    const mid = c0.clone().add(c1).multiplyScalar(0.5);
    const grp = new THREE.Group();
    const matD = new THREE.MeshLambertMaterial({ color: 0x37323a });
    this.exitPanels = [];
    for (const ce of cells) {
      const c = this.cw(ce.x, ce.z);
      const pv = new THREE.Group();
      const sign = Math.sign(c.x - mid.x) || 1;
      pv.position.set(c.x + sign * (this.cell / 2 - 0.05), 0, c.z);
      const panel = box(this.cell * 0.94, 2.4, 0.12, matD, -sign * this.cell * 0.47, 1.2, 0);
      pv.add(panel);
      grp.add(pv);
      this.exitPanels.push({ pivot: pv, sign });
      this.raycastList.push(panel);
    }
    // chain + padlock
    this.chain = box(this.cell * 2.0, 0.07, 0.06, this.mats.metal, mid.x, 1.15, mid.z - 0.12);
    this.padlock = box(0.16, 0.22, 0.08, this.mats.brass, mid.x, 1.0, mid.z - 0.14);
    grp.add(this.chain, this.padlock);
    // EXIT sign: the only green in the game
    const signMat = new THREE.MeshLambertMaterial({ color: 0x0c2a10, emissive: 0x2bff66, emissiveIntensity: 1.4 });
    const sign = box(0.7, 0.22, 0.08, signMat, mid.x, 2.45, mid.z - 0.15);
    grp.add(sign);
    const gl = new THREE.PointLight(0x2bff66, 1.1, 4.5, 1.8);
    gl.position.set(mid.x, 2.3, mid.z - 0.5);
    grp.add(gl);
    this.scene.add(grp);
    this.exitPos = mid.clone().setY(1.2);
  }

  _spawnItem(type, at, payload = null) {
    const s = this.scene;
    let mesh, label, y = 0;
    const grp = new THREE.Group();
    if (type === 'a') {
      grp.add(box(0.16, 0.07, 0.1, this.mats.brass, 0, 0.035, 0));
      grp.add(box(0.1, 0.06, 0.08, this.mats.brass, 0.1, 0.03, 0.07, 0.5));
      label = 'loose 9mm';
    } else if (type === 'm') {
      grp.add(box(0.05, 0.14, 0.04, this.mats.metal, 0, 0.07, 0));
      label = payload ? 'your magazine' : 'spare magazine';
    } else if (type === 's') {
      grp.add(box(0.15, 0.1, 0.1, new THREE.MeshLambertMaterial({ color: 0x7a2222 }), 0, 0.05, 0));
      label = 'shotgun shells';
    } else if (type === 'S') {
      grp.add(box(1.0, 0.07, 0.07, this.mats.metal, 0, 0.1, 0, 0.3));
      grp.add(box(0.3, 0.1, 0.08, this.mats.door, -0.4, 0.08, -0.12, 0.3));
      label = "Reyes' 12-gauge";
    } else if (type === 'K') {
      const km = new THREE.MeshLambertMaterial({ color: 0x9c8430, emissive: 0x6b5410, emissiveIntensity: 0.5 });
      grp.add(box(0.05, 0.02, 0.12, km, 0, 0.81, 0));
      label = 'fire-exit key';
    } else if (type === 'B') {
      grp.add(box(0.16, 0.08, 0.1, this.mats.white, 0, 0.04, 0));
      label = 'field dressing';
    } else if (type === 'k') {
      grp.add(box(0.07, 0.18, 0.07, this.mats.metal, 0, 0.09, 0));
      grp.add(box(0.22, 0.04, 0.05, this.mats.boardWood, 0.12, 0.02, 0.05));
      label = 'cleaning kit';
    }
    grp.position.copy(at);
    s.add(grp);
    const item = { type, mesh: grp, pos: grp.position.clone().setY(at.y + 0.4), label, taken: false, payload };
    this.items.push(item);
    return item;
  }

  dropMagItem(pos, mag) {
    const it = this._spawnItem('m', new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.3, 0, pos.z + (Math.random() - 0.5) * 0.3), mag);
    this.audio.magDropFloor();
    return it;
  }

  removeItem(item) {
    item.taken = true;
    this.scene.remove(item.mesh);
  }

  // ---- doors ---------------------------------------------------------

  doorAtCell(x, z) { return this.doors.find((d) => d.x === x && d.z === z); }

  toggleDoor(door, slow = true) {
    if (door.busy) return;
    door.target = door.target > 0.5 ? 0 : 1;
    door.speed = slow ? 0.9 : 2.4;
    this.audio.doorCreak(door.pos, slow ? 1 : 1.8);
  }

  burstDoor(door) {
    door.target = 1; door.speed = 5.0;
    this.audio.doorBurst(door.pos);
  }

  doorsClosedSet() {
    const s = new Set();
    for (const d of this.doors) if (d.openT < 0.5) s.add(d.z * this.p.w + d.x);
    return s;
  }

  // ---- exit ----------------------------------------------------------

  beginUnlock() { this.exitState = 'unlocking'; this.exitT = 0; this.audio.unlockChain(); }

  // ---- queries -------------------------------------------------------

  litnessAt(pos) {
    for (const l of this.lights) {
      if (!l.on) continue;
      if (pos.distanceTo(l.world) < 5.5) return 0.85;
    }
    return 0.0;
  }

  isBlockedCell(x, z, { forEnemy = false } = {}) {
    const { p } = this;
    if (x < 0 || z < 0 || x >= p.w || z >= p.h) return true;
    if (p.solid[z][x]) {
      // exit opens late in the run
      if (this.exitState === 'open' && p.kind[z][x] === 'X') return false;
      return true;
    }
    if (p.lowBlock[z][x]) return true;
    const d = this.doorAtCell(x, z);
    if (d && d.openT < 0.35) return true;
    return false;
  }

  // circle vs grid, axis-separated slide
  moveCircle(pos, dx, dz, r, opts = {}) {
    const c = this.cell;
    const tryAxis = (nx, nz) => {
      const minX = Math.floor((nx - r) / c), maxX = Math.floor((nx + r) / c);
      const minZ = Math.floor((nz - r) / c), maxZ = Math.floor((nz + r) / c);
      for (let gz = minZ; gz <= maxZ; gz++) for (let gx = minX; gx <= maxX; gx++) {
        if (!this.isBlockedCell(gx, gz, opts)) continue;
        // closest point on cell AABB to circle centre
        const cx = Math.max(gx * c, Math.min(nx, (gx + 1) * c));
        const cz = Math.max(gz * c, Math.min(nz, (gz + 1) * c));
        if ((nx - cx) ** 2 + (nz - cz) ** 2 < r * r) return false;
      }
      return true;
    };
    let x = pos.x, z = pos.z;
    if (tryAxis(x + dx, z)) x += dx;
    if (tryAxis(x, z + dz)) z += dz;
    return { x, z };
  }

  path(fromW, toW) {
    const a = this.worldToCell(fromW), b = this.worldToCell(toW);
    return findPath(this.p, this.doorsClosedSet(), a, b);
  }

  update(dt, time) {
    // doors
    for (const d of this.doors) {
      const want = d.target;
      if (Math.abs(d.openT - want) > 0.001) {
        d.openT += Math.sign(want - d.openT) * (d.speed || 1) * dt;
        d.openT = Math.max(0, Math.min(1, d.openT));
        const ang = d.openT * 1.8 * d.openSign;
        d.pivot.rotation.y = ang;
      }
    }
    // exit sequence
    if (this.exitState === 'unlocking') {
      this.exitT += dt;
      this.padlock.position.y = Math.max(0.2, 1.0 - this.exitT * 0.5);
      if (this.exitT > 2.9) {
        this.exitState = 'opening'; this.exitT = 0;
        this.chain.visible = false; this.padlock.visible = false;
      }
    } else if (this.exitState === 'opening') {
      this.exitT += dt;
      const t = Math.min(1, this.exitT / 1.6);
      for (const ep of this.exitPanels) ep.pivot.rotation.y = -ep.sign * t * 1.5;
      if (t >= 1) this.exitState = 'open';
    }
    // flickering lights
    for (const l of this.lights) {
      l.timer -= dt;
      if (l.timer <= 0) {
        if (l.flicker) {
          const dying = l.x > 20; // the north-hall fixture barely lives
          const pOn = dying ? 0.22 : 0.72;
          l.on = Math.random() < pOn;
          l.timer = l.on ? (dying ? 0.06 + Math.random() * 0.2 : 0.2 + Math.random() * 0.9)
                         : 0.05 + Math.random() * (dying ? 1.4 : 0.35);
        } else { l.on = true; l.timer = 1; }
        l.light.intensity = l.on ? l.baseIntensity : 0;
        l.mat.emissiveIntensity = l.on ? 0.9 : 0.02;
        if (l.buzz) l.buzz.set(l.on && l.flicker);
      }
    }
  }
}
