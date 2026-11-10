/* ==========================================================================
   BACKDROP — the dark theatre behind everything
     1. a graded sky that always fills the frame (teal shadows, warm glow)
     2. out-of-focus lights ("bokeh") far in the distance
   ========================================================================== */

import { seededRandom } from './textures.js';

const SKY_DISTANCE = 70;

const SKY_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec2 uWarm;
  uniform vec2 uCool;
  uniform float uAspect;
  uniform float uWarmth;
  varying vec2 vUv;
  void main() {
    vec3 low = vec3(0.004, 0.007, 0.010);
    vec3 high = vec3(0.012, 0.040, 0.050);
    vec3 color = mix(low, high, smoothstep(0.05, 1.0, vUv.y));

    vec2 a = (vUv - uWarm) * vec2(uAspect, 1.0);
    color += vec3(1.0, 0.56, 0.24) * 0.11 * exp(-dot(a, a) * 4.2) * uWarmth;

    vec2 b = (vUv - uCool) * vec2(uAspect, 1.0);
    color += vec3(0.06, 0.46, 0.48) * 0.085 * exp(-dot(b, b) * 3.0);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BOKEH_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.06 + aSeed * 21.0) * 0.9;
    p.y += cos(uTime * 0.05 + aSeed * 13.0) * 0.6;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uScale;
    vColor = aColor;
    vTwinkle = 0.55 + 0.45 * sin(uTime * 0.35 + aSeed * 30.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const BOKEH_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.46, d);
    float rim = smoothstep(0.28, 0.47, d);
    float a = disc * (0.42 + 0.58 * rim);
    gl_FragColor = vec4(vColor * a * uOpacity * vTwinkle, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createBackdrop(T, { camera, bokehCount }) {
  const disposables = [];

  /* 1. Sky — parented to the camera so it always fills the view */
  const skyGeometry = new T.PlaneGeometry(1, 1);
  const skyMaterial = new T.ShaderMaterial({
    uniforms: {
      uWarm: { value: new T.Vector2(0.78, 0.8) },
      uCool: { value: new T.Vector2(0.14, 0.12) },
      uAspect: { value: 1.6 },
      uWarmth: { value: 1 },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const sky = new T.Mesh(skyGeometry, skyMaterial);
  sky.position.z = -SKY_DISTANCE;
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  camera.add(sky);
  disposables.push(skyGeometry, skyMaterial);

  /* 2. Bokeh */
  const random = seededRandom(1895); // the year of the first public film screening
  const palette = [
    [1.0, 0.62, 0.26],
    [1.0, 0.8, 0.52],
    [0.2, 0.82, 0.78],
    [0.12, 0.5, 0.62],
    [1.0, 0.94, 0.84],
  ];
  const positions = new Float32Array(bokehCount * 3);
  const sizes = new Float32Array(bokehCount);
  const seeds = new Float32Array(bokehCount);
  const colors = new Float32Array(bokehCount * 3);
  for (let i = 0; i < bokehCount; i += 1) {
    positions[i * 3] = (random() - 0.5) * 46;
    positions[i * 3 + 1] = (random() - 0.42) * 22;
    positions[i * 3 + 2] = -13 - random() * 15;
    sizes[i] = 34 + random() * random() * 150;
    seeds[i] = random();
    const tint = palette[Math.floor(random() * palette.length)];
    const brightness = 0.05 + random() * 0.13;
    colors[i * 3] = tint[0] * brightness;
    colors[i * 3 + 1] = tint[1] * brightness;
    colors[i * 3 + 2] = tint[2] * brightness;
  }
  const bokehGeometry = new T.BufferGeometry();
  bokehGeometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  bokehGeometry.setAttribute('aSize', new T.BufferAttribute(sizes, 1));
  bokehGeometry.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));
  bokehGeometry.setAttribute('aColor', new T.BufferAttribute(colors, 3));
  const bokehMaterial = new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader: BOKEH_VERTEX,
    fragmentShader: BOKEH_FRAGMENT,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const bokeh = new T.Points(bokehGeometry, bokehMaterial);
  bokeh.renderOrder = -5;
  bokeh.frustumCulled = false;
  disposables.push(bokehGeometry, bokehMaterial);

  function update(time, bokehOpacity, warmth, mirror) {
    bokehMaterial.uniforms.uTime.value = time;
    bokehMaterial.uniforms.uOpacity.value = bokehOpacity;
    skyMaterial.uniforms.uWarmth.value = warmth;
    skyMaterial.uniforms.uWarm.value.x = mirror > 0 ? 0.78 : 0.22;
    skyMaterial.uniforms.uCool.value.x = mirror > 0 ? 0.14 : 0.86;
  }

  function setViewport(drawingHeight, aspect, fovRadians) {
    const height = 2 * Math.tan(fovRadians / 2) * SKY_DISTANCE * 1.04;
    sky.scale.set(height * aspect, height, 1);
    skyMaterial.uniforms.uAspect.value = aspect;
    bokehMaterial.uniforms.uScale.value = drawingHeight / 900;
  }

  function dispose() {
    camera.remove(sky);
    for (const item of disposables) item.dispose();
  }

  return { bokeh, update, setViewport, dispose };
}
