// Keys are matched by physical KeyboardEvent.code so WASD stays put on any
// layout. Some environments (remote-desktop viewers, VMs, virtual keyboards)
// deliver empty or "Unidentified" codes while the mouse works fine — for
// those, fall back to deriving a code from e.key.
function codeFromKey(key) {
  if (!key) return null;
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (key.length === 1) {
    const u = key.toUpperCase();
    if (u >= 'A' && u <= 'Z') return 'Key' + u;
    if (u >= '0' && u <= '9') return 'Digit' + u;
    return null;
  }
  const named = { Shift: 'ShiftLeft', Control: 'ControlLeft', Alt: 'AltLeft', Esc: 'Escape' };
  return named[key] || key; // ArrowUp, Tab, Escape, ... pass through
}

function normCode(e) {
  if (e.code && e.code !== 'Unidentified') return e.code;
  return codeFromKey(e.key);
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseRDown = false;
    this.mouseJustDown = false;
    this.enabled = false;
    this.lastKeyEvent = null; // diagnostics

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = normCode(e);
      this.lastKeyEvent = { code: e.code, key: e.key, used: code };
      if (!code) return;
      this.keys.add(code);
      this.justPressed.add(code);
      if (code === 'Space' || code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const code = normCode(e);
      if (code) this.keys.delete(code);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouseDown = true; this.mouseJustDown = true; }
      if (e.button === 2) this.mouseRDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRDown = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = this.mouseRDown = false; });
  }

  held(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }

  // mouse deltas are consumed where they're used…
  mouseDelta() {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }

  // …but just-pressed flags live until the END of the frame, after every
  // system has had its chance to read them. Clearing them at the top of
  // the frame silently killed every tap action.
  endFrame() {
    this.justPressed.clear();
    this.mouseJustDown = false;
  }
}
