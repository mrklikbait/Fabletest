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

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
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

  consumeFrame() {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    this.justPressed.clear();
    this.mouseJustDown = false;
    return d;
  }
}
