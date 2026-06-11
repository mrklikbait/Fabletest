// Central tuning. One law governs everything here: fear changes the COST and
// TEMPO of control, never the OWNERSHIP of it. No invisible spread cones, no
// input randomness — every degradation is visible muzzle movement or time.

export const CFG = {
  cell: 1.5,            // metres per grid cell
  wallH: 2.7,
  eyeStand: 1.62,
  eyeCrouch: 0.95,

  player: {
    radius: 0.32,
    walk: 2.3,
    run: 4.3,
    crouchMul: 0.52,
    accel: 22,
    leanDist: 0.42,
    leanRoll: 0.20,     // radians
    hp: 100,
    lowHp: 35,
    bandageHeal: 45,
    bandageTime: 3.2,
    stepWalk: 0.62,     // seconds between steps
    stepRun: 0.34,
  },

  noiseRadius: {
    pistol: 27,
    shotgun: 36,
    runStep: 7,
    walkStep: 2.5,
    doorCreak: 6,
    doorBash: 11,
    kick: 5,
    magDrop: 4,
    gasp: 4,
    loadClick: 3.5,
    bandage: 3,
  },

  fear: {
    decay: 0.035,        // per second when calm
    darkGain: 0.030,     // per second, flashlight off with threats alive
    proxGain: 1.1,       // scaled by closeness of visible enemy
    spikeDamage: 0.35,
    spikeScream: 0.18,
    spikeJam: 0.12,
    fumbleThreshold: 0.7,
    heartbeatAudible: 0.32,
  },

  sway: {
    // Low-frequency, compensable. Amplitudes in radians.
    baseAmp: 0.0045,
    fearAmpMul: 2.3,     // amp *= 1 + fear * this
    adsMul: 0.55,
    crouchMul: 0.7,
    breathHoldMul: 0.13,
    wanderHz: 0.23,
    breathAmp: 0.0042,
    holdBreathMax: 2.4,  // seconds before forced gasp
    gaspPenalty: 1.8,    // sway multiplier during recovery
    gaspRecover: 1.6,    // seconds
  },

  pistol: {
    name: '9mm sidearm',
    damage: 26,
    magCap: 12,
    reloadRetention: 2.4,
    reloadSpeed: 1.35,
    slideRelease: 0.45,
    fumbleExtra: 0.7,
    pressCheck: 0.9,
    refire: 0.16,
    recoilPitch: 0.030,  // viewmodel kick
    camKick: 0.0065,     // small, recovers — recoil is physics, not punishment
    dirtPerShot: 0.012,
    dirtStart: 0.25,
    dirtWarn: 0.55,      // grit audio begins
    dirtJamZone: 0.85,   // 3 warning shots then a deterministic stoppage
    jamClear: 1.25,
    topOffPerRound: 0.8,
    cleanTime: 6.0,
    dirtAfterJam: 0.7,
  },

  shotgun: {
    name: 'pump 12-gauge',
    pellets: 8,
    pelletDamage: 16,
    spreadDeg: 4.2,      // physical pattern from the muzzle — the muzzle itself is truth
    tubeCap: 5,
    pumpTime: 0.72,
    insertTime: 0.85,
    refire: 0.1,
    recoilPitch: 0.085,
    camKick: 0.020,
  },

  enemy: {
    walk: 0.85,
    hunt: 2.15,
    lungeSpeed: 4.6,
    lungeRange: 2.3,
    crawlSpeed: 1.05,
    attackRange: 1.7,
    attackWindup: 0.36,
    attackCooldown: 1.15,
    attackDamage: 34,
    crawlerDamage: 18,
    torsoHits: 3,        // pistol-equivalent damage pool below
    torsoHp: 78,
    legHp: 50,           // leg destroyed -> crawler
    crawlerTorsoHp: 52,
    staggerTime: 0.5,
    sightRange: 15,
    sightRangeDark: 5.5, // you in darkness, light off
    fov: 1.9,            // radians, full angle
    hearDormantMul: 0.5,
    bashHits: 3,
    bashInterval: 0.9,
    repathInterval: 0.6,
    moanMin: 5, moanMax: 11,
  },

  fx: {
    targetHeight: 270,   // internal render height (PS1-ish), nearest upscale
    fogDensity: 0.055,
    exposureBlind: 2.1,  // muzzle flash in darkness
    exposureCrush: 0.55, // post-flash dark adaptation dip
    adaptTime: 3.5,
  },
};
