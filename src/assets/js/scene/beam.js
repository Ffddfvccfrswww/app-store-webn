/* ==========================================================================
   BEAM — the projector light
   Three parts share one origin (the projector lens) and follow the phone
   like a spotlight operator:
     1. a soft cone of light with slow moving rays
     2. dust drifting inside the cone
     3. a lens flare with a wide anamorphic streak
   ========================================================================== */

import { createGlowTexture, createStreakTexture, seededRandom } from './textures.js';

const LENGTH = 10;
const RADIUS_NEAR = 0.16;
const RADIUS_FAR = 2.7;

const CONE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const CONE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    // Soft silhouette: the cone is brightest where we look through its thickest part.
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float edge = pow(facing, 1.6);

    // Bright at the lens, fading to nothing before the open end.
    float along = pow(1.0 - vUv.y, 1.5) * smoothstep(0.0, 0.025, vUv.y);

    // Rays that turn slowly around the axis (sampled on a circle, so there is no seam).
    float angle = vUv.x * 6.28318530718;
    vec2 ring = vec2(cos(angle), sin(angle));
    float rays = 0.34 + 0.66 * noise(ring * 6.0 + vec2(uTime * 0.05, -uTime * 0.035));
    float haze = 0.86 + 0.14 * noise(ring * 2.0 + vec2(vUv.y * 5.0 - uTime * 0.07));

    float strength = edge * along * rays * haze * uIntensity;
    gl_FragColor = vec4(uColor * strength, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const DUST_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aSize;
  uniform float uTime;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.21 + aSeed * 31.0) * 0.24;
    p.y += cos(uTime * 0.17 + aSeed * 17.0) * 0.24;
    p.z += sin(uTime * 0.13 + aSeed * 53.0) * 0.34;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = max(1.5, aSize * uScale / max(0.6, -mvPosition.z));
    vAlpha = (0.25 + 0.75 * abs(sin(uTime * 0.8 + aSeed * 40.0))) * (0.35 + 0.65 * fract(aSeed * 7.0));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(uColor * a * vAlpha * uIntensity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createBeam(T, { dustCount }) {
  const group = new T.Group();
  const disposables = [];
  const color = new T.Color(1.0, 0.76, 0.5);

  /* 1. Cone */
  const coneGeometry = new T.CylinderGeometry(RADIUS_FAR, RADIUS_NEAR, LENGTH, 56, 1, true);
  coneGeometry.translate(0, LENGTH / 2, 0);
  coneGeometry.rotateX(Math.PI / 2); // the cone now points along +Z, the direction lookAt() aims
  const coneMaterial = new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uColor: { value: color },
    },
    vertexShader: CONE_VERTEX,
    fragmentShader: CONE_FRAGMENT,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const cone = new T.Mesh(coneGeometry, coneMaterial);
  cone.renderOrder = 5;
  cone.frustumCulled = false;
  group.add(cone);
  disposables.push(coneGeometry, coneMaterial);

  /* 2. Dust */
  const random = seededRandom(424242);
  const positions = new Float32Array(dustCount * 3);
  const seeds = new Float32Array(dustCount);
  const sizes = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i += 1) {
    // More dust where the cone is wide, none right at the lens.
    const along = 0.06 + 0.8 * Math.sqrt(random());
    const z = along * LENGTH;
    const radius = (RADIUS_NEAR + (RADIUS_FAR - RADIUS_NEAR) * along) * Math.sqrt(random()) * 0.94;
    const angle = random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = Math.sin(angle) * radius;
    positions[i * 3 + 2] = z;
    seeds[i] = random();
    sizes[i] = 0.01 + random() * random() * 0.04;
  }
  const dustGeometry = new T.BufferGeometry();
  dustGeometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  dustGeometry.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));
  dustGeometry.setAttribute('aSize', new T.BufferAttribute(sizes, 1));
  const dustMaterial = new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 800 },
      uIntensity: { value: 1 },
      uColor: { value: new T.Color(1.0, 0.9, 0.74) },
    },
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });
  const dust = new T.Points(dustGeometry, dustMaterial);
  dust.renderOrder = 6;
  dust.frustumCulled = false;
  group.add(dust);
  disposables.push(dustGeometry, dustMaterial);

  /* 3. Flare */
  const glowTexture = createGlowTexture(T);
  const streakTexture = createStreakTexture(T);
  const glowMaterial = new T.SpriteMaterial({
    map: glowTexture,
    blending: T.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });
  const streakMaterial = new T.SpriteMaterial({
    map: streakTexture,
    blending: T.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });
  const glow = new T.Sprite(glowMaterial);
  glow.scale.set(4.2, 4.2, 1);
  glow.renderOrder = 7;
  const streak = new T.Sprite(streakMaterial);
  streak.scale.set(15, 0.5, 1);
  streak.renderOrder = 7;
  group.add(glow, streak);
  disposables.push(glowTexture, streakTexture, glowMaterial, streakMaterial);

  /**
   * @param {number} time
   * @param {Vector3} source     where the projector lens is
   * @param {Vector3} target     what the beam is aimed at
   * @param {number} intensity   brightness of the cone and the dust
   * @param {number} flare       brightness of the lens flare
   */
  function update(time, source, target, intensity, flare) {
    group.position.copy(source);
    group.lookAt(target);
    coneMaterial.uniforms.uTime.value = time;
    coneMaterial.uniforms.uIntensity.value = intensity * 0.36;
    dustMaterial.uniforms.uTime.value = time;
    dustMaterial.uniforms.uIntensity.value = Math.min(1.4, intensity) * 0.55;
    glowMaterial.opacity = Math.min(1, flare * 0.62);
    streakMaterial.opacity = Math.min(1, flare * 0.5);
    const pulse = 1 + Math.sin(time * 1.7) * 0.025;
    glow.scale.set(4.2 * pulse, 4.2 * pulse, 1);
  }

  /** Dust size depends on the drawing height, so it stays the same on every screen. */
  function setViewport(drawingHeight, fovRadians) {
    dustMaterial.uniforms.uScale.value = drawingHeight / (2 * Math.tan(fovRadians / 2));
  }

  function dispose() {
    for (const item of disposables) item.dispose();
  }

  return { group, update, setViewport, dispose };
}
