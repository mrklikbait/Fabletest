import * as THREE from 'three';
import { CFG } from './config.js';

export class Player {
  constructor(camera, level, audio, hooks) {
    this.camera = camera;
    this.level = level;
    this.audio = audio;
    this.hooks = hooks; // { noise(pos, r), onDamaged(), onDeath() }
    const P = CFG.player;

    const s = level.cw(level.p.playerSpawn.x, level.p.playerSpawn.z);
    this.pos = new THREE.Vector3(s.x, 0, s.z);
    this.vel = new THREE.Vector3();
    this.yaw = 0; // facing north, into the block
    this.pitch = 0;
    this.pitchKick = 0;       // recoil-recoverable offset
    this.lean = 0;            // -1..1
    this.crouched = false;
    this.eyeY = CFG.eyeStand;
    this.hp = P.hp;
    this.dead = false;
    this.stepTimer = 0;
    this.moving = false;
    this.running = false;
    this.bandaging = 0;       // >0 while wrapping
    this.bandages = 0;
    this.limp = 0;
    this.camWorld = new THREE.Vector3();
  }

  eye() { return this.camWorld; }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt, input, mouse, busyHands) {
    const P = CFG.player;
    if (this.dead) return;

    // look
    const sens = 0.0021;
    this.yaw -= mouse.dx * sens;
    this.pitch -= mouse.dy * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    this.pitchKick *= Math.pow(0.0008, dt); // springs back — recoil recovers

    // stance
    if (input.pressed('KeyC')) this.crouched = !this.crouched;
    const eyeTarget = this.crouched ? CFG.eyeCrouch : CFG.eyeStand;
    this.eyeY += (eyeTarget - this.eyeY) * Math.min(1, dt * 9);

    // lean — blocked by walls so you can't put your head through brick
    let leanT = 0;
    if (input.held('KeyQ')) leanT = -1;
    else if (input.held('KeyE')) leanT = 1;
    if (leanT !== 0) {
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const probe = this.pos.clone().addScaledVector(right, leanT * (P.leanDist + 0.25));
      const cell = this.level.worldToCell(probe);
      if (this.level.isBlockedCell(cell.x, cell.z)) leanT *= 0.25;
    }
    this.lean += (leanT - this.lean) * Math.min(1, dt * 7);

    // move
    let ix = 0, iz = 0;
    if (input.held('KeyW')) iz -= 1;
    if (input.held('KeyS')) iz += 1;
    if (input.held('KeyA')) ix -= 1;
    if (input.held('KeyD')) ix += 1;
    const wish = new THREE.Vector3(ix, 0, iz);
    this.moving = wish.lengthSq() > 0 && this.bandaging <= 0;
    this.running = this.moving && input.held('ShiftLeft') && !this.crouched;
    let speed = this.running ? P.run : P.walk;
    if (this.crouched) speed *= P.crouchMul;
    if (busyHands) speed *= 0.6;
    if (this.hp < CFG.player.lowHp) speed *= 0.85;

    if (this.moving) {
      wish.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.vel.lerp(wish.multiplyScalar(speed), Math.min(1, dt * 8));
    } else {
      this.vel.lerp(new THREE.Vector3(), Math.min(1, dt * 10));
    }
    const next = this.level.moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, P.radius);
    this.pos.x = next.x; this.pos.z = next.z;

    // footsteps — your own noise is a resource you spend
    if (this.moving && this.vel.length() > 0.5) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = this.running ? P.stepRun : P.stepWalk;
        this.audio.playerStep(this.running, this.crouched);
        if (!this.crouched) {
          this.hooks.noise(this.pos, this.running ? CFG.noiseRadius.runStep : CFG.noiseRadius.walkStep);
        }
      }
    } else this.stepTimer = 0.05;

    // bandaging
    if (this.bandaging > 0) {
      this.bandaging -= dt;
      if (this.bandaging <= 0) {
        this.hp = Math.min(CFG.player.hp, this.hp + P.bandageHeal);
      }
    }

    // compose camera
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const bob = this.moving ? Math.sin(performance.now() / 1000 * (this.running ? 11 : 7)) * (this.running ? 0.035 : 0.016) : 0;
    this.camWorld.set(
      this.pos.x + right.x * this.lean * P.leanDist,
      this.eyeY + bob,
      this.pos.z + right.z * this.lean * P.leanDist,
    );
    this.camera.position.copy(this.camWorld);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.pitchKick;
    this.camera.rotation.z = -this.lean * P.leanRoll;
  }

  startBandage() {
    if (this.bandages <= 0 || this.bandaging > 0 || this.hp >= CFG.player.hp) return false;
    this.bandages--;
    this.bandaging = CFG.player.bandageTime;
    this.audio.bandageLoop(CFG.player.bandageTime);
    this.hooks.noise(this.pos, CFG.noiseRadius.bandage);
    return true;
  }

  damage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    this.bandaging = 0; // a hit tears the wrap off — the gauze is already spent
    this.audio.hitThud(amount > 25);
    this.hooks.onDamaged(amount);
    if (this.hp <= 0) {
      this.dead = true;
      this.hooks.onDeath();
    }
  }

  kickPitch(amount) { this.pitchKick += amount; }
}
