/* ==========================================================================
   PHONE — the star of the film
   A generic handset built from simple shapes (it is not a model of any real
   product). It is made of layers that separate along the depth axis for the
   "exploded view" in Act II:

     back cover → metal frame → circuit board → display → glass → UI cards
   ========================================================================== */

export const PHONE = { width: 1.56, height: 3.2, radius: 0.25 };

/** A rounded rectangle outline centred on the origin. */
export function roundedRectShape(T, width, height, radius) {
  const shape = new T.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.absarc(x + width - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + width, y + height - r);
  shape.absarc(x + width - r, y + height - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + height);
  shape.absarc(x + r, y + height - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/** Map texture coordinates so that a width × height rectangle covers the whole image. */
export function fitUv(geometry, width, height) {
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i += 1) {
    const u = Math.min(1, Math.max(0, (position.getX(i) + width / 2) / width));
    const v = Math.min(1, Math.max(0, (position.getY(i) + height / 2) / height));
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return geometry;
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createPhone(T, { screenTexture, boardTexture, cardTextures, detail }) {
  const { width, height, radius } = PHONE;
  const group = new T.Group();
  const layers = [];
  const disposables = [];
  const curveSegments = detail === 'low' ? 10 : 20;

  function track(...items) {
    for (const item of items) disposables.push(item);
  }

  function addLayer(mesh, assembledZ, explodedZ, extra = {}) {
    mesh.position.z = assembledZ;
    group.add(mesh);
    layers.push({ mesh, assembledZ, explodedZ, ...extra });
    return mesh;
  }

  /* Back cover */
  const backGeometry = new T.ExtrudeGeometry(roundedRectShape(T, width, height, radius), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 3,
    curveSegments,
  });
  backGeometry.translate(0, 0, -0.025);
  const backMaterial = new T.MeshPhysicalMaterial({
    color: 0x0d1920,
    metalness: 0.55,
    roughness: 0.36,
    clearcoat: 0.8,
    clearcoatRoughness: 0.22,
  });
  track(backGeometry, backMaterial);
  addLayer(new T.Mesh(backGeometry, backMaterial), -0.075, -1.35);

  /* Metal frame: an outline with the middle cut out */
  const frameShape = roundedRectShape(T, width, height, radius);
  frameShape.holes.push(roundedRectShape(T, width - 0.1, height - 0.1, radius - 0.05));
  const frameGeometry = new T.ExtrudeGeometry(frameShape, {
    depth: 0.13,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments,
  });
  frameGeometry.translate(0, 0, -0.065);
  const frameMaterial = new T.MeshStandardMaterial({ color: 0xcfc6b6, metalness: 1, roughness: 0.24 });
  track(frameGeometry, frameMaterial);
  addLayer(new T.Mesh(frameGeometry, frameMaterial), 0, -0.62);

  /* Circuit board */
  const boardWidth = width - 0.14;
  const boardHeight = height - 0.14;
  const boardGeometry = fitUv(
    new T.ShapeGeometry(roundedRectShape(T, boardWidth, boardHeight, radius - 0.07), curveSegments),
    boardWidth,
    boardHeight,
  );
  const boardMaterial = new T.MeshBasicMaterial({ map: boardTexture, color: 0xcccccc, toneMapped: false });
  track(boardGeometry, boardMaterial);
  addLayer(new T.Mesh(boardGeometry, boardMaterial), 0.02, 0.06);

  /* Display */
  const displayWidth = width - 0.1;
  const displayHeight = height - 0.1;
  const displayGeometry = fitUv(
    new T.ShapeGeometry(roundedRectShape(T, displayWidth, displayHeight, radius - 0.05), curveSegments),
    displayWidth,
    displayHeight,
  );
  const displayMaterial = new T.MeshBasicMaterial({ map: screenTexture, color: 0xd6d6d6, toneMapped: false });
  track(displayGeometry, displayMaterial);
  addLayer(new T.Mesh(displayGeometry, displayMaterial), 0.062, 0.78);

  /* Glass */
  const glassGeometry = new T.ShapeGeometry(
    roundedRectShape(T, width - 0.03, height - 0.03, radius - 0.015),
    curveSegments,
  );
  const glassMaterial = new T.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.045,
    roughness: 0.03,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.1,
    depthWrite: false,
  });
  track(glassGeometry, glassMaterial);
  const glass = addLayer(new T.Mesh(glassGeometry, glassMaterial), 0.068, 1.42);
  glass.renderOrder = 2;

  /* Floating interface cards */
  const cardWidth = 1.02;
  const cardHeight = 0.595;
  const cardGeometry = fitUv(
    new T.ShapeGeometry(roundedRectShape(T, cardWidth, cardHeight, 0.09), 8),
    cardWidth,
    cardHeight,
  );
  track(cardGeometry);
  const cardPlacements = [
    { x: -0.5, y: 0.98, z: 2.08, tilt: 0.1 },
    { x: 0.46, y: -0.02, z: 2.4, tilt: -0.08 },
    { x: -0.34, y: -1.02, z: 2.16, tilt: 0.06 },
  ];
  cardTextures.forEach((texture, index) => {
    const material = new T.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
    });
    track(material);
    const mesh = new T.Mesh(cardGeometry, material);
    mesh.renderOrder = 3;
    mesh.visible = false;
    addLayer(mesh, 0.075, cardPlacements[index].z, { card: cardPlacements[index] });
  });

  let explode = -1;

  /** 0 = assembled, 1 = fully exploded. */
  function setExplode(amount) {
    const value = Math.min(1, Math.max(0, amount));
    if (Math.abs(value - explode) < 0.0005) return;
    explode = value;
    const eased = easeInOut(value);
    for (const layer of layers) {
      layer.mesh.position.z = layer.assembledZ + (layer.explodedZ - layer.assembledZ) * eased;
      if (layer.card) {
        // Cards stay hidden inside the phone until the layers have started to part.
        const reveal = Math.min(1, Math.max(0, (value - 0.35) / 0.5));
        const scale = 0.4 + 0.6 * reveal;
        layer.mesh.visible = reveal > 0.01;
        layer.mesh.material.opacity = reveal;
        layer.mesh.scale.set(scale, scale, 1);
        layer.mesh.position.x = layer.card.x * eased;
        layer.mesh.position.y = layer.card.y * eased;
        layer.mesh.rotation.z = layer.card.tilt * eased;
      }
    }
  }

  setExplode(0);

  function dispose() {
    for (const item of disposables) item.dispose();
  }

  return { group, setExplode, dispose };
}
