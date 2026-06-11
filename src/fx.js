import * as THREE from 'three';
import { CFG } from './config.js';

// Low-res render target with nearest upscale, 5-bit quantize + ordered
// dither: the PS1 look that hides simple geometry and reads as dread.
// Exposure models dark adaptation: a muzzle flash in a dark hall buys you
// one bright frame and then takes your night vision as payment.

const POST_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform float uExposure;
  uniform float uDamage;
  uniform float uPulse;     // heartbeat vignette throb
  uniform float uFade;      // death/win fade
  uniform vec3 uFadeColor;
  uniform vec2 uRes;

  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int idx = x + y * 4;
    int m[16];
    m[0]=0; m[1]=8; m[2]=2; m[3]=10;
    m[4]=12; m[5]=4; m[6]=14; m[7]=6;
    m[8]=3; m[9]=11; m[10]=1; m[11]=9;
    m[12]=15; m[13]=7; m[14]=13; m[15]=5;
    for (int i = 0; i < 16; i++) if (i == idx) return float(m[i]) / 16.0;
    return 0.0;
  }

  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
    c = pow(c, vec3(0.4545)); // linear -> sRGB by hand; we bypass three's output transform
    // vignette + heartbeat throb
    float d = distance(vUv, vec2(0.5));
    float vig = smoothstep(0.85, 0.35, d);
    vig = mix(vig, vig * 0.82, uPulse);
    c *= vig;
    // wound: blood at the edges, not a health bar
    c = mix(c, vec3(0.45, 0.02, 0.02), uDamage * smoothstep(0.25, 0.75, d));
    // quantize with ordered dither
    float dith = (bayer4(vUv * uRes) - 0.5) / 24.0;
    c = floor((c + dith) * 31.0 + 0.5) / 31.0;
    c = mix(c, uFadeColor, uFade);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export class FX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uniforms = {
      tDiffuse: { value: this.rt.texture },
      uExposure: { value: 1 },
      uDamage: { value: 0 },
      uPulse: { value: 0 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(0x000000) },
      uRes: { value: new THREE.Vector2(2, 2) },
    };
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms: this.uniforms, depthTest: false }),
    );
    this.postScene.add(quad);

    // exposure phases: idle -> blind -> crushed -> recovering
    this.expPhase = 'idle';
    this.expT = 0;
    this.flashStrength = 1;
    this.damage = 0;
    this.fadeTarget = 0;

    // pooled muzzle light
    this.mLight = new THREE.PointLight(0xffc890, 0, 9, 1.5);
    scene.add(this.mLight);
    this.mLightT = 0;

    // particle bursts
    this.bursts = [];

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const ih = CFG.fx.targetHeight;
    const iw = Math.round(ih * (w / h));
    this.rt.setSize(iw, ih);
    this.uniforms.uRes.value.set(iw, ih);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  exposureFlash(strength = 1) {
    this.expPhase = 'blind';
    this.expT = 0;
    this.flashStrength = strength;
  }

  muzzleLight(pos) {
    this.mLight.position.copy(pos);
    this.mLight.intensity = 26;
    this.mLightT = 0.055;
  }

  damageFlash() { this.damage = Math.min(1, this.damage + 0.55); }

  fadeOut(color = 0x000000) {
    this.uniforms.uFadeColor.value.set(color);
    this.fadeTarget = 1;
  }

  impact(point, normal) { this._burst(point, normal, 0x8a8578, 7, 2.2); }
  bloodPuff(point, dir) { this._burst(point, dir.clone().multiplyScalar(-1), 0x4a0a0c, 12, 1.7); }

  _burst(point, dir, color, n, spd) {
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(n * 3);
    const vels = [];
    for (let i = 0; i < n; i++) {
      posArr[i * 3] = point.x; posArr[i * 3 + 1] = point.y; posArr[i * 3 + 2] = point.z;
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2)
        .normalize().multiplyScalar(spd * (0.4 + Math.random() * 0.8))
        .addScaledVector(dir, spd * 0.6);
      vels.push(v);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.045, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.bursts.push({ pts, vels, life: 0.5 });
  }

  update(dt, fear, beatPhase01) {
    // exposure state machine
    const F = CFG.fx;
    let exposure = 1;
    if (this.expPhase === 'blind') {
      this.expT += dt;
      exposure = 1 + (F.exposureBlind - 1) * this.flashStrength;
      if (this.expT > 0.07) { this.expPhase = 'crushed'; this.expT = 0; }
    } else if (this.expPhase === 'crushed') {
      this.expT += dt;
      const t = Math.min(1, this.expT / F.adaptTime);
      const crush = 1 - (1 - F.exposureCrush) * this.flashStrength;
      exposure = crush + (1 - crush) * t * t;
      if (t >= 1) this.expPhase = 'idle';
    }
    this.uniforms.uExposure.value += (exposure - this.uniforms.uExposure.value) * Math.min(1, dt * 30);

    this.damage = Math.max(0, this.damage - dt * 0.5);
    this.uniforms.uDamage.value = this.damage;
    this.uniforms.uPulse.value = fear > 0.45 ? Math.max(0, Math.sin(beatPhase01 * Math.PI * 2)) * (fear - 0.45) : 0;
    this.uniforms.uFade.value += (this.fadeTarget - this.uniforms.uFade.value) * Math.min(1, dt * 2.2);

    if (this.mLightT > 0) {
      this.mLightT -= dt;
      if (this.mLightT <= 0) this.mLight.intensity = 0;
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.life -= dt;
      if (burst.life <= 0) {
        this.scene.remove(burst.pts);
        burst.pts.geometry.dispose();
        burst.pts.material.dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      const arr = burst.pts.geometry.attributes.position.array;
      for (let j = 0; j < burst.vels.length; j++) {
        const v = burst.vels[j];
        v.y -= 6.5 * dt;
        arr[j * 3] += v.x * dt;
        arr[j * 3 + 1] = Math.max(0.02, arr[j * 3 + 1] + v.y * dt);
        arr[j * 3 + 2] += v.z * dt;
      }
      burst.pts.geometry.attributes.position.needsUpdate = true;
      burst.pts.material.opacity = burst.life * 2;
      burst.pts.material.transparent = true;
    }
  }

  render() {
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
