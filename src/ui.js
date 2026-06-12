// All persistent HUD is refused on principle. What remains: an inner voice
// (whispers), contextual prompts, and full-screen state cards.

const EVENT_LINES = {
  open: 'team\'s gone. the fire-exit key is in unit 6 — north end. quiet feet.',
  firstkill: 'center mass worked. it usually does.',
  crawler: 'legs gone — it\'s still coming.',
  dirty: 'grit in the action. find a kit, strip it somewhere quiet (hold M).',
  shotgun: 'Reyes\' twelve. tube of five, two still in it. (2 to draw)',
  key: 'fire-exit key. lobby, south doors. go.',
  dry: 'running dry. every round is a decision now.',
  hurt: 'bleeding. dress it when there\'s a wall at your back (X).',
};

export class UI {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.overlay = this.el('overlay');
    this.card = this.el('card');
    this.whisperEl = this.el('whisper');
    this.promptEl = this.el('prompt');
    this.keysEl = this.el('keys');
    this.queue = [];
    this.whisperT = 0;
    this.shown = new Set();
  }

  event(name) {
    if (this.shown.has(name)) return;
    this.shown.add(name);
    if (EVENT_LINES[name]) this.whisper(EVENT_LINES[name]);
  }

  whisper(text, dur = 3.4) {
    if (this.queue.length >= 3) this.queue.shift(); // stale thoughts die first
    this.queue.push({ text, dur });
  }

  prompt(text) {
    if (this.promptEl.textContent !== (text || '')) this.promptEl.textContent = text || '';
  }

  setKeys(text) {
    if (this.keysEl.textContent !== (text || '')) this.keysEl.textContent = text || '';
  }

  update(dt) {
    if (this.whisperT > 0) {
      this.whisperT -= dt;
      if (this.whisperT <= 0.6) this.whisperEl.style.opacity = Math.max(0, this.whisperT / 0.6);
      if (this.whisperT <= 0) this.whisperEl.textContent = '';
    } else if (this.queue.length) {
      const w = this.queue.shift();
      this.whisperEl.textContent = w.text;
      this.whisperEl.style.opacity = 1;
      this.whisperT = w.dur;
    }
  }

  _show(html) {
    this.card.innerHTML = html;
    this.overlay.style.display = 'flex';
  }

  hide() { this.overlay.style.display = 'none'; }

  showStart(onStart) {
    this._show(`
      <h1>PRESS CHECK</h1>
      <p class="tag">the gun works. your hands are the problem.</p>
      <p class="body">Your entry team is gone. The block is not empty.<br>
      Find the fire-exit key — unit 6, north end — and get out the lobby doors.</p>
      <div class="cols">
        <div>
          <b>MOVE</b><br>
          WASD walk &middot; SHIFT run (loud)<br>
          C crouch (quiet) &middot; Q / E lean<br>
          F interact &middot; V kick<br>
          T weapon light
        </div>
        <div>
          <b>GUN</b><br>
          LMB fire &middot; RMB sights &middot; SPACE hold breath<br>
          R tap — reload, keep the mag<br>
          R double-tap — fast, mag hits the floor<br>
          R hold — press check &middot; R clears a stoppage<br>
          G hold — top off mags / feed shells<br>
          M hold — clean the action (needs kit)
        </div>
      </div>
      <p class="body dim">No counters. No bars. The slide, the weight of the mag, and your own
      heartbeat are the instruments. Bullets go exactly where the barrel points — nothing else is promised.</p>
      <button id="go">ENTER THE BLOCK</button>
    `);
    document.getElementById('go').addEventListener('click', onStart, { once: true });
  }

  showDead(stats, onRetry) {
    this._show(`
      <h1 class="red">FLATLINE</h1>
      <p class="body">${stats.shots} rounds out &middot; ${stats.hits} hits &middot; ${stats.kills} put down</p>
      <button id="go">AGAIN</button>
    `);
    document.getElementById('go').addEventListener('click', onRetry, { once: true });
  }

  showWin(stats, onRetry) {
    const secs = Math.round((performance.now() - stats.t0) / 1000);
    const acc = stats.shots ? Math.round((100 * stats.hits) / stats.shots) : 0;
    this._show(`
      <h1>OUT.</h1>
      <p class="body">cold air. sirens somewhere far off.</p>
      <p class="body">${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} &middot;
      ${stats.shots} rounds out &middot; ${acc}% on target &middot; ${stats.kills} put down</p>
      <button id="go">AGAIN</button>
    `);
    document.getElementById('go').addEventListener('click', onRetry, { once: true });
  }

  showPause(onResume) {
    this._show(`
      <h1>HOLDING</h1>
      <p class="body">the block waits.</p>
      <button id="go">RESUME</button>
    `);
    document.getElementById('go').addEventListener('click', onResume, { once: true });
  }
}
