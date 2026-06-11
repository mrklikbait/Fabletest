// All sound is synthesized at runtime — no audio assets.
// Audio is information, not just mood: breathing telegraphs sway phase,
// grit telegraphs the coming stoppage, moans give positional data.

function lerp(a, b, t) { return a + (b - a) * t; }

export class AudioMan {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.fear = 0;
    this.beatTimer = 0.4;
    this.breathNodes = null;
    this.voices = [];
  }

  init() {
    if (this.started) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 6;
    this.comp.release.value = 0.28;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    // Room: feedback delay for tails on loud transients.
    this.room = ctx.createGain();
    const d1 = ctx.createDelay(1.0); d1.delayTime.value = 0.143;
    const d2 = ctx.createDelay(1.0); d2.delayTime.value = 0.211;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 900;
    this.room.connect(d1); d1.connect(damp); damp.connect(fb);
    fb.connect(d1); damp.connect(d2);
    const roomOut = ctx.createGain(); roomOut.gain.value = 0.5;
    d1.connect(roomOut); d2.connect(roomOut);
    roomOut.connect(this.master);

    // Shared noise buffer.
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;

    this._startAmbience();
    this._startBreath();
    this.started = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

  setListener(pos, fwd, up) {
    if (!this.started) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02);
      l.upY.setTargetAtTime(up.y, t, 0.02);
      l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  makePanner(pos) {
    const p = new PannerNode(this.ctx, {
      panningModel: 'HRTF', distanceModel: 'inverse',
      refDistance: 1.8, maxDistance: 70, rolloffFactor: 1.25,
    });
    this.movePanner(p, pos);
    p.connect(this.master);
    return p;
  }

  movePanner(p, pos) {
    const t = this.ctx.currentTime;
    if (p.positionX) {
      p.positionX.setTargetAtTime(pos.x, t, 0.03);
      p.positionY.setTargetAtTime(pos.y, t, 0.03);
      p.positionZ.setTargetAtTime(pos.z, t, 0.03);
    } else p.setPosition(pos.x, pos.y, pos.z);
  }

  // ---- primitives ----------------------------------------------------

  _noise(dest, { t0, dur, gain = 0.5, lp = 20000, hp = 0, a = 0.002, rate = 1 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = rate;
    let node = src;
    if (lp < 20000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    if (hp > 0) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g); g.connect(dest);
    src.start(t0); src.stop(t0 + dur + 0.05);
    return g;
  }

  _tone(dest, { t0, dur, f0, f1 = null, type = 'sine', gain = 0.4, a = 0.003 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return g;
  }

  _click(dest, t0, { pitch = 2400, gain = 0.3, dur = 0.025 } = {}) {
    this._noise(dest, { t0, dur, gain, hp: pitch * 0.5, lp: pitch * 3, a: 0.001 });
  }

  // ---- weapons -------------------------------------------------------

  gunshot(kind = 'pistol', dirt = 0) {
    if (!this.started) return;
    const t0 = this.ctx.currentTime;
    const big = kind === 'shotgun';
    // crack
    this._noise(this.master, { t0, dur: big ? 0.16 : 0.09, gain: big ? 0.95 : 0.8, lp: big ? 2400 : 3400, hp: 300, a: 0.001 });
    // body
    this._noise(this.room, { t0, dur: big ? 0.30 : 0.16, gain: big ? 0.8 : 0.55, lp: 1200, a: 0.001 });
    // sub thump
    this._tone(this.master, { t0, dur: big ? 0.22 : 0.13, f0: big ? 95 : 120, f1: 40, type: 'sine', gain: big ? 0.9 : 0.6 });
    // mechanical cycle (slide / action)
    if (!big) {
      this._click(this.master, t0 + 0.045, { pitch: 3000, gain: 0.18 });
      this._click(this.master, t0 + 0.085, { pitch: 2200, gain: 0.14 });
      if (dirt > 0.5) { // the gun tells you before it betrays you
        const g = Math.min(0.3, (dirt - 0.5) * 0.8);
        this._noise(this.master, { t0: t0 + 0.05, dur: 0.09, gain: g, hp: 1800, lp: 6000, rate: 0.6 });
      }
    }
  }

  dryFire() { if (this.started) this._click(this.master, this.ctx.currentTime, { pitch: 2800, gain: 0.35, dur: 0.03 }); }
  jamGrind() {
    if (!this.started) return; const t0 = this.ctx.currentTime;
    this._noise(this.master, { t0, dur: 0.22, gain: 0.4, hp: 900, lp: 4000, rate: 0.45 });
    this._click(this.master, t0 + 0.02, { pitch: 1400, gain: 0.3 });
  }
  magOut() { if (this.started) { const t = this.ctx.currentTime; this._click(this.master, t, { pitch: 1600, gain: 0.3 }); this._click(this.master, t + 0.05, { pitch: 900, gain: 0.2, dur: 0.04 }); } }
  magIn(fumble = false) {
    if (!this.started) return; const t = this.ctx.currentTime;
    if (fumble) { this._click(this.master, t, { pitch: 1100, gain: 0.18 }); this._click(this.master, t + 0.22, { pitch: 700, gain: 0.12, dur: 0.05 }); }
    this._click(this.master, t + (fumble ? 0.5 : 0), { pitch: 1300, gain: 0.42, dur: 0.04 });
  }
  slideRack() {
    if (!this.started) return; const t = this.ctx.currentTime;
    this._click(this.master, t, { pitch: 2000, gain: 0.35 });
    this._click(this.master, t + 0.09, { pitch: 1500, gain: 0.45, dur: 0.04 });
  }
  pressCheck() {
    if (!this.started) return; const t = this.ctx.currentTime;
    this._click(this.master, t, { pitch: 1900, gain: 0.2 });
    this._click(this.master, t + 0.3, { pitch: 1600, gain: 0.25 });
  }
  magDropFloor() { if (this.started) { const t = this.ctx.currentTime; this._click(this.master, t, { pitch: 800, gain: 0.3, dur: 0.05 }); this._click(this.master, t + 0.12, { pitch: 1000, gain: 0.18, dur: 0.04 }); } }
  loadRound() { if (this.started) this._click(this.master, this.ctx.currentTime, { pitch: 2100, gain: 0.28, dur: 0.03 }); }
  shellInsert() { if (this.started) { const t = this.ctx.currentTime; this._click(this.master, t, { pitch: 1100, gain: 0.3, dur: 0.045 }); this._click(this.master, t + 0.07, { pitch: 1800, gain: 0.2 }); } }
  pump() {
    if (!this.started) return; const t = this.ctx.currentTime;
    this._click(this.master, t, { pitch: 1200, gain: 0.4, dur: 0.05 });
    this._noise(this.master, { t0: t + 0.02, dur: 0.1, gain: 0.15, hp: 700, lp: 3000 });
    this._click(this.master, t + 0.28, { pitch: 1500, gain: 0.45, dur: 0.05 });
  }
  kick() { if (this.started) { const t = this.ctx.currentTime; this._noise(this.master, { t0: t, dur: 0.12, gain: 0.3, lp: 700 }); this._tone(this.master, { t0: t, dur: 0.1, f0: 90, f1: 50, gain: 0.4 }); } }

  // ---- body ----------------------------------------------------------

  update(dt, fear, breathPhase, holdingBreath) {
    if (!this.started) return;
    this.fear = fear;
    // heartbeat
    const audible = fear > 0.30;
    this.beatTimer -= dt;
    if (this.beatTimer <= 0) {
      const bpm = 52 + 88 * fear;
      this.beatTimer = 60 / bpm;
      this.beatDur = this.beatTimer;
      if (audible) {
        const g = 0.10 + 0.4 * fear;
        const t = this.ctx.currentTime;
        this._tone(this.master, { t0: t, dur: 0.09, f0: 58, f1: 40, gain: g });
        this._tone(this.master, { t0: t + 0.16, dur: 0.08, f0: 48, f1: 36, gain: g * 0.7 });
      }
    }
    this.beatPhase01 = this.beatDur ? 1 - this.beatTimer / this.beatDur : 0;
    // breath loudness follows phase: exhale gaps are your shooting windows
    if (this.breathNodes) {
      const base = holdingBreath ? 0.0 : (0.015 + 0.10 * fear);
      const v = base * Math.max(0, Math.sin(breathPhase));
      this.breathNodes.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.06);
    }
  }

  _startBreath() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = 0.7;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.breathNodes = { gain: g };
  }

  gasp() {
    if (!this.started) return; const t = this.ctx.currentTime;
    this._noise(this.master, { t0: t, dur: 0.35, gain: 0.4, hp: 400, lp: 2500, a: 0.05, rate: 1.3 });
  }

  hitThud(heavy = false) {
    if (!this.started) return; const t = this.ctx.currentTime;
    this._tone(this.master, { t0: t, dur: 0.18, f0: 110, f1: 45, gain: 0.7 });
    this._noise(this.master, { t0: t, dur: 0.12, gain: 0.4, lp: 900 });
    if (heavy) this._tone(this.master, { t0: t + 0.05, dur: 1.6, f0: 3200, type: 'sine', gain: 0.06, a: 0.01 });
  }

  bandageLoop(dur) {
    if (!this.started) return; const t = this.ctx.currentTime;
    for (let i = 0; i < Math.floor(dur / 0.5); i++)
      this._noise(this.master, { t0: t + i * 0.5 + Math.random() * 0.1, dur: 0.3, gain: 0.12, hp: 1200, lp: 5000, a: 0.08 });
  }

  playerStep(running, crouched) {
    if (!this.started || crouched) return;
    const t = this.ctx.currentTime;
    this._noise(this.master, { t0: t, dur: 0.07, gain: running ? 0.22 : 0.10, lp: 500, a: 0.004 });
    this._click(this.master, t, { pitch: 500, gain: running ? 0.10 : 0.05, dur: 0.03 });
  }

  // ---- world ---------------------------------------------------------

  doorCreak(pos, speed = 1) {
    if (!this.started) return;
    const p = this.makePanner(pos);
    const t = this.ctx.currentTime, dur = 0.9 / speed;
    this._tone(p, { t0: t, dur, f0: 280 + Math.random() * 120, f1: 180, type: 'sawtooth', gain: 0.12, a: 0.1 });
    this._noise(p, { t0: t, dur, gain: 0.06, hp: 600, lp: 2400, a: 0.1, rate: 0.5 });
    setTimeout(() => p.disconnect(), (dur + 0.3) * 1000);
  }

  doorBash(pos) {
    if (!this.started) return;
    const p = this.makePanner(pos);
    const t = this.ctx.currentTime;
    this._tone(p, { t0: t, dur: 0.16, f0: 120, f1: 50, gain: 1.0 });
    this._noise(p, { t0: t, dur: 0.2, gain: 0.7, lp: 1400 });
    setTimeout(() => p.disconnect(), 600);
  }

  doorBurst(pos) {
    if (!this.started) return;
    const p = this.makePanner(pos);
    const t = this.ctx.currentTime;
    this._tone(p, { t0: t, dur: 0.3, f0: 100, f1: 35, gain: 1.0 });
    this._noise(p, { t0: t, dur: 0.4, gain: 0.8, lp: 2000 });
    setTimeout(() => p.disconnect(), 900);
  }

  uiTick() { if (this.started) this._click(this.master, this.ctx.currentTime, { pitch: 3200, gain: 0.05, dur: 0.02 }); }
  unlockChain() {
    if (!this.started) return; const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) this._click(this.master, t + i * 0.45 + Math.random() * 0.1, { pitch: 2400 + Math.random() * 800, gain: 0.2, dur: 0.04 });
    this._click(this.master, t + 2.8, { pitch: 600, gain: 0.4, dur: 0.08 });
  }

  _startAmbience() {
    const ctx = this.ctx;
    // low building rumble
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = 0.3;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 110;
    const g = ctx.createGain(); g.gain.value = 0.16;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    // wind through gaps
    const w = ctx.createBufferSource(); w.buffer = this.noiseBuf; w.loop = true; w.playbackRate.value = 0.9;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 800; wf.Q.value = 4;
    const wg = ctx.createGain(); wg.gain.value = 0.012;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.01;
    lfo.connect(lg); lg.connect(wg.gain);
    w.connect(wf); wf.connect(wg); wg.connect(this.master);
    w.start(); lfo.start();
    // random distant knocks / drips
    const sched = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 4 + Math.random() * 9;
      const pick = Math.random();
      if (pick < 0.5) this._click(this.room, t, { pitch: 2600 + Math.random() * 2000, gain: 0.10, dur: 0.03 });        // drip
      else if (pick < 0.8) this._tone(this.room, { t0: t, dur: 0.3, f0: 70 + Math.random() * 60, f1: 40, gain: 0.18 }); // settle/knock
      else this._tone(this.room, { t0: t, dur: 1.2, f0: 200 + Math.random() * 150, f1: 140, type: 'sawtooth', gain: 0.025, a: 0.4 }); // far creak
      setTimeout(sched, (t - this.ctx.currentTime) * 1000 + 100);
    };
    sched();
  }

  lightBuzz(pos) {
    // returns a control: set(on)
    const p = this.makePanner(pos);
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 118;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.5;
    const g = this.ctx.createGain(); g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(p);
    o.start();
    return { set: (on) => g.gain.setTargetAtTime(on ? 0.025 : 0, this.ctx.currentTime, 0.01) };
  }

  // ---- enemy voice ---------------------------------------------------

  createVoice(pos) {
    const ctx = this.ctx;
    const p = this.makePanner(pos);
    const base = 70 + Math.random() * 50;
    const voice = {
      panner: p,
      setPos: (v) => this.movePanner(p, v),
      moan: () => {
        const t = ctx.currentTime, dur = 1.4 + Math.random() * 1.2;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), t);
        o.frequency.linearRampToValueAtTime(base * 0.7, t + dur);
        const vib = ctx.createOscillator(); vib.frequency.value = 4 + Math.random() * 3;
        const vg = ctx.createGain(); vg.gain.value = base * 0.06;
        vib.connect(vg); vg.connect(o.frequency);
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 420; f1.Q.value = 2;
        const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1100; f2.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.5, t + dur * 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(p);
        o.start(t); o.stop(t + dur + 0.1); vib.start(t); vib.stop(t + dur + 0.1);
      },
      scream: () => {
        const t = ctx.currentTime, dur = 0.9;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(base * 2.2, t);
        o.frequency.exponentialRampToValueAtTime(base * 5.5, t + dur * 0.7);
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1500; f1.Q.value = 1.2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.9, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f1); f1.connect(g); g.connect(p);
        o.start(t); o.stop(t + dur + 0.1);
        const n = this._noise(p, { t0: t, dur, gain: 0.3, hp: 1000, lp: 5000, a: 0.05 });
      },
      hurt: () => {
        const t = ctx.currentTime;
        this._tone(p, { t0: t, dur: 0.25, f0: base * 2.6, f1: base * 1.4, type: 'sawtooth', gain: 0.5, a: 0.01 });
      },
      die: () => {
        const t = ctx.currentTime;
        this._tone(p, { t0: t, dur: 1.1, f0: base * 1.6, f1: base * 0.5, type: 'sawtooth', gain: 0.5, a: 0.02 });
        this._noise(p, { t0: t + 0.3, dur: 0.5, gain: 0.2, lp: 800, a: 0.1 });
      },
      thump: () => { // body fall
        const t = ctx.currentTime;
        this._tone(p, { t0: t, dur: 0.18, f0: 90, f1: 40, gain: 0.6 });
      },
      step: () => {
        const t = ctx.currentTime;
        this._noise(p, { t0: t, dur: 0.06, gain: 0.15, lp: 420, a: 0.003 });
      },
      dispose: () => { try { p.disconnect(); } catch (e) {} },
    };
    this.voices.push(voice);
    return voice;
  }
}
