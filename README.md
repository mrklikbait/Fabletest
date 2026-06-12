# PRESS CHECK

*A survival horror prototype built on tactical shooter gun handling.*

> Survival horror disempowers the player by making the gun feel weak.
> Tactical shooters spent their whole genre making guns less powerful
> **without** making them feel weak. This game borrows that toolbox:
> the gun stays completely convincing — everything around it is the horror.

You are the surviving point man of an entry team that went silent inside a
derelict apartment block. Find the fire-exit key in unit 6, get back to the
lobby doors, get out. The block is not empty.

## Run it

```bash
npm install
npm run dev      # then open the printed localhost URL
```

Headless verification (requires `npx playwright install chromium` once):

```bash
npm run build
node scripts/validate-map.mjs   # map connectivity
node scripts/smoke.mjs          # boots the game, walks, shoots, screenshots
node scripts/verify.mjs         # 14 end-to-end mechanic checks
```

## The handling law

**Fear changes the cost and tempo of control, never the ownership of it.**

- **No invisible spread cone.** Bullets leave the barrel along the barrel,
  always. All "inaccuracy" is visible muzzle movement you can see and fight.
- **Sway is low-frequency and compensable.** Fear widens the figure-eight;
  it never becomes jitter. The muzzle drifts, it never teleports.
- **Audio is information.** Breathing telegraphs the sway phase — shoot in
  the gaps like a biathlete. A fouled action grinds audibly for shots
  before it ever jams. Heart rate is your only fear meter.
- **Failures are rules, not dice.** Take a hit mid-insert and the magazine
  is on the floor. Ignore the grit warnings and the next shot stops the
  gun. Tap-rack (R) clears it — control is retained throughout.
- **Recoil is physics, not punishment.** A consistent kick you learn and
  pull back down. Nothing yanks the muzzle off your input.

## Systems

- **Magazines are physical.** No ammo counter exists. Hold R to press-check
  ("one in the pipe — mag feels about half"). Tap R for a retention reload
  (slow, keeps the partial), double-tap for a speed reload (fast, the
  partial hits the floor — go back for it if you dare). Loose rounds must
  be thumbed into mags (hold G) in quiet moments. The slide locks back on
  empty: that is your low-ammo warning.
- **The shotgun is a tube gun.** Shell-by-shell loading you can interrupt
  at any time; pump between shots; real pellet spread from the muzzle.
- **Light is a trade.** The weapon light points where the barrel points —
  lowering the gun lowers your vision. It also tells everything where you
  are. Muzzle flash in the dark buys one bright frame, then takes your
  night vision as payment.
- **Noise is the economy.** Gunshots, running, door creaks, even an
  over-held breath — everything has a radius, and the block listens.
- **Anatomy, not hit points.** Heads end it instantly. Torso hits stagger
  and accumulate. Destroy a leg and the walker becomes a crawler — slower,
  lower, still coming. Killable enemies keep the gun honest; numbers,
  darkness, and your own scarcity do the disempowering.
- **CQB kit.** Lean (Q/E), crouch, slow doors, weapon compression against
  walls (a gun pressed into a doorframe cannot fire), kick (V) to make
  space. Hunting subjects bash doors down — three hits and it's open.

## Controls

| | |
|---|---|
| WASD / Shift / C | walk / run (loud) / crouch (quiet) |
| Q / E | lean |
| LMB / RMB | fire / sights |
| Space (in sights) | hold breath — overhold and you gasp |
| R | tap: retention reload · double-tap: speed reload · hold: press check · clears stoppages |
| G (hold) | top off magazines / feed shells |
| M (hold) | clean the action (needs the kit, needs quiet) |
| F / V / T / X | interact / kick / weapon light / field dressing |
| 1 / 2 | pistol / shotgun |
| H / I / Esc | controls overlay / input monitor / pause (also shows controls) |

## Stack

Three.js + Vite, zero asset files: geometry is boxes, textures are
generated on canvas, and every sound — gunshots, magazine clicks,
heartbeat, breathing, moans — is synthesized in WebAudio at runtime.
Rendered at 270p into a quantized, dithered upscale for the PS1 dread.
