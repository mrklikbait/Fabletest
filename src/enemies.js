import * as THREE from 'three';
import { CFG } from './config.js';

// Subjects die convincingly to good shooting — that is the contract that
// keeps the gun honest. Heads end it instantly, torso hits stagger and
// accumulate, a ruined leg converts a walker into a crawler that keeps
// coming. The threat is never hit points; it is numbers, dark, and noise.

const E = CFG.enemy;

function buildBody(tint) {
  const mat = new THREE.MeshLambertMaterial({ color: tint });
  const mk = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  };
  const root = new THREE.Group();
  const pelvis = mk(0.34, 0.22, 0.24, 0, 0.92, 0);
  const torso = mk(0.40, 0.55, 0.26, 0, 1.31, 0);
  const head = mk(0.20, 0.24, 0.20, 0, 1.72, 0);
  const armL = new THREE.Group(); armL.position.set(-0.27, 1.52, 0);
  const armR = new THREE.Group(); armR.position.set(0.27, 1.52, 0);
  const armLm = mk(0.09, 0.58, 0.10, 0, -0.29, 0); armL.add(armLm);
  const armRm = mk(0.09, 0.58, 0.10, 0, -0.29, 0); armR.add(armRm);
  const legL = new THREE.Group(); legL.position.set(-0.10, 0.88, 0);
  const legR = new THREE.Group(); legR.position.set(0.10, 0.88, 0);
  const legLm = mk(0.12, 0.86, 0.13, 0, -0.45, 0); legL.add(legLm);
  const legRm = mk(0.12, 0.86, 0.13, 0, -0.45, 0); legR.add(legRm);
  root.add(pelvis, torso, head, armL, armR, legL, legR);
  return { root, pelvis, torso, head, armL, armR, legL, legR, meshes: { head, torso, pelvis, armL: armLm, armR: armRm, legL: legLm, legR: legRm } };
}

export class Subjects {
  constructor(ctx) {
    this.ctx = ctx; // { scene, level, audio, fear, fx, ui, player, noise, stats }
    this.list = [];
    this._hitArr = [];
  }

  spawnAll(defs) {
    for (const d of defs) this._spawn(d);
  }

  _spawn(def) {
    const { ctx } = this;
    const tint = new THREE.Color().setHSL(0.09 + Math.random() * 0.04, 0.14, 0.56 + Math.random() * 0.1);
    const body = buildBody(tint);
    const pos = ctx.level.cw(def.x, def.z);
    body.root.position.set(pos.x, 0, pos.z);
    ctx.scene.add(body.root);

    const s = {
      body,
      pos: body.root.position,
      yaw: Math.random() * Math.PI * 2,
      mode: def.mode === 'crawler' ? 'wander' : def.mode, // crawlers wander too
      crawler: def.mode === 'crawler',
      awake: def.mode !== 'dormant',
      riseT: 0,
      torsoHp: E.torsoHp,
      legHp: { L: E.legHp, R: E.legHp },
      crawlConvertT: 0,
      path: null, pathIdx: 0, repath: Math.random() * E.repathInterval,
      target: null, lastKnown: null, lostT: 0,
      scanT: 0, wanderT: 0,
      staggerT: 0, windupT: -1, attackCd: 0, lungeT: 0, lungeCd: 0,
      bash: null, bashT: 0,
      walkPhase: Math.random() * 6, stepT: 0, moanT: 2 + Math.random() * E.moanMax,
      senseT: Math.random() * 0.12, seesPlayer: false, screamed: false,
      voiceT: 0,
      dead: false, fallT: -1,
      voice: ctx.audio.started ? ctx.audio.createVoice(pos) : null,
    };
    for (const [part, mesh] of Object.entries(body.meshes)) {
      mesh.userData = { enemy: s, part };
    }
    if (s.crawler) this._poseCrawler(s, true);
    if (def.mode === 'dormant') this._poseDormant(s);
    this.list.push(s);
  }

  // ---- poses ---------------------------------------------------------

  _poseDormant(s) {
    const b = s.body;
    b.legL.rotation.x = 1.45; b.legR.rotation.x = 1.35;
    b.torso.rotation.x = 0.35; b.torso.position.y = 1.05;
    b.head.rotation.x = 0.55; b.head.position.y = 1.38;
    b.pelvis.position.y = 0.45;
    b.armL.position.y = 1.20; b.armR.position.y = 1.20;
    b.legL.position.y = 0.42; b.legR.position.y = 0.42;
  }

  _poseStand(s) {
    const b = s.body;
    b.legL.rotation.set(0, 0, 0); b.legR.rotation.set(0, 0, 0);
    b.torso.rotation.set(0, 0, 0); b.torso.position.set(0, 1.31, 0);
    b.head.rotation.set(0, 0, 0); b.head.position.set(0, 1.72, 0);
    b.pelvis.position.set(0, 0.92, 0);
    b.armL.position.set(-0.27, 1.52, 0); b.armR.position.set(0.27, 1.52, 0);
    b.legL.position.set(-0.10, 0.88, 0); b.legR.position.set(0.10, 0.88, 0);
  }

  _poseCrawler(s, instant = false) {
    const b = s.body;
    s.crawler = true;
    b.pelvis.position.set(0, 0.30, 0.1);
    b.torso.position.set(0, 0.40, -0.12); b.torso.rotation.x = 1.22;
    b.head.position.set(0, 0.55, -0.38); b.head.rotation.x = 1.1;
    b.armL.position.set(-0.27, 0.52, -0.28);
    b.armR.position.set(0.27, 0.52, -0.28);
    for (const leg of [b.legL, b.legR]) {
      leg.position.y = 0.28; leg.position.z = 0.28; leg.rotation.x = 1.5;
    }
  }

  // ---- combat --------------------------------------------------------

  hitMeshes() {
    this._hitArr.length = 0;
    for (const s of this.list) {
      if (s.dead) continue;
      for (const m of Object.values(s.body.meshes)) {
        if (m.parent === null) continue; // detached limb
        this._hitArr.push(m);
      }
    }
    return this._hitArr;
  }

  applyHit(ud, dmg, point, dir) {
    const s = ud.enemy;
    if (s.dead) return;
    const { ctx } = this;
    ctx.fx.bloodPuff(point, dir);
    if (s.voice) s.voice.hurt();
    this._aggro(s);

    const part = ud.part;
    if (part === 'head') {
      s.torsoHp -= dmg * 4;
    } else if (part === 'armL' || part === 'armR') {
      s.torsoHp -= dmg * 0.5;
    } else if (part === 'legL' || part === 'legR') {
      const side = part === 'legL' ? 'L' : 'R';
      s.legHp[side] -= dmg;
      if (s.legHp[side] <= 0 && !s.crawler) {
        this._severLeg(s, side);
      }
    } else {
      s.torsoHp -= dmg;
    }

    if (s.torsoHp <= 0) { this._die(s); return; }
    if (dmg >= 20) { // real stopping power: hits visibly interrupt
      s.staggerT = E.staggerTime;
      s.windupT = -1;
      s.lungeT = 0;
    }
  }

  _severLeg(s, side) {
    const b = s.body;
    const leg = side === 'L' ? b.legL : b.legR;
    // the leg stays where it fell; the subject does not stop
    const wp = new THREE.Vector3();
    leg.getWorldPosition(wp);
    leg.removeFromParent();
    leg.position.set(wp.x + (Math.random() - 0.5) * 0.4, 0.08, wp.z + (Math.random() - 0.5) * 0.4);
    leg.rotation.set(Math.PI / 2, Math.random() * Math.PI, 0);
    this.ctx.scene.add(leg);
    if (s.voice) s.voice.scream();
    this._poseCrawler(s);
    this.ctx.fear.spike(0.10);
    this.ctx.ui.event('crawler');
  }

  _die(s) {
    s.dead = true;
    s.mode = 'dead';
    s.fallT = 0;
    this.ctx.stats.kills++;
    if (s.voice) s.voice.die();
  }

  _aggro(s) {
    if (s.dead) return;
    if (!s.awake) { this._wake(s, true); return; }
    if (s.mode !== 'hunt') {
      s.mode = 'hunt';
      this._scream(s);
    }
    s.lastKnown = this.ctx.player.pos.clone();
    s.lostT = 0;
  }

  _wake(s, aggro) {
    if (s.awake || s.dead) return;
    s.awake = true;
    s.riseT = 1.25;
    s.mode = aggro ? 'hunt' : 'investigate';
    if (!aggro) s.target = this.ctx.player.pos.clone();
    this._scream(s);
    this.ctx.fear.spike(CFG.fear.spikeScream);
  }

  _scream(s) {
    if (s.voice && !s.screamed) {
      s.voice.scream();
      this.ctx.fear.spike(CFG.fear.spikeScream);
      s.screamed = true;
      setTimeout(() => { s.screamed = false; }, 6000);
    }
  }

  shove(from, dir) {
    for (const s of this.list) {
      if (s.dead) continue;
      const to = s.pos.clone().sub(from); to.y = 0;
      const d = to.length();
      if (d > 1.25) continue;
      to.normalize();
      if (to.dot(dir) < 0.35) continue;
      // push back, collision-checked, in small steps
      for (let i = 0; i < 6; i++) {
        const r = this.ctx.level.moveCircle(s.pos, to.x * 0.22, to.z * 0.22, 0.38);
        s.pos.x = r.x; s.pos.z = r.z;
      }
      s.staggerT = 0.8;
      s.windupT = -1;
      this._aggro(s);
    }
  }

  hear(pos, radius) {
    for (const s of this.list) {
      if (s.dead) continue;
      const mul = s.awake ? 1 : E.hearDormantMul;
      if (s.pos.distanceTo(pos) > radius * mul) continue;
      if (!s.awake) { this._wake(s, false); s.target = pos.clone(); continue; }
      if (s.mode === 'hunt') {
        if (!s.seesPlayer) { s.lastKnown = pos.clone(); }
      } else {
        s.mode = 'investigate';
        s.target = pos.clone();
        s.path = null;
      }
    }
  }

  getStimulus() {
    let nearest = Infinity, hunting = 0, alive = 0;
    for (const s of this.list) {
      if (s.dead) continue;
      alive++;
      if (s.mode === 'hunt') {
        hunting++;
        if (s.seesPlayer) nearest = Math.min(nearest, s.pos.distanceTo(this.ctx.player.pos));
      }
    }
    return { nearestVisible: nearest, huntingCount: hunting, threatsAlive: alive > 0 };
  }

  // ---- senses --------------------------------------------------------

  _canSee(s) {
    const { ctx } = this;
    const p = ctx.player;
    if (p.dead) return false;
    const eyeY = s.crawler ? 0.55 : 1.7;
    const from = s.pos.clone().setY(eyeY);
    const to = p.eye();
    const d = from.distanceTo(to);
    const lit = ctx.weapons.flashOn || ctx.level.litnessAt(p.pos) > 0.4;
    let range = lit ? E.sightRange : E.sightRangeDark;
    if (p.crouched) range *= 0.78;
    if (d > range) return false;
    const dir = to.clone().sub(from).normalize();
    const facing = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    const flat = dir.clone().setY(0).normalize();
    if (facing.dot(flat) < Math.cos(E.fov / 2)) return false;
    this._rayC = this._rayC || new THREE.Raycaster();
    this._rayC.set(from, dir);
    this._rayC.far = d - 0.2;
    return this._rayC.intersectObjects(ctx.level.raycastList, false).length === 0;
  }

  // ---- update --------------------------------------------------------

  update(dt) {
    const { ctx } = this;
    for (const s of this.list) this._updateOne(s, dt);
  }

  _updateOne(s, dt) {
    const { ctx } = this;
    const b = s.body;

    if (s.dead) {
      if (s.fallT >= 0 && s.fallT < 1) {
        s.fallT = Math.min(1, s.fallT + dt * 2.4);
        const t = s.fallT;
        if (!s.crawler) {
          b.root.rotation.z = t * 1.45;
          b.root.position.y = -t * 0.65;
        } else {
          b.root.rotation.x = -t * 0.25;
          b.root.position.y = -t * 0.18;
        }
        if (s.fallT >= 1 && s.voice) { s.voice.thump(); }
      }
      return;
    }

    s.attackCd = Math.max(0, s.attackCd - dt);
    s.lungeCd = Math.max(0, s.lungeCd - dt);

    // dormant: a body in a corner until it isn't
    if (!s.awake) return;
    if (s.riseT > 0) {
      s.riseT -= dt;
      const t = Math.max(0, Math.min(1, 1 - s.riseT / 1.25));
      // blend from slumped to standing
      b.torso.rotation.x = 0.35 * (1 - t); b.torso.position.y = 1.05 + 0.26 * t;
      b.head.rotation.x = 0.55 * (1 - t); b.head.position.y = 1.38 + 0.34 * t;
      b.pelvis.position.y = 0.45 + 0.47 * t;
      b.legL.rotation.x = 1.45 * (1 - t); b.legR.rotation.x = 1.35 * (1 - t);
      b.legL.position.y = 0.42 + 0.46 * t; b.legR.position.y = 0.42 + 0.46 * t;
      b.armL.position.y = 1.20 + 0.32 * t; b.armR.position.y = 1.20 + 0.32 * t;
      return;
    }

    // senses tick
    s.senseT -= dt;
    if (s.senseT <= 0) {
      s.senseT = 0.12;
      s.seesPlayer = this._canSee(s);
      if (s.seesPlayer) {
        if (s.mode !== 'hunt') { s.mode = 'hunt'; this._scream(s); s.path = null; }
        s.lastKnown = ctx.player.pos.clone();
        s.lostT = 0;
      } else if (s.mode === 'hunt') {
        s.lostT += 0.12;
        if (s.lostT > 7) { s.mode = 'investigate'; s.target = s.lastKnown ? s.lastKnown.clone() : null; s.path = null; }
      }
    }

    // stagger interrupts everything — stopping power you can feel
    if (s.staggerT > 0) {
      s.staggerT -= dt;
      b.torso.rotation.x = (s.crawler ? 1.22 : 0) - 0.45 * (s.staggerT / E.staggerTime);
      return;
    }

    // attack windup → strike
    if (s.windupT >= 0) {
      s.windupT -= dt;
      const raise = 1 - Math.max(0, s.windupT) / E.attackWindup;
      b.armL.rotation.x = -1.4 * raise;
      b.armR.rotation.x = -1.4 * raise;
      if (s.windupT <= 0) {
        s.windupT = -1;
        const d = s.pos.distanceTo(ctx.player.pos);
        if (d < E.attackRange + 0.4 && !ctx.player.dead) {
          ctx.player.damage(s.crawler ? E.crawlerDamage : E.attackDamage);
        }
      }
      return;
    }

    let speed = 0;
    let moveDir = null;

    if (s.mode === 'hunt') {
      const pp = ctx.player.pos;
      const dist = s.pos.distanceTo(pp);
      const straight = s.seesPlayer;

      if (dist < E.attackRange && s.attackCd <= 0) {
        s.windupT = E.attackWindup;
        s.attackCd = E.attackCooldown;
        return;
      }
      if (!s.crawler && straight && dist < E.lungeRange + 2.2 && dist > E.attackRange && s.lungeCd <= 0) {
        s.lungeT = 0.55;
        s.lungeCd = 2.4;
      }
      if (s.lungeT > 0) {
        s.lungeT -= dt;
        moveDir = pp.clone().sub(s.pos).setY(0).normalize();
        speed = E.lungeSpeed;
      } else if (straight && dist < 6) {
        moveDir = pp.clone().sub(s.pos).setY(0).normalize();
        speed = s.crawler ? E.crawlSpeed : E.hunt;
      } else {
        this._followPath(s, s.lastKnown || pp, dt);
        moveDir = s._moveDir;
        speed = s.crawler ? E.crawlSpeed : E.hunt;
      }
    } else if (s.mode === 'investigate') {
      if (s.target) {
        if (s.pos.distanceTo(s.target) < 1.0) {
          s.target = null;
          s.scanT = 3.5;
        } else {
          this._followPath(s, s.target, dt);
          moveDir = s._moveDir;
          speed = s.crawler ? E.crawlSpeed : E.walk * 1.4;
        }
      } else if (s.scanT > 0) {
        s.scanT -= dt;
        s.yaw += dt * 0.9;
      } else s.mode = 'wander';
    } else { // wander
      s.wanderT -= dt;
      if (s.wanderT <= 0) {
        s.wanderT = 2.5 + Math.random() * 4;
        const c = ctx.level.worldToCell(s.pos);
        for (let i = 0; i < 8; i++) {
          const nx = c.x + ((Math.random() * 7) | 0) - 3;
          const nz = c.z + ((Math.random() * 7) | 0) - 3;
          if (!ctx.level.isBlockedCell(nx, nz)) { s.target = ctx.level.cw(nx, nz); break; }
        }
      }
      if (s.target && s.pos.distanceTo(s.target) > 0.7) {
        this._followPath(s, s.target, dt);
        moveDir = s._moveDir;
        speed = s.crawler ? E.crawlSpeed * 0.7 : E.walk;
      }
    }

    // door bashing: a hunt does not respect plywood
    if (s.bash) {
      const door = s.bash;
      if (door.openT > 0.6) { s.bash = null; }
      else {
        s.bashT -= dt;
        if (s.bashT <= 0) {
          s.bashT = E.bashInterval;
          door.bashHits++;
          ctx.audio.doorBash(door.pos);
          ctx.noise(door.pos, CFG.noiseRadius.doorBash);
          ctx.fear.spike(0.06);
          if (door.bashHits >= E.bashHits) { ctx.level.burstDoor(door); s.bash = null; }
        }
        return; // standing at the door, hammering
      }
    }

    if (moveDir && speed > 0) {
      // door ahead?
      const aheadCell = ctx.level.worldToCell(s.pos.clone().addScaledVector(moveDir, 0.7));
      const door = ctx.level.doorAtCell(aheadCell.x, aheadCell.z);
      if (door && door.openT < 0.35) {
        if (s.mode === 'hunt') { s.bash = door; s.bashT = 0.3; }
        else { ctx.level.toggleDoor(door, true); } // wanderers paw doors open slowly
      } else {
        // separation
        for (const o of this.list) {
          if (o === s || o.dead) continue;
          const away = s.pos.clone().sub(o.pos).setY(0);
          const d = away.length();
          if (d < 0.85 && d > 0.0001) moveDir.addScaledVector(away.normalize(), (0.85 - d) * 1.6);
        }
        moveDir.normalize();
        const r = ctx.level.moveCircle(s.pos, moveDir.x * speed * dt, moveDir.z * speed * dt, 0.36);
        const moved = Math.hypot(r.x - s.pos.x, r.z - s.pos.z);
        s.pos.x = r.x; s.pos.z = r.z;
        s.walkPhase += moved * (s.crawler ? 4.5 : 3.2);
        s.stepT -= moved;
        if (s.stepT <= 0) {
          s.stepT = 0.75;
          if (s.voice) s.voice.step();
        }
        const targetYaw = Math.atan2(-moveDir.x, -moveDir.z);
        let dy = targetYaw - s.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        s.yaw += dy * Math.min(1, dt * 6);
      }
    }

    // face the player when close and hunting
    if (s.mode === 'hunt' && s.seesPlayer && s.pos.distanceTo(ctx.player.pos) < 4) {
      const to = ctx.player.pos.clone().sub(s.pos);
      const targetYaw = Math.atan2(-to.x, -to.z);
      let dy = targetYaw - s.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      s.yaw += dy * Math.min(1, dt * 8);
    }

    b.root.rotation.y = s.yaw;

    // locomotion animation
    const sw = Math.sin(s.walkPhase);
    if (!s.crawler) {
      if (b.legL.parent) b.legL.rotation.x = sw * 0.55;
      if (b.legR.parent) b.legR.rotation.x = -sw * 0.55;
      const arms = s.mode === 'hunt' ? -1.15 : 0;
      b.armL.rotation.x = arms + (s.mode === 'hunt' ? sw * 0.2 : -sw * 0.4);
      b.armR.rotation.x = arms + (s.mode === 'hunt' ? -sw * 0.2 : sw * 0.4);
      if (s.lungeT > 0) { b.armL.rotation.x = -1.5; b.armR.rotation.x = -1.5; }
      b.torso.rotation.x = s.mode === 'hunt' ? 0.18 : 0.05;
    } else {
      b.armL.rotation.x = -1.0 + sw * 0.5;
      b.armR.rotation.x = -1.0 - sw * 0.5;
      b.root.position.y = Math.abs(sw) * 0.04;
    }

    // voice position + idle moans
    s.voiceT -= dt;
    if (s.voice && s.voiceT <= 0) {
      s.voiceT = 0.15;
      s.voice.setPos(s.pos.clone().setY(s.crawler ? 0.5 : 1.6));
    }
    s.moanT -= dt;
    if (s.moanT <= 0) {
      s.moanT = (s.mode === 'hunt' ? E.moanMin * 0.4 : E.moanMin) + Math.random() * (E.moanMax - E.moanMin);
      if (s.voice) s.voice.moan();
    }
  }

  _followPath(s, targetWorld, dt) {
    const { ctx } = this;
    s.repath -= dt;
    if (!s.path || s.repath <= 0) {
      s.repath = E.repathInterval + Math.random() * 0.2;
      s.path = ctx.level.path(s.pos, targetWorld);
      s.pathIdx = 1;
    }
    s._moveDir = null;
    if (!s.path || s.path.length < 2) {
      // direct fallback
      const d = targetWorld.clone().sub(s.pos).setY(0);
      if (d.lengthSq() > 0.04) s._moveDir = d.normalize();
      return;
    }
    if (s.pathIdx >= s.path.length) s.pathIdx = s.path.length - 1;
    const wp = ctx.level.cw(s.path[s.pathIdx].x, s.path[s.pathIdx].z);
    if (s.pos.distanceTo(wp) < 0.45 && s.pathIdx < s.path.length - 1) s.pathIdx++;
    const d = wp.sub(s.pos).setY(0);
    if (d.lengthSq() > 0.001) s._moveDir = d.normalize();
  }
}
