/* ==========================================================================
   STAGE — the 3D film set
   Builds the scene, runs the camera, and draws it. The page tells the stage
   which shot it wants (setTarget); the stage eases towards it every frame,
   which is what gives the scrolling its smooth, filmic feel without ever
   taking control of the scrollbar away from the visitor.

   Quality adapts to the device:
     high   bloom, anti-aliasing, full particle counts
     mid    bloom at lower resolution, fewer particles
     low    no post-processing, minimal particles
   If frames take too long the stage steps down by itself.
   ========================================================================== */

import * as T from '../../vendor/three/three-r187.bundle.min.js';
import { createScreen, createBoardTexture, createCardTexture } from './textures.js';
import { createPhone } from './phone.js';
import { createIcons } from './icons.js';
import { createBeam } from './beam.js';
import { createBackdrop } from './backdrop.js';

const FOV = 36;

const LOOK_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uAberration: { value: 0.9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAberration;
    varying vec2 vUv;
    void main() {
      // Lens fringing: colours separate slightly towards the corners.
      vec2 centred = vUv - 0.5;
      vec2 shift = centred * dot(centred, centred) * 0.018 * uAberration;
      vec3 color = vec3(
        texture2D(tDiffuse, vUv + shift).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - shift).b
      );

      // Film grade: cool shadows, warm highlights, a touch more contrast.
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color += vec3(-0.004, 0.012, 0.018) * (1.0 - smoothstep(0.0, 0.45, luma));
      color += vec3(0.030, 0.012, -0.020) * smoothstep(0.5, 1.0, luma);
      color = mix(color, color * color * (3.0 - 2.0 * color), 0.22);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

function pickTier() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  if (touch || small) return cores >= 8 && memory >= 6 ? 'mid' : 'low';
  if (cores >= 8 && memory >= 8) return 'high';
  return cores >= 4 ? 'mid' : 'low';
}

const TIERS = {
  high: { dpr: 2, samples: 4, bloom: true, dust: 1700, icons: 34, bokeh: 80 },
  mid: { dpr: 1.5, samples: 2, bloom: true, dust: 1000, icons: 26, bokeh: 60 },
  low: { dpr: 1.25, samples: 0, bloom: false, dust: 450, icons: 16, bokeh: 36 },
};

function damp(current, target, lambda, dt) {
  if (dt <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function dampVector(current, target, lambda, dt) {
  current[0] = damp(current[0], target[0], lambda, dt);
  current[1] = damp(current[1], target[1], lambda, dt);
  current[2] = damp(current[2], target[2], lambda, dt);
}

function cloneState(state) {
  return {
    ...state,
    cam: state.cam.slice(),
    look: state.look.slice(),
    phone: state.phone.slice(),
    rot: state.rot.slice(),
    aim: state.aim.slice(),
  };
}

export function createStage(canvas, { initial, mirror = 1, narrow = false, animate = true, onFallback } = {}) {
  let tierName = pickTier();
  let tier = TIERS[tierName];

  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: tierName === 'low',
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setClearColor(0x04070a, 1);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x04080b, 0.03);

  const camera = new T.PerspectiveCamera(FOV, 1, 0.1, 120);
  scene.add(camera);

  /* Reflections for metal and glass, generated from a tiny built-in room */
  const pmrem = new T.PMREMGenerator(renderer);
  const room = new T.RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.38;
  pmrem.dispose();

  /* Lights */
  const hemisphere = new T.HemisphereLight(0x9fdbe2, 0x0b0705, 0.4);
  const key = new T.DirectionalLight(0xffd9b0, 1.7);
  const rim = new T.DirectionalLight(0xfff0d8, 3.6);
  const fill = new T.DirectionalLight(0x3fd9cf, 1.15);
  scene.add(hemisphere, key, key.target, rim, rim.target, fill, fill.target);

  /* Cast */
  const screen = createScreen(T);
  const boardTexture = createBoardTexture(T);
  const cardTextures = [createCardTexture(T, 0), createCardTexture(T, 1), createCardTexture(T, 2)];
  const phone = createPhone(T, { screenTexture: screen.texture, boardTexture, cardTextures, detail: tierName });
  const phoneRig = new T.Group();
  phoneRig.add(phone.group);
  scene.add(phoneRig);

  const icons = createIcons(T, { count: tier.icons, detail: tierName });
  scene.add(icons.group);

  const beam = createBeam(T, { dustCount: tier.dust });
  scene.add(beam.group);

  const backdrop = createBackdrop(T, { camera, bokehCount: tier.bokeh });
  scene.add(backdrop.bokeh);

  /* Post-processing */
  let composer = null;
  let bloomPass = null;

  function buildComposer() {
    if (!tier.bloom) return;
    const size = renderer.getDrawingBufferSize(new T.Vector2());
    const target = new T.WebGLRenderTarget(size.x, size.y, {
      type: T.HalfFloatType,
      samples: tier.samples,
    });
    composer = new T.EffectComposer(renderer, target);
    composer.addPass(new T.RenderPass(scene, camera));
    bloomPass = new T.UnrealBloomPass(new T.Vector2(size.x / 2, size.y / 2), 0.42, 0.6, 0.86);
    composer.addPass(bloomPass);
    composer.addPass(new T.OutputPass());
    composer.addPass(new T.ShaderPass(LOOK_SHADER));
  }

  function dropComposer() {
    if (!composer) return;
    composer.dispose();
    composer = null;
    bloomPass = null;
  }

  buildComposer();

  /* State */
  const view = { mirror, narrow };
  const iconView = { mirror, narrow, aspect: 1, cameraX: 0, cameraY: 0, cameraZ: 9, tanHalfFov: Math.tan(T.MathUtils.degToRad(FOV) / 2) };
  let reach = 1;
  let target = cloneState(initial);
  const current = cloneState(initial);
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const source = new T.Vector3();
  const aim = new T.Vector3();
  const phonePosition = new T.Vector3();
  const lookAt = new T.Vector3();
  let time = 0;
  let last = 0;
  let frameId = 0;
  let running = false;
  let animated = animate;
  let visible = true;
  let disposed = false;
  let slowFrames = 0;
  let sampledFrames = 0;
  let width = 1;
  let height = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, tier.dpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    reach = Math.min(1.12, Math.max(0.6, camera.aspect / 1.78));
    const drawingHeight = height * dpr;
    const fov = T.MathUtils.degToRad(FOV);
    beam.setViewport(drawingHeight, fov);
    backdrop.setViewport(drawingHeight, camera.aspect, fov);
    if (composer) {
      composer.setPixelRatio(dpr);
      composer.setSize(width, height);
    }
    if (!running) renderOnce();
  }

  function step(dt) {
    dampVector(current.cam, target.cam, 2.6, dt);
    dampVector(current.look, target.look, 2.6, dt);
    dampVector(current.phone, target.phone, 3.0, dt);
    dampVector(current.rot, target.rot, 3.0, dt);
    dampVector(current.aim, target.aim, 2.2, dt);
    current.scale = damp(current.scale, target.scale, 3.0, dt);
    current.explode = damp(current.explode, target.explode, 4.5, dt);
    current.beam = damp(current.beam, target.beam, 2.4, dt);
    current.flare = damp(current.flare, target.flare, 2.4, dt);
    current.bokeh = damp(current.bokeh, target.bokeh, 2.4, dt);
    current.formation = target.formation;

    pointer.sx = damp(pointer.sx, pointer.x, 3.2, dt);
    pointer.sy = damp(pointer.sy, pointer.y, 3.2, dt);

    const idle = animated ? 1 : 0;

    /* Camera: follows the shot, sways gently with the pointer */
    camera.position.set(
      current.cam[0] + pointer.sx * 0.42 * idle,
      current.cam[1] - pointer.sy * 0.24 * idle,
      current.cam[2],
    );
    lookAt.set(current.look[0], current.look[1], current.look[2]);
    camera.lookAt(lookAt);

    /* Phone: floats, turns slowly, leans towards the pointer */
    phonePosition.set(
      current.phone[0],
      current.phone[1] + Math.sin(time * 0.8) * 0.06 * idle,
      current.phone[2],
    );
    phoneRig.position.copy(phonePosition);
    phoneRig.scale.setScalar(current.scale);
    phoneRig.rotation.set(
      current.rot[0] + pointer.sy * 0.09 * idle + Math.sin(time * 0.43) * 0.02 * idle,
      current.rot[1] + pointer.sx * 0.16 * idle + Math.sin(time * 0.34) * 0.1 * idle,
      current.rot[2] + Math.sin(time * 0.5) * 0.014 * idle,
    );
    phone.setExplode(current.explode);

    /* Projector: fixed lens, beam aimed at the star */
    if (view.narrow) source.set(2.3 * view.mirror, 5.6, -5);
    else source.set(5.5 * view.mirror * reach, 3.05, -5);
    aim.set(current.aim[0], current.aim[1], current.aim[2]);
    beam.update(time, source, aim, current.beam, current.flare);

    /* Lights */
    rim.position.copy(source);
    rim.target.position.copy(phonePosition);
    rim.intensity = 1.6 + current.beam * 1.5;
    key.position.set(-3.4 * view.mirror, 2.6, 6.5);
    key.target.position.copy(phonePosition);
    fill.position.set(-4.5 * view.mirror, -2.4, 2.5);
    fill.target.position.copy(phonePosition);

    iconView.mirror = view.mirror;
    iconView.narrow = view.narrow;
    iconView.aspect = camera.aspect;
    iconView.cameraX = current.cam[0];
    iconView.cameraY = current.cam[1];
    iconView.cameraZ = current.cam[2];
    icons.update(dt, time, current.formation, phonePosition, camera.position, iconView);
    backdrop.update(time, current.bokeh, 0.5 + current.beam * 0.5, view.mirror);
  }

  function draw() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  function renderOnce() {
    if (disposed) return;
    step(0);
    draw();
  }

  function downgrade() {
    if (tierName === 'high') tierName = 'mid';
    else if (tierName === 'mid') tierName = 'low';
    else return false;
    tier = { ...TIERS[tierName], dust: tier.dust, icons: tier.icons, bokeh: tier.bokeh };
    dropComposer();
    buildComposer();
    resize();
    return true;
  }

  function frame(now) {
    if (!running) return;
    frameId = window.requestAnimationFrame(frame);
    const elapsed = last ? now - last : 16;
    last = now;
    const dt = Math.min(0.05, elapsed / 1000);
    time += dt;
    step(dt);
    draw();

    // Watch the frame rate for the first few seconds and step down if needed.
    if (sampledFrames < 240) {
      sampledFrames += 1;
      if (sampledFrames > 20 && elapsed > 34) slowFrames += 1;
      if (sampledFrames === 90 || sampledFrames === 240) {
        if (slowFrames > sampledFrames * 0.4) {
          if (downgrade()) {
            sampledFrames = 0;
            slowFrames = 0;
          }
        }
      }
    }
  }

  function start() {
    if (running || disposed || !animated || !visible) return;
    running = true;
    last = 0;
    frameId = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    window.cancelAnimationFrame(frameId);
  }

  /* Public controls */

  function setTarget(state) {
    target = state;
    if (!running) {
      // Paused (reduced motion): jump straight to the shot and draw one still frame.
      Object.assign(current, cloneState(state));
      renderOnce();
    }
  }

  function setView(next) {
    if (next.mirror !== undefined) view.mirror = next.mirror;
    if (next.narrow !== undefined) view.narrow = next.narrow;
  }

  function setAnimated(value) {
    animated = value;
    if (animated) start();
    else {
      stop();
      Object.assign(current, cloneState(target));
      renderOnce();
    }
  }

  function setScreen(content) {
    screen.draw(content);
    if (!running) renderOnce();
  }

  function setPointer(x, y) {
    pointer.x = x;
    pointer.y = y;
  }

  function onVisibility() {
    visible = document.visibilityState === 'visible';
    if (visible) start();
    else stop();
  }

  function onContextLost(event) {
    event.preventDefault();
    stop();
    if (onFallback) onFallback();
  }

  function onContextRestored() {
    if (onFallback) onFallback(true);
    start();
  }

  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  resize();
  renderOnce();
  start();

  function dispose() {
    disposed = true;
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    dropComposer();
    phone.dispose();
    icons.dispose();
    beam.dispose();
    backdrop.dispose();
    screen.texture.dispose();
    boardTexture.dispose();
    cardTextures.forEach((texture) => texture.dispose());
    environment.dispose();
    renderer.dispose();
  }

  return {
    setTarget,
    setView,
    setAnimated,
    setScreen,
    setPointer,
    resize,
    dispose,
    get tier() {
      return tierName;
    },
  };
}
