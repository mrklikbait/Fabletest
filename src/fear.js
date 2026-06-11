import { CFG } from './config.js';

// Fear is a scalar the world writes to and the gun reads from.
// It never randomizes input — it widens sway, quickens breath and heart,
// and adds visible beats to actions. Control stays yours; it just costs more.
export class Fear {
  constructor() {
    this.value = 0.12;
    this.breathPhase = 0; // sin(phase) > 0 == exhaling/audible; shoot in the gaps
    this.breathRate = 0.22;
  }

  spike(x) { this.value = Math.min(1, this.value + x); }

  update(dt, stim) {
    const f = CFG.fear;
    let target = 0.08;
    if (stim.huntingCount > 0) target = Math.max(target, 0.45 + 0.1 * Math.min(3, stim.huntingCount));
    if (stim.nearestVisible < Infinity) {
      const close = Math.max(0, 1 - stim.nearestVisible / 12);
      target = Math.max(target, 0.35 + close * 0.6);
    }
    if (stim.inDarkness && stim.threatsAlive) this.value = Math.min(1, this.value + f.darkGain * dt);
    if (this.value < target) this.value = Math.min(target, this.value + dt * 0.9);
    else this.value = Math.max(target * 0.4, this.value - f.decay * dt);
    this.value = Math.max(0, Math.min(1, this.value));

    this.breathRate = 0.20 + this.value * 0.26;
    if (!stim.holdBreath) this.breathPhase += dt * Math.PI * 2 * this.breathRate;
  }
}
