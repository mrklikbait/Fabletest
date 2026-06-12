import * as THREE from 'three';
import { CFG } from './config.js';
import { PistolAmmo, ShotgunAmmo } from './ammo.js';

// The handling law: the muzzle is always exactly where your inputs plus a
// VISIBLE, low-frequency disturbance put it. Bullets leave the barrel along
// the barrel — there is no invisible spread cone on the player's guns.
// Fear widens the drift and slows the hands; it never randomizes them.

const gunmetal = new THREE.MeshLambertMaterial({ color: 0x2c2e33, emissive: 0x0b0c10, emissiveIntensity: 1 });
const polymer = new THREE.MeshLambertMaterial({ color: 0x1d1d20, emissive: 0x08080a, emissiveIntensity: 1 });
const tritium = new THREE.MeshLambertMaterial({ color: 0x223326, emissive: 0x7dffb0, emissiveIntensity: 0.9 });
const woodMat = new THREE.MeshLambertMaterial({ color: 0x4a3018 });

const bx = (w, h, d, m, x, y, z) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
};

function buildPistol() {
  const g = new THREE.Group();
  const slide = bx(0.032, 0.030, 0.19, gunmetal, 0, 0.038, -0.03);
  g.add(slide);
  g.add(bx(0.030, 0.035, 0.14, polymer, 0, 0.005, -0.02));
  const grip = bx(0.030, 0.10, 0.042, polymer, 0, -0.048, 0.032);
  grip.rotation.x = 0.22;
  g.add(grip);
  g.add(bx(0.026, 0.008, 0.05, polymer, 0, -0.015, -0.01)); // guard
  g.add(bx(0.005, 0.012, 0.006, tritium, 0, 0.058, -0.115)); // front post
  g.add(bx(0.005, 0.010, 0.006, tritium, -0.0075, 0.057, 0.052));
  g.add(bx(0.005, 0.010, 0.006, tritium, 0.0075, 0.057, 0.052));
  const lightBody = bx(0.022, 0.024, 0.05, gunmetal, 0, -0.024, -0.095);
  g.add(lightBody);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.038, -0.135);
  g.add(muzzle);
  const flashMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flashMesh.position.copy(muzzle.position).z -= 0.06;
  g.add(flashMesh);
  return { group: g, slide, muzzle, flashMesh, lightAnchor: lightBody };
}

function buildShotgun() {
  const g = new THREE.Group();
  g.add(bx(0.046, 0.06, 0.24, gunmetal, 0, 0, 0.03));            // receiver
  g.add(bx(0.024, 0.024, 0.56, gunmetal, 0, 0.022, -0.33));      // barrel
  g.add(bx(0.022, 0.022, 0.46, gunmetal, 0, -0.008, -0.26));     // tube
  const pump = bx(0.05, 0.045, 0.17, woodMat, 0, -0.012, -0.20);
  g.add(pump);
  const stock = bx(0.04, 0.10, 0.26, woodMat, 0, -0.035, 0.26);
  stock.rotation.x = 0.18;
  g.add(stock);
  g.add(bx(0.006, 0.010, 0.006, tritium, 0, 0.045, -0.59));      // bead
  const lightBody = bx(0.024, 0.026, 0.06, gunmetal, 0.03, -0.01, -0.42);
  g.add(lightBody);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.022, -0.615);
  g.add(muzzle);
  const flashMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flashMesh.position.copy(muzzle.position).z -= 0.08;
  g.add(flashMesh);
  return { group: g, pump, muzzle, flashMesh, lightAnchor: lightBody, pumpBaseZ: pump.position.z };
}

const POSES = {
  pistol: {
    hip: { p: [0.135, -0.150, -0.32], r: [0.028, -0.04, 0.02] }, // converges with eyeline ~4m out
    ads: { p: [0.000, -0.0585, -0.24], r: [0, 0, 0] },
    low: { p: [0.105, -0.205, -0.28], r: [-0.55, -0.06, 0.05] },
    compress: { p: [0.06, -0.17, -0.15], r: [-0.85, -0.25, 0.1] },
    action: { p: [0.06, -0.16, -0.24], r: [-0.45, 0.15, 0.35] },
    check: { p: [0.03, -0.12, -0.20], r: [-0.25, 0.10, 0.55] },
  },
  shotgun: {
    hip: { p: [0.145, -0.135, -0.30], r: [0.024, -0.05, 0.02] },
    ads: { p: [0.000, -0.045, -0.20], r: [0, 0, 0] },
    low: { p: [0.12, -0.20, -0.26], r: [-0.50, -0.08, 0.06] },
    compress: { p: [0.08, -0.16, -0.10], r: [-0.80, -0.3, 0.1] },
    action: { p: [0.08, -0.17, -0.26], r: [-0.40, 0.10, 0.25] },
    check: { p: [0.08, -0.17, -0.26], r: [-0.40, 0.10, 0.25] },
  },
};

export class WeaponSystem {
  constructor(ctx) {
    this.ctx = ctx; // { camera, scene, level, audio, fear, fx, ui, belt, stats, player, noise() }
    const { camera } = ctx;

    this.pistolModel = buildPistol();
    this.shotgunModel = buildShotgun();
    this.root = new THREE.Group();
    this.root.add(this.pistolModel.group);
    this.root.add(this.shotgunModel.group);
    this.shotgunModel.group.visible = false;
    camera.add(this.root);

    this.pistol = new PistolAmmo(ctx.audio, {
      dropMag: (mag) => ctx.level.dropMagItem(ctx.player.pos, mag),
      report: (text) => ctx.ui.whisper(text),
      onJam: () => { ctx.fear.spike(CFG.fear.spikeJam); ctx.ui.whisper('stoppage.'); },
    });
    this.shotgun = new ShotgunAmmo(ctx.audio);
    this.hasShotgun = false;
    this.current = 'pistol';
    this.switchT = 1; // 0..1 raise progress

    // flashlight rides the gun: aiming the light IS aiming the muzzle.
    // hot centre beam + wide dim spill, like a real weapon light
    this.flash = new THREE.SpotLight(0xfff1cf, 38, 26, 0.42, 0.75, 1.4);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.camera.near = 0.2;
    this.flash.shadow.camera.far = 26;
    this.spill = new THREE.SpotLight(0xf5e8cc, 7, 14, 1.05, 0.9, 1.6);
    this.flashTarget = new THREE.Object3D();
    this.flashOn = true;

    this.adsT = 0;
    this.recoilPitch = 0;
    this.recoilZ = 0;
    this.slideT = 0;
    this.kickT = 0;
    this.refire = 0;
    this.compress = 0;
    this.swayT = Math.random() * 100;
    this.holdingBreath = false;
    this.breathHeld = 0;
    this.gaspRecover = 0;
    this.rDownAt = -1;
    this.rTapAt = -10;
    this.pendingTapReload = -1;
    this.pressCheckFired = false;
    this.curPos = new THREE.Vector3(0.135, -0.15, -0.32);
    this.curRot = new THREE.Euler(0, 0, 0);
    this._ray = new THREE.Raycaster();
    this._tmpQ = new THREE.Quaternion();
    this._reparentLight();
  }

  _model() { return this.current === 'pistol' ? this.pistolModel : this.shotgunModel; }
  _ammo() { return this.current === 'pistol' ? this.pistol : this.shotgun; }

  _reparentLight() {
    const m = this._model();
    m.lightAnchor.add(this.flash);
    m.lightAnchor.add(this.spill);
    m.lightAnchor.add(this.flashTarget);
    this.flashTarget.position.set(0, 0, -8);
    this.flash.position.set(0, 0, 0);
    this.spill.position.set(0, 0, 0);
    this.flash.target = this.flashTarget;
    this.spill.target = this.flashTarget;
    this.flash.visible = this.flashOn;
    this.spill.visible = this.flashOn;
  }

  busyHands() { return this._ammo().busy(); }

  muzzleWorld() {
    const m = this._model();
    const pos = new THREE.Vector3();
    m.muzzle.getWorldPosition(pos);
    m.muzzle.getWorldQuaternion(this._tmpQ);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this._tmpQ);
    return { pos, dir };
  }

  pickupShotgun() {
    this.hasShotgun = true;
    this._switchTo('shotgun');
  }

  _switchTo(name) {
    if (name === this.current || (name === 'shotgun' && !this.hasShotgun)) return;
    if (this._ammo().busy()) return;
    this.current = name;
    this.pistolModel.group.visible = name === 'pistol';
    this.shotgunModel.group.visible = name === 'shotgun';
    this.switchT = 0;
    this._reparentLight();
  }

  onPlayerDamaged() {
    this.pistol.onDamaged();
    this.shotgun.onDamaged();
    this.holdingBreath = false;
  }

  _firePistol() {
    const { ctx } = this;
    if (this.pistol.jammed) { ctx.audio.dryFire(); return; }
    if (!this.pistol.chambered) {
      ctx.audio.dryFire();
      if (this.pistol.slideLocked) ctx.ui.whisper('slide back. empty.');
      return;
    }
    if (!this.pistol.canFire() || this.refire > 0) return;
    this.pistol.fire();
    this.refire = CFG.pistol.refire;
    this._dischargeCommon('pistol');
    const { pos, dir } = this.muzzleWorld();
    this._bullet(pos, dir, CFG.pistol.damage);
    this.slideT = 1;
    this.recoilPitch += CFG.pistol.recoilPitch;
    this.recoilZ += 0.03;
    this.ctx.player.kickPitch(CFG.pistol.camKick);
  }

  _fireShotgun() {
    const { ctx } = this;
    if (!this.shotgun.canFire()) {
      if (this.shotgun.state === 'idle' && !this.shotgun.chambered) {
        ctx.audio.dryFire();
        if (this.shotgun.tube > 0) this.shotgun.needPump = true;
        else ctx.ui.whisper('tube dry.');
      }
      return;
    }
    this.shotgun.fire();
    this._dischargeCommon('shotgun');
    const { pos, dir } = this.muzzleWorld();
    // pellet pattern is real spread from the muzzle — the muzzle stays honest
    const spread = THREE.MathUtils.degToRad(CFG.shotgun.spreadDeg);
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const vert = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let i = 0; i < CFG.shotgun.pellets; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      const d = dir.clone()
        .addScaledVector(side, Math.cos(a) * r)
        .addScaledVector(vert, Math.sin(a) * r)
        .normalize();
      this._bullet(pos, d, CFG.shotgun.pelletDamage);
    }
    this.recoilPitch += CFG.shotgun.recoilPitch;
    this.recoilZ += 0.07;
    this.ctx.player.kickPitch(CFG.shotgun.camKick);
  }

  _dischargeCommon(kind) {
    const { ctx } = this;
    ctx.stats.shots++;
    ctx.audio.gunshot(kind, kind === 'pistol' ? this.pistol.dirt : 0);
    ctx.noise(ctx.player.pos, CFG.noiseRadius[kind]);
    const lit = ctx.level.litnessAt(ctx.player.pos);
    ctx.fx.exposureFlash(lit > 0.4 || this.flashOn ? 0.45 : 1.0);
    const m = this._model();
    m.flashMesh.material.opacity = 0.9;
    m.flashMesh.rotation.z = Math.random() * Math.PI;
    ctx.fx.muzzleLight(this.muzzleWorld().pos);
    ctx.fear.spike(0.025); // your own gunfire is loud in a quiet building
  }

  _bullet(pos, dir, dmg) {
    const { ctx } = this;
    this._ray.set(pos, dir);
    this._ray.far = 70;
    const targets = ctx.level.raycastList.concat(ctx.enemies.hitMeshes());
    const hits = this._ray.intersectObjects(targets, false);
    if (!hits.length) return;
    const h = hits[0];
    if (h.object.userData && h.object.userData.enemy) {
      ctx.stats.hits++;
      ctx.enemies.applyHit(h.object.userData, dmg, h.point, dir);
    } else {
      ctx.fx.impact(h.point, h.face ? h.face.normal : new THREE.Vector3(0, 1, 0));
    }
  }

  _kick() {
    const { ctx } = this;
    if (this.kickT > 0) return;
    this.kickT = 1;
    ctx.audio.kick();
    ctx.noise(ctx.player.pos, CFG.noiseRadius.kick);
    const fwd = ctx.player.forward();
    ctx.enemies.shove(ctx.player.pos, fwd);
  }

  update(dt, input, calm) {
    const { ctx } = this;
    const ammo = this._ammo();
    this.refire = Math.max(0, this.refire - dt);
    this.kickT = Math.max(0, this.kickT - dt * 2.2);

    // --- weapon switching
    if (input.pressed('Digit1')) this._switchTo('pistol');
    if (input.pressed('Digit2')) this._switchTo('shotgun');
    this.switchT = Math.min(1, this.switchT + dt * 3.2);

    // --- flashlight
    if (input.pressed('KeyT')) {
      this.flashOn = !this.flashOn;
      this.flash.visible = this.flashOn;
      this.spill.visible = this.flashOn;
      ctx.audio.uiTick();
    }

    // --- R gestures: tap = retention reload, double tap = speed reload,
    //     hold = press check. If jammed, R is tap-rack — control retained.
    const now = performance.now() / 1000;
    if (input.pressed('KeyR')) {
      this.rDownAt = now;
      this.pressCheckFired = false;
      if (this.current === 'pistol' && this.pistol.jammed) {
        this.pistol.clearJam();
        this.rDownAt = -1;
      } else if (this.current === 'shotgun') {
        if (!this.shotgun.chambered && this.shotgun.tube > 0) this.shotgun.needPump = true;
        this.rDownAt = -1;
      }
    }
    if (this.rDownAt > 0 && input.held('KeyR') && now - this.rDownAt > 0.45 && !this.pressCheckFired) {
      this.pressCheckFired = true;
      this.pendingTapReload = -1;
      if (this.current === 'pistol') this.pistol.pressCheck();
    }
    if (this.rDownAt > 0 && !input.held('KeyR')) {
      const heldFor = now - this.rDownAt;
      this.rDownAt = -1;
      if (heldFor <= 0.45 && !this.pressCheckFired && this.current === 'pistol') {
        if (now - this.rTapAt < 0.33) {
          this.pendingTapReload = -1;
          this._reload(false);
        } else {
          this.pendingTapReload = now + 0.33;
        }
        this.rTapAt = now;
      }
    }
    if (this.pendingTapReload > 0 && now >= this.pendingTapReload) {
      this.pendingTapReload = -1;
      this._reload(true);
    }

    // --- top off / feed shells (G), clean (M)
    if (input.held('KeyG')) {
      if (this.current === 'pistol') {
        if (!calm) { if (input.pressed('KeyG')) ctx.ui.whisper("not now. they're moving."); }
        else {
          const r = this.pistol.topOff(dt, ctx.belt);
          if (r === 'loaded') ctx.noise(ctx.player.pos, CFG.noiseRadius.loadClick);
          else if (r === 'noloose' && input.pressed('KeyG')) ctx.ui.whisper('no loose rounds.');
          else if (r === 'onlycurrent' && input.pressed('KeyG')) ctx.ui.whisper('only the mag in the gun is light — swap it out first.');
          else if (r === 'allfull' && input.pressed('KeyG')) ctx.ui.whisper('mags are fed.');
        }
      } else {
        const r = this.shotgun.insert(dt, ctx.belt, ctx.fear.value);
        if (r === 'loaded') ctx.noise(ctx.player.pos, CFG.noiseRadius.loadClick);
        else if (r === 'noshells' && input.pressed('KeyG')) ctx.ui.whisper('no shells.');
      }
    } else { this.pistol.releaseHold(); this.shotgun.releaseHold(); }

    if (input.held('KeyM') && this.current === 'pistol') {
      if (!ctx.belt.hasKit) { if (input.pressed('KeyM')) ctx.ui.whisper('nothing to strip it with. find a kit.'); }
      else if (!calm) { if (input.pressed('KeyM')) ctx.ui.whisper('too exposed to strip the gun.'); }
      else {
        const t = this.pistol.clean(dt);
        if (t === 1) ctx.ui.whisper('action runs clean again.');
      }
    } else if (this.pistol.state === 'cleaning') this.pistol.releaseHold();

    // --- kick
    if (input.pressed('KeyV')) this._kick();

    // --- ADS & breath
    const wantAds = input.mouseRDown && !ammo.busy() && this.switchT > 0.8;
    this.adsT += ((wantAds ? 1 : 0) - this.adsT) * Math.min(1, dt * 6.5);
    this.gaspRecover = Math.max(0, this.gaspRecover - dt);
    if (wantAds && input.held('Space') && this.gaspRecover <= 0) {
      this.holdingBreath = true;
      this.breathHeld += dt;
      if (this.breathHeld > CFG.sway.holdBreathMax) {
        this.holdingBreath = false;
        this.gaspRecover = CFG.sway.gaspRecover;
        this.breathHeld = 0;
        ctx.audio.gasp();
        ctx.fear.spike(0.08);
        ctx.noise(ctx.player.pos, CFG.noiseRadius.gasp);
      }
    } else {
      this.holdingBreath = false;
      if (!input.held('Space')) this.breathHeld = Math.max(0, this.breathHeld - dt * 1.5);
    }

    // --- trigger
    if (input.mouseJustDown && this.switchT > 0.8 && ctx.player.bandaging <= 0) {
      if (this.compress >= 0.6) {
        // the wall is in the gun's way — make the refusal audible and legible
        ctx.audio.dryFire();
        const t = performance.now() / 1000;
        if (!this._lastCompressNote || t - this._lastCompressNote > 4) {
          this._lastCompressNote = t;
          ctx.ui.whisper('muzzle against the wall — step back.');
        }
      } else if (this.current === 'pistol') this._firePistol();
      else this._fireShotgun();
    }

    ammo.update(dt); // only the weapon in hand cycles; a holstered gun waits

    // --- wall compression: tight spaces fight the gun
    this._ray.set(ctx.player.eye(), ctx.camera.getWorldDirection(new THREE.Vector3()));
    this._ray.far = 1.0;
    const wallHit = this._ray.intersectObjects(ctx.level.raycastList, false)[0];
    const compTarget = wallHit ? Math.max(0, (0.95 - wallHit.distance) / 0.95) : 0;
    this.compress += (compTarget - this.compress) * Math.min(1, dt * 8);

    this._pose(dt, input);
    this._visuals(dt);
  }

  _reload(retain) {
    const r = this.pistol.reload(retain, this.ctx.fear.value);
    if (r === 'nomags') {
      this.ctx.ui.whisper(this.ctx.belt.loose9 > 0 ? 'no fed mags — find quiet, top off (hold G).' : 'no mags, no loose. knife-fight territory.');
    }
  }

  _pose(dt, input) {
    const { ctx } = this;
    const P = POSES[this.current];
    const S = CFG.sway;
    const fear = ctx.fear.value;
    const ammo = this._ammo();
    const hint = ammo.poseHint();

    // base pose selection
    let target = P.hip;
    if (this.compress > 0.35) target = P.compress;
    else if (ammo.busy()) target = hint.state === 'presscheck' ? P.check : P.action;
    else if (ctx.player.running) target = P.low;
    else target = { // blend hip->ads
      p: P.hip.p.map((v, i) => v + (P.ads.p[i] - v) * this.adsT),
      r: P.hip.r.map((v, i) => v + (P.ads.r[i] - v) * this.adsT),
    };
    // switch raise
    const raise = this.switchT < 1 ? (1 - this.switchT) : 0;

    // --- sway: low-frequency, visible, compensable
    this.swayT += dt;
    let amp = S.baseAmp * (1 + fear * S.fearAmpMul);
    amp *= this.adsT > 0.5 ? S.adsMul : 1;
    if (ctx.player.crouched) amp *= S.crouchMul;
    if (this.holdingBreath) amp *= S.breathHoldMul;
    if (this.gaspRecover > 0) amp *= S.gaspPenalty;
    const speed = ctx.player.vel.length();
    amp *= 1 + speed * 0.40;
    const t = this.swayT;
    const swayYaw = amp * (1.1 * Math.sin(t * 2 * Math.PI * S.wanderHz) + 0.5 * Math.sin(t * 2 * Math.PI * 0.382));
    const breathAmp = S.breathAmp * (1 + fear * 1.6) * (this.holdingBreath ? 0.1 : 1);
    const swayPitch = amp * 0.8 * Math.sin(t * 2 * Math.PI * 0.311) + breathAmp * Math.sin(ctx.fear.breathPhase);

    // recoil springs back — it is physics you learn, not punishment
    this.recoilPitch *= Math.pow(0.0005, dt);
    this.recoilZ *= Math.pow(0.0005, dt);

    // action micro-motion from the state machines
    let actionDip = 0, actionRoll = 0;
    if (hint.state === 'reload_out') actionDip = Math.sin(hint.t * Math.PI) * 0.06;
    else if (hint.state === 'reload_in') { actionDip = 0.05 - hint.t * 0.05; actionRoll = 0.2 * (1 - hint.t); }
    else if (hint.state === 'clearing') actionRoll = 0.5 + 0.15 * Math.sin(hint.t * Math.PI * 4);
    else if (hint.state === 'slide') actionDip = 0.02;
    else if (hint.state === 'topoff' || hint.state === 'cleaning' || hint.state === 'insert') actionDip = 0.10;
    const kickDip = this.kickT > 0 ? Math.sin(this.kickT * Math.PI) * 0.08 : 0;

    const px = target.p[0] + swayYaw * 0.6;
    const py = target.p[1] - raise * 0.22 - actionDip - kickDip + swayPitch * 0.5;
    const pz = target.p[2] + this.recoilZ;
    const rx = target.r[0] + swayPitch + this.recoilPitch - raise * 0.5;
    const ry = target.r[1] + swayYaw;
    const rz = target.r[2] + actionRoll + ctx.player.lean * 0.06;

    const k = Math.min(1, dt * 11);
    this.curPos.x += (px - this.curPos.x) * k;
    this.curPos.y += (py - this.curPos.y) * k;
    this.curPos.z += (pz - this.curPos.z) * k;
    this.curRot.x += (rx - this.curRot.x) * k;
    this.curRot.y += (ry - this.curRot.y) * k;
    this.curRot.z += (rz - this.curRot.z) * k;
    this.root.position.copy(this.curPos);
    this.root.rotation.set(this.curRot.x, this.curRot.y, this.curRot.z);

    // deliberate ADS narrows the world a little
    const fov = 71 - 8 * this.adsT;
    if (Math.abs(ctx.camera.fov - fov) > 0.05) { ctx.camera.fov = fov; ctx.camera.updateProjectionMatrix(); }
  }

  _visuals(dt) {
    // pistol slide
    this.slideT = Math.max(0, this.slideT - dt * 9);
    const slide = this.pistolModel.slide;
    const lockBack = this.pistol.slideLocked || this.pistol.jammed ? 0.022 : 0;
    slide.position.z = -0.03 + this.slideT * 0.034 + lockBack;
    // shotgun pump
    const sg = this.shotgunModel;
    const hint = this.shotgun.poseHint();
    let pumpOff = 0;
    if (hint.state === 'pump') pumpOff = Math.sin(hint.t * Math.PI) * 0.075;
    sg.pump.position.z = sg.pumpBaseZ + pumpOff;
    // muzzle flash quads fade fast
    for (const m of [this.pistolModel, this.shotgunModel]) {
      if (m.flashMesh.material.opacity > 0) m.flashMesh.material.opacity = Math.max(0, m.flashMesh.material.opacity - dt * 14);
    }
  }
}
