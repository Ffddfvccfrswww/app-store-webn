/* ==========================================================================
   ICONS — a swarm of generic app tiles
   The tiles rearrange themselves into a different formation for each act:

     orbit  circling the phone                (opening shot, final act)
     chaos  a crowded, restless cloud         (Act I — the crowd)
     halo   a wide, distant ring              (Act II — the production)
     wall   a curved wall of posters          (Act III — now showing)
     drift  slow background motes             (rules, tickets, questions)

   Each tile eases towards its place at its own speed, so the changes read
   as a flock moving rather than a slide switching.
   ========================================================================== */

import { roundedRectShape, fitUv } from './phone.js';
import { createIconTexture, ICON_VARIANTS, seededRandom } from './textures.js';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = 2.399963229728653;

export function createIcons(T, { count, detail }) {
  const group = new T.Group();
  const random = seededRandom(8675309);
  const disposables = [];

  const geometry = new T.ExtrudeGeometry(roundedRectShape(T, 1, 1, 0.235), {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: detail === 'low' ? 1 : 2,
    curveSegments: detail === 'low' ? 6 : 10,
  });
  geometry.translate(0, 0, -0.07);
  fitUv(geometry, 1.06, 1.06);
  disposables.push(geometry);

  const sideMaterial = new T.MeshStandardMaterial({ color: 0x10181f, metalness: 0.7, roughness: 0.32 });
  disposables.push(sideMaterial);

  const variants = Math.min(ICON_VARIANTS, count);
  const faceMaterials = [];
  for (let i = 0; i < variants; i += 1) {
    const texture = createIconTexture(T, i);
    const material = new T.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.2,
      metalness: 0.15,
      roughness: 0.3,
    });
    faceMaterials.push(material);
    disposables.push(texture, material);
  }

  const columns = Math.ceil(count / 3);
  const tiles = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new T.Mesh(geometry, [faceMaterials[i % variants], sideMaterial]);
    const size = 0.36 + random() * 0.3;
    const tile = {
      mesh,
      size,
      a: random(),
      b: random(),
      c: random(),
      d: random(),
      follow: 1.5 + random() * 1.9,
      spin: (random() - 0.5) * 1.5,
      axis: new T.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(),
      column: i % columns,
      row: Math.floor(i / columns),
      target: new T.Vector3(),
      settle: 0,
    };
    mesh.scale.setScalar(size);
    mesh.position.set((random() - 0.5) * 14, (random() - 0.5) * 9, -8 - random() * 6);
    mesh.quaternion.setFromAxisAngle(tile.axis, random() * TAU);
    group.add(mesh);
    tiles.push(tile);
  }

  const spinQuaternion = new T.Quaternion();
  const faceQuaternion = new T.Quaternion();
  const helper = new T.Object3D();

  function place(tile, index, formation, time, center, view) {
    const target = tile.target;
    let scale = tile.size;
    let faceCamera = 0;

    if (formation === 'orbit') {
      const direction = index % 2 === 0 ? 1 : -1;
      const angle = index * GOLDEN_ANGLE + time * 0.11 * direction;
      const radius = 2.2 + tile.a * 1.9;
      const dx = Math.cos(angle) * radius;
      const dy = (tile.b - 0.5) * 3.9 + Math.sin(time * 0.5 + index) * 0.14;
      const dz = Math.sin(angle) * radius * 0.82 - 0.6;
      target.set(center.x + dx, center.y + dy, center.z + dz);
    } else if (formation === 'chaos') {
      target.set(
        (tile.a - 0.5) * 15 + Math.sin(time * 0.31 + index * 1.7) * 0.8,
        (tile.b - 0.5) * 8.4 + Math.cos(time * 0.27 + index * 2.3) * 0.7,
        -6.5 + tile.c * 9.5 + Math.sin(time * 0.22 + index) * 0.6,
      );
      scale = tile.size * (0.75 + tile.d * 0.75);
    } else if (formation === 'halo') {
      const angle = index * GOLDEN_ANGLE + time * 0.05;
      const radius = 5.4 + tile.a * 2.6;
      target.set(
        center.x * 0.4 + Math.cos(angle) * radius,
        (tile.b - 0.5) * 6.2 + Math.sin(time * 0.3 + index) * 0.2,
        -4.6 + Math.sin(angle) * 2.4,
      );
      scale = tile.size * 0.82;
    } else if (formation === 'frame') {
      // A loose ring around the edges of the picture, leaving the middle clear for text.
      // Wide screens: two arcs, left and right. Tall screens: top and bottom.
      const sweep = (tile.b - 0.5) * 1.9 + Math.sin(time * 0.12 + index) * 0.06;
      const base = (index % 2 === 0 ? 0 : Math.PI) + (view.narrow ? Math.PI / 2 : 0);
      const angle = base + sweep;
      const z = -1.5 - tile.c * 3.5;
      const depth = Math.max(1, view.cameraZ - z);
      const halfHeight = depth * view.tanHalfFov;
      const halfWidth = halfHeight * view.aspect;
      target.set(
        Math.cos(angle) * halfWidth * (0.8 + tile.a * 0.2),
        Math.sin(angle) * halfHeight * (0.78 + tile.a * 0.2) + Math.sin(time * 0.4 + index) * 0.1,
        z,
      );
      scale = tile.size * 0.95;
    } else if (formation === 'wall') {
      const spread = columns > 1 ? tile.column / (columns - 1) - 0.5 : 0;
      const angle = spread * 1.7;
      const rowOffset = tile.row - 1;
      target.set(
        Math.sin(angle) * 10.5,
        rowOffset * 1.55 + 0.9 + Math.sin(time * 0.4 + index) * 0.06,
        -Math.cos(angle) * 10.5 + 3.4,
      );
      scale = 0.78;
      faceCamera = 1;
    } else {
      // drift
      target.set(
        (tile.a - 0.5) * 20 + Math.sin(time * 0.12 + index) * 1.1,
        (tile.b - 0.5) * 10 + Math.cos(time * 0.1 + index * 1.3) * 0.9,
        -11 + tile.c * 5,
      );
      scale = tile.size * 0.9;
    }
    // Keep the tiles out of the text column: anything that would sit over the
    // copy is mirrored back onto the stage side (or above the copy on phones).
    if (formation === 'orbit' || formation === 'chaos' || formation === 'halo') {
      const depth = Math.max(1, view.cameraZ - target.z);
      const halfHeight = depth * view.tanHalfFov;
      if (view.narrow) {
        const limit = 0.06;
        const ndc = (target.y - view.cameraY - 0.4) / halfHeight;
        if (ndc < limit) target.y = view.cameraY + 0.4 + (limit + Math.abs(ndc - limit) * 0.8) * halfHeight;
      } else {
        const halfWidth = halfHeight * view.aspect;
        const limit = 0.06;
        const ndc = ((target.x - view.cameraX) / halfWidth) * view.mirror;
        if (ndc < limit) target.x = view.cameraX + (limit + Math.abs(ndc - limit) * 0.85) * halfWidth * view.mirror;
      }
    }
    return { scale, faceCamera };
  }

  /**
   * @param {number} dt         seconds since the last frame (0 jumps straight to the formation)
   * @param {number} time       running time in seconds
   * @param {string} formation  one of the names above
   * @param {Vector3} center    where the phone currently is
   * @param {Vector3} cameraPosition
   */
  function update(dt, time, formation, center, cameraPosition, view) {
    for (let i = 0; i < tiles.length; i += 1) {
      const tile = tiles[i];
      const { scale, faceCamera } = place(tile, i, formation, time, center, view);
      const mesh = tile.mesh;
      const follow = dt <= 0 ? 1 : 1 - Math.exp(-dt * tile.follow);

      mesh.position.lerp(tile.target, follow);
      const nextScale = mesh.scale.x + (scale - mesh.scale.x) * follow;
      mesh.scale.setScalar(nextScale);

      tile.settle += (faceCamera - tile.settle) * follow;
      if (dt > 0 && tile.settle < 0.98) {
        spinQuaternion.setFromAxisAngle(tile.axis, tile.spin * dt * (1 - tile.settle));
        mesh.quaternion.multiply(spinQuaternion);
      }
      if (tile.settle > 0.01) {
        helper.position.copy(mesh.position);
        helper.lookAt(cameraPosition);
        faceQuaternion.copy(helper.quaternion);
        mesh.quaternion.slerp(faceQuaternion, Math.min(1, tile.settle * (dt <= 0 ? 1 : dt * 3.2 + 0.02)));
      }
    }
  }

  function dispose() {
    for (const item of disposables) item.dispose();
  }

  return { group, update, dispose };
}
