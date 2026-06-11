import { CFG } from './config.js';

// Magazines are physical objects. There is no ammo counter anywhere in the
// game — information comes through hands: press checks, weight buckets,
// the slide locking back. Failures are rule-driven, never dice-driven:
// a filthy gun warns you with grit before it stops, a hit mid-insert
// drops the magazine. Time is the currency; control is never confiscated.

export function magBucket(mag) {
  if (!mag) return 'no magazine';
  if (mag.r === 0) return 'empty';
  if (mag.r <= 3) return 'a few left';
  if (mag.r < mag.cap * 0.6) return 'feels about half';
  if (mag.r < mag.cap) return 'heavy — nearly full';
  return 'full';
}

export class PistolAmmo {
  constructor(audio, hooks) {
    const C = CFG.pistol;
    this.audio = audio;
    this.hooks = hooks; // { dropMag(mag), report(text), onJam() }
    this.cap = C.magCap;
    this.mag = { r: 7, cap: this.cap };          // a night of fighting already behind you
    this.spare = [{ r: 12, cap: this.cap }, { r: 5, cap: this.cap }];
    this.chambered = true;
    this.slideLocked = false;
    this.jammed = false;
    this.dirt = C.dirtStart;
    this.jamShots = 0;
    this.state = 'idle';
    this.t = 0;
    this.dur = 0;
    this.pendingMag = null;
    this.retain = true;
    this.fumbled = false;
    this.holdProgress = 0;
  }

  busy() { return this.state !== 'idle'; }

  canFire() { return this.state === 'idle' && this.chambered && !this.jammed; }

  fire() {
    const C = CFG.pistol;
    this.chambered = false;
    this.dirt = Math.min(1, this.dirt + C.dirtPerShot);
    if (this.dirt > C.dirtJamZone) this.jamShots++;
    if (this.jamShots > 3) {
      // failure to eject: the shot went out, the action did not come back clean
      this.jammed = true;
      this.jamShots = 0;
      this.audio.jamGrind();
      this.hooks.onJam();
      return;
    }
    if (this.mag && this.mag.r > 0) { this.mag.r--; this.chambered = true; }
    else this.slideLocked = true;
  }

  totalSpareRounds() { return this.spare.reduce((a, m) => a + m.r, 0); }

  reload(retain, fear) {
    if (this.state !== 'idle') return null;
    const best = this.spare.reduce((b, m, i) => (m.r > (b < 0 ? -1 : this.spare[b].r) ? i : b), -1);
    if (best < 0 || this.spare[best].r === 0) return 'nomags';
    this.retain = retain;
    this.fumbled = fear > CFG.fear.fumbleThreshold;
    this.state = 'reload_out';
    this.t = 0;
    this.dur = retain ? 0.7 : 0.35;
    this._nextMagIdx = best;
    return 'ok';
  }

  clearJam() {
    if (this.state !== 'idle' || !this.jammed) return false;
    this.state = 'clearing';
    this.t = 0; this.dur = CFG.pistol.jamClear;
    this._tapPlayed = this._rackPlayed = false;
    return true;
  }

  pressCheck() {
    if (this.state !== 'idle') return false;
    this.state = 'presscheck';
    this.t = 0; this.dur = CFG.pistol.pressCheck;
    this.audio.pressCheck();
    return true;
  }

  // hold-to-feed loose rounds into the emptiest pocketed magazine
  topOff(dt, belt) {
    if (this.state !== 'idle' && this.state !== 'topoff') return 'busy';
    const target = this.spare.filter((m) => m.r < m.cap).sort((a, b) => a.r - b.r)[0];
    if (!target) {
      return (this.mag && this.mag.r < this.mag.cap) ? 'onlycurrent' : 'allfull';
    }
    if (belt.loose9 <= 0) return 'noloose';
    this.state = 'topoff';
    this.holdProgress += dt;
    if (this.holdProgress >= CFG.pistol.topOffPerRound) {
      this.holdProgress = 0;
      target.r++;
      belt.loose9--;
      this.audio.loadRound();
      return 'loaded';
    }
    return 'loading';
  }

  clean(dt) {
    if (this.state !== 'idle' && this.state !== 'cleaning') return 0;
    this.state = 'cleaning';
    this.holdProgress += dt;
    const t = this.holdProgress / CFG.pistol.cleanTime;
    if (this.holdProgress >= CFG.pistol.cleanTime) {
      this.dirt = 0.05;
      this.jamShots = 0;
      this.holdProgress = 0;
      this.state = 'idle';
      return 1;
    }
    if (Math.floor(this.holdProgress * 3) !== Math.floor((this.holdProgress - dt) * 3)) this.audio.loadRound();
    return t;
  }

  releaseHold() {
    if (this.state === 'topoff' || this.state === 'cleaning') {
      this.state = 'idle';
      this.holdProgress = 0;
    }
  }

  onDamaged() {
    if (this.state === 'reload_in' && this.pendingMag) {
      this.hooks.dropMag(this.pendingMag); // it was in your hand; now it's on the floor
      this.pendingMag = null;
      this.state = 'idle';
    } else if (this.state !== 'idle') {
      if (this.state === 'reload_out') {
        // mag already pocketed or dropped by phase end; mid-phase nothing committed
      }
      this.state = 'idle';
      this.holdProgress = 0;
    }
  }

  update(dt) {
    if (this.state === 'idle' || this.state === 'topoff' || this.state === 'cleaning') return;
    this.t += dt;
    const C = CFG.pistol;
    if (this.state === 'reload_out' && this.t >= this.dur) {
      if (this.mag) {
        if (this.retain) this.spare.push(this.mag);
        else this.hooks.dropMag(this.mag);
      }
      this.audio.magOut();
      this.mag = null;
      this.pendingMag = this.spare.splice(this._nextMagIdx, 1)[0] ||
        this.spare.sort((a, b) => b.r - a.r).shift();
      this.state = 'reload_in';
      this.t = 0;
      this.dur = (this.retain ? 1.2 : 0.75) + (this.fumbled ? C.fumbleExtra : 0);
    } else if (this.state === 'reload_in' && this.t >= this.dur) {
      this.audio.magIn(this.fumbled);
      this.mag = this.pendingMag;
      this.pendingMag = null;
      if (!this.chambered) {
        this.state = 'slide'; this.t = 0; this.dur = C.slideRelease;
      } else { this.state = 'idle'; }
    } else if (this.state === 'slide' && this.t >= this.dur) {
      this.audio.slideRack();
      if (this.mag && this.mag.r > 0) { this.mag.r--; this.chambered = true; this.slideLocked = false; }
      this.state = 'idle';
    } else if (this.state === 'clearing') {
      if (!this._tapPlayed && this.t > 0.25) { this.audio.magIn(false); this._tapPlayed = true; }
      if (!this._rackPlayed && this.t > 0.8) { this.audio.slideRack(); this._rackPlayed = true; }
      if (this.t >= this.dur) {
        this.jammed = false;
        this.dirt = CFG.pistol.dirtAfterJam; // cleared, not cleaned — it will warn again
        if (this.mag && this.mag.r > 0) { this.mag.r--; this.chambered = true; }
        this.state = 'idle';
      }
    } else if (this.state === 'presscheck' && this.t >= this.dur) {
      const chamber = this.jammed ? 'stoppage in the pipe' : (this.chambered ? 'one in the pipe' : 'chamber empty');
      this.hooks.report(`${chamber} — mag ${magBucket(this.mag)}`);
      this.state = 'idle';
    }
  }

  poseHint() { return { state: this.state, t: this.dur ? Math.min(1, this.t / this.dur) : 0 }; }
}

export class ShotgunAmmo {
  constructor(audio) {
    const C = CFG.shotgun;
    this.audio = audio;
    this.cap = C.tubeCap;
    this.tube = 2;            // found with two left in the tube
    this.chambered = false;   // Reyes never got to rack it
    this.needPump = false;
    this.state = 'idle';
    this.t = 0; this.dur = 0;
    this.holdProgress = 0;
  }

  busy() { return this.state !== 'idle'; }
  canFire() { return this.state === 'idle' && this.chambered; }

  fire() {
    this.chambered = false;
    this.needPump = true;
  }

  requestPump() {
    if (this.state !== 'idle') return;
    this.state = 'pump'; this.t = 0; this.dur = CFG.shotgun.pumpTime;
    this.audio.pump();
  }

  // hold-to-insert; the whole point of a tube gun is you can stop any time
  insert(dt, belt, fear) {
    if (this.state === 'pump') return 'busy';
    if (this.tube >= this.cap) return 'full';
    if (belt.shells <= 0) return 'noshells';
    this.state = 'insert';
    this.holdProgress += dt;
    const per = CFG.shotgun.insertTime + (fear > CFG.fear.fumbleThreshold ? 0.35 : 0);
    if (this.holdProgress >= per) {
      this.holdProgress = 0;
      this.tube++;
      belt.shells--;
      this.audio.shellInsert();
      return 'loaded';
    }
    return 'loading';
  }

  releaseHold() {
    if (this.state === 'insert') { this.state = 'idle'; this.holdProgress = 0; }
    if (!this.chambered && this.tube > 0) this.needPump = true;
  }

  onDamaged() {
    if (this.state === 'insert') { this.state = 'idle'; this.holdProgress = 0; }
  }

  update(dt) {
    if (this.state === 'pump') {
      this.t += dt;
      if (this.t >= this.dur) {
        if (this.tube > 0) { this.tube--; this.chambered = true; }
        this.needPump = false;
        this.state = 'idle';
      }
      return;
    }
    if (this.needPump && this.state === 'idle') this.requestPump();
  }

  poseHint() { return { state: this.state, t: this.dur ? Math.min(1, this.t / this.dur) : 0 }; }
}
