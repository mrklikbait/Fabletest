import * as THREE from 'three';
import { CFG } from './config.js';
import { MAP, parseMap } from './map.js';
import { Level } from './level.js';
import { Input } from './input.js';
import { Fear } from './fear.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { Subjects } from './enemies.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { AudioMan } from './audio.js';

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.domElement.tabIndex = -1; // focusable, so keystrokes always land on the page
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(71, innerWidth / innerHeight, 0.05, 80);
    this.scene.add(this.camera);

    this.ui = new UI();
    this.input = new Input();
    this.audio = new AudioMan();
    this.state = 'title';
    this.built = false;

    this.ui.showStart(() => this.begin());

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      this.input.enabled = locked;
      if (!locked && this.state === 'play') {
        this.state = 'pause';
        this.audio.suspend();
        this.ui.showPause(() => this.lock());
      } else if (locked && this.state === 'pause') {
        this.state = 'play';
        this.audio.resume();
        this.ui.hide();
      }
    });

    this.last = performance.now();
    requestAnimationFrame(() => this.loop());
    window.__game = this; // debug/test handle
  }

  lock() {
    this.renderer.domElement.focus();
    this.renderer.domElement.requestPointerLock();
  }

  begin() {
    this.audio.init();
    const parsed = parseMap(MAP);
    this.level = new Level(this.scene, parsed, this.audio);
    this.fear = new Fear();
    this.fx = new FX(this.renderer, this.scene, this.camera);
    this.belt = { loose9: 14, shells: 0, hasKit: false, hasKey: false };
    this.stats = { shots: 0, hits: 0, kills: 0, t0: performance.now() };

    const noise = (pos, r) => { if (this.enemies) this.enemies.hear(pos, r); };
    const uiFacade = {
      whisper: (t, d) => this.ui.whisper(t, d),
      prompt: (t) => this.ui.prompt(t),
      event: (n) => this.ui.event(n),
    };

    this.showKeys = true; // input monitor starts visible; I toggles it
    this.player = new Player(this.camera, this.level, this.audio, {
      noise,
      onBandaged: () => this.ui.whisper("dressed. it'll hold."),
      onDamaged: () => {
        this.weapons.onPlayerDamaged();
        this.fear.spike(CFG.fear.spikeDamage);
        this.fx.damageFlash();
        if (this.player.hp > 0 && this.player.hp < CFG.player.lowHp) this.ui.event('hurt');
      },
      onDeath: () => this.die(),
    });

    const ctx = {
      camera: this.camera, scene: this.scene, level: this.level, audio: this.audio,
      fear: this.fear, fx: this.fx, ui: uiFacade, belt: this.belt, stats: this.stats,
      player: this.player, noise,
    };
    this.weapons = new WeaponSystem(ctx);
    ctx.weapons = this.weapons;
    this.enemies = new Subjects(ctx);
    ctx.enemies = this.enemies;
    this.enemies.spawnAll(parsed.enemies);

    this.built = true;
    this.state = 'play';
    this.ui.hide();
    this.lock();
    setTimeout(() => this.ui.event('open'), 1200);
  }

  die() {
    if (this.state !== 'play') return;
    this.state = 'dying';
    this.fx.fadeOut(0x180202);
    this.ui.prompt('');
    setTimeout(() => {
      document.exitPointerLock();
      this.ui.showDead(this.stats, () => location.reload());
    }, 1600);
  }

  win() {
    if (this.state !== 'play') return;
    this.state = 'won';
    this.fx.fadeOut(0x0a0c10);
    this.ui.prompt('');
    setTimeout(() => {
      document.exitPointerLock();
      this.ui.showWin(this.stats, () => location.reload());
    }, 1800);
  }

  // one interaction target per frame, picked by where you are looking
  scanInteract() {
    const eye = this.player.eye();
    const dir = this.camera.getWorldDirection(new THREE.Vector3());

    // a stoppage owns the prompt line until it is cleared
    if (this.weapons.current === 'pistol' && this.weapons.pistol.jammed) {
      return { prompt: 'R — rack it', act: null };
    }

    // items
    let best = null, bestScore = 1e9;
    for (const it of this.level.items) {
      if (it.taken) continue;
      const v = it.pos.clone().sub(eye);
      const d = v.length();
      if (d > 2.0) continue;
      const along = v.dot(dir);
      if (along < 0) continue;
      const perp = v.sub(dir.clone().multiplyScalar(along)).length();
      if (perp > 0.6) continue;
      const score = perp + d * 0.15;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    if (best) {
      return {
        prompt: `F — ${best.label}`,
        act: () => this.pickup(best),
      };
    }

    // doors
    const ray = new THREE.Raycaster(eye, dir, 0, 2.4);
    const doorHit = ray.intersectObjects(this.level.doors.map((d) => d.panel), false)[0];
    if (doorHit) {
      const door = doorHit.object.userData.ref;
      return {
        prompt: door.openT > 0.5 ? 'F — pull the door shut' : 'F — open slow',
        act: () => {
          this.level.toggleDoor(door, true);
          if (this.enemies) this.enemies.hear(door.pos, CFG.noiseRadius.doorCreak);
        },
      };
    }

    // the chained exit
    if (this.level.exitPos && eye.distanceTo(this.level.exitPos) < 2.4) {
      if (this.level.exitState === 'chained') {
        if (this.belt.hasKey) return { prompt: 'F — unlock the chain', act: () => this.level.beginUnlock() };
        return { prompt: 'chained shut. it wants the fire-exit key.', act: null };
      }
      if (this.level.exitState === 'unlocking') return { prompt: 'working the lock…', act: null };
    }
    return null;
  }

  pickup(item) {
    const b = this.belt;
    switch (item.type) {
      case 'a': b.loose9 += 9; this.audio.loadRound(); this.ui.whisper('loose 9mm.'); break;
      case 'm': {
        const mag = item.payload || { r: 8, cap: CFG.pistol.magCap };
        this.weapons.pistol.spare.push(mag);
        this.audio.magIn(false);
        this.ui.whisper(item.payload ? 'your mag, back off the floor.' : 'a spare mag, part-fed.');
        break;
      }
      case 's': b.shells += 4; this.audio.shellInsert(); this.ui.whisper('shells.'); break;
      case 'S': this.weapons.pickupShotgun(); b.shells += 3; this.ui.event('shotgun'); break;
      case 'B': this.player.bandages++; this.ui.whisper('field dressing.'); break;
      case 'k': b.hasKit = true; this.ui.whisper('bore brush and oil.'); break;
      case 'K': b.hasKey = true; this.ui.event('key'); break;
    }
    this.level.removeItem(item);
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    this.ui.update(dt);
    if (!this.built) { this.input.endFrame(); return; }

    const mouse = this.input.mouseDelta();
    const playing = this.state === 'play';

    if (playing) {
      const stim = this.enemies.getStimulus();
      stim.inDarkness = !this.weapons.flashOn && this.level.litnessAt(this.player.pos) < 0.4;
      stim.holdBreath = this.weapons.holdingBreath;
      const calm = stim.huntingCount === 0;

      this.player.update(dt, this.input, mouse, this.weapons.busyHands());
      this.weapons.update(dt, this.input, calm);
      this.fear.update(dt, stim);

      // bandage — say why when it refuses, say so when it starts
      if (this.input.pressed('KeyX')) {
        if (this.player.bandaging > 0) { /* already wrapping */ }
        else if (this.player.bandages <= 0) this.ui.whisper('nothing left to wrap with.');
        else if (this.player.hp >= CFG.player.hp) this.ui.whisper('not bleeding. save it.');
        else if (this.player.startBandage()) this.ui.whisper('wrapping — stay still.');
      }

      // input monitor (I to toggle)
      if (this.input.pressed('KeyI')) this.showKeys = !this.showKeys;
      if (this.showKeys) {
        const i = this.input;
        const last = i.lastKeyEvent ? `code "${i.lastKeyEvent.code}" key "${i.lastKeyEvent.key}" -> ${i.lastKeyEvent.used}` : '—';
        this.ui.setKeys(
          `held: ${[...i.keys].join(' ') || '—'}\n` +
          `LMB ${i.mouseDown ? 'DOWN' : '—'}   RMB ${i.mouseRDown ? 'DOWN' : '—'}\n` +
          `last key: ${last}   [I hides this]`,
        );
      } else this.ui.setKeys('');

      // interactions
      const inter = this.scanInteract();
      this.ui.prompt(inter ? inter.prompt : '');
      if (inter && inter.act && this.input.pressed('KeyF')) inter.act();

      // tutorial-ish one-shots
      if (this.stats.kills > 0) this.ui.event('firstkill');
      if (this.weapons.pistol.dirt > 0.6) this.ui.event('dirty');
      const totalRounds = this.belt.loose9 + this.weapons.pistol.totalSpareRounds() + (this.weapons.pistol.mag ? this.weapons.pistol.mag.r : 0);
      if (totalRounds < 8) this.ui.event('dry');

      // exit
      if (this.level.exitState === 'open') {
        const c = this.level.worldToCell(this.player.pos);
        if (this.level.p.kind[c.z] && this.level.p.kind[c.z][c.x] === 'X') this.win();
      }
    }

    if (this.state !== 'pause') {
      this.enemies.update(this.state === 'play' ? dt : dt * 0.2);
      this.level.update(dt, now / 1000);

      const fwd = this.camera.getWorldDirection(new THREE.Vector3());
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.audio.setListener(this.player.eye(), fwd, up);
      this.audio.update(dt, this.fear.value, this.fear.breathPhase, this.weapons.holdingBreath);

      this.fx.update(dt, this.fear.value, this.audio.beatPhase01 || 0);
      this.fx.render();
    }

    this.input.endFrame(); // taps survive the whole frame, then clear
  }
}

new Game();
