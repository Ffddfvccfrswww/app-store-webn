/* ==========================================================================
   TEXTURES — every image used by the 3D scene is painted here, in code.
   No photographs, logos or third-party artwork are loaded, so there is
   nothing to license and nothing to download.
   ========================================================================== */

/** Small deterministic random generator, so the scene looks the same on every visit. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(T, canvas) {
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ------------------------------ light sprites ----------------------------- */

export function createGlowTexture(T) {
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.12, 'rgba(255,244,222,0.85)');
  gradient.addColorStop(0.34, 'rgba(255,205,140,0.3)');
  gradient.addColorStop(0.68, 'rgba(255,170,90,0.07)');
  gradient.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return toTexture(T, canvas);
}

export function createStreakTexture(T) {
  const width = 512;
  const height = 64;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const horizontal = ctx.createLinearGradient(0, 0, width, 0);
  horizontal.addColorStop(0, 'rgba(120,225,255,0)');
  horizontal.addColorStop(0.35, 'rgba(140,230,255,0.35)');
  horizontal.addColorStop(0.5, 'rgba(255,255,255,1)');
  horizontal.addColorStop(0.65, 'rgba(140,230,255,0.35)');
  horizontal.addColorStop(1, 'rgba(120,225,255,0)');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, width, height);
  // Fade the streak towards its top and bottom edges.
  ctx.globalCompositeOperation = 'destination-in';
  const vertical = ctx.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, 'rgba(0,0,0,0)');
  vertical.addColorStop(0.5, 'rgba(0,0,0,1)');
  vertical.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, width, height);
  return toTexture(T, canvas);
}

/* ------------------------------- app icons -------------------------------- */

const ICON_PALETTES = [
  ['#ffc76a', '#f0782a'],
  ['#5ff0df', '#0f7f8c'],
  ['#b69cff', '#4a2fb3'],
  ['#ff8fa8', '#c2294f'],
  ['#7fb6ff', '#1f4fb0'],
  ['#c8f08a', '#3d8f3a'],
  ['#f6f1e6', '#9aa3ab'],
  ['#ffd98a', '#8a5a1e'],
];

function drawGlyph(ctx, kind, size) {
  const c = size / 2;
  const u = size / 100;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.strokeStyle = 'rgba(255,255,255,0.96)';
  ctx.lineWidth = 8 * u;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 8 * u;
  ctx.shadowOffsetY = 3 * u;

  switch (kind % 12) {
    case 0: // ring
      ctx.beginPath();
      ctx.arc(c, c, 22 * u, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 1: // play
      ctx.beginPath();
      ctx.moveTo(c - 14 * u, c - 22 * u);
      ctx.lineTo(c + 24 * u, c);
      ctx.lineTo(c - 14 * u, c + 22 * u);
      ctx.closePath();
      ctx.fill();
      break;
    case 2: // bars
      for (let i = 0; i < 3; i += 1) {
        const height = (18 + i * 14) * u;
        roundRect(ctx, c - 24 * u + i * 18 * u, c + 24 * u - height, 12 * u, height, 4 * u);
        ctx.fill();
      }
      break;
    case 3: // diamond
      ctx.beginPath();
      ctx.moveTo(c, c - 26 * u);
      ctx.lineTo(c + 22 * u, c);
      ctx.lineTo(c, c + 26 * u);
      ctx.lineTo(c - 22 * u, c);
      ctx.closePath();
      ctx.fill();
      break;
    case 4: // plus
      ctx.beginPath();
      ctx.moveTo(c, c - 22 * u);
      ctx.lineTo(c, c + 22 * u);
      ctx.moveTo(c - 22 * u, c);
      ctx.lineTo(c + 22 * u, c);
      ctx.stroke();
      break;
    case 5: // wave
      ctx.beginPath();
      ctx.moveTo(c - 28 * u, c);
      ctx.bezierCurveTo(c - 14 * u, c - 30 * u, c - 4 * u, c - 30 * u, c, c);
      ctx.bezierCurveTo(c + 4 * u, c + 30 * u, c + 14 * u, c + 30 * u, c + 28 * u, c);
      ctx.stroke();
      break;
    case 6: // star
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const radius = (i % 2 === 0 ? 27 : 12) * u;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const x = c + Math.cos(angle) * radius;
        const y = c + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 7: // speech bubble
      roundRect(ctx, c - 26 * u, c - 22 * u, 52 * u, 36 * u, 10 * u);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(c - 12 * u, c + 12 * u);
      ctx.lineTo(c - 18 * u, c + 28 * u);
      ctx.lineTo(c + 2 * u, c + 12 * u);
      ctx.closePath();
      ctx.fill();
      break;
    case 8: // signal arcs
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(c, c + 20 * u, (12 + i * 14) * u, Math.PI * 1.22, Math.PI * 1.78);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(c, c + 20 * u, 4 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 9: // four dots
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.arc(c + (i % 2 === 0 ? -13 : 13) * u, c + (i < 2 ? -13 : 13) * u, 9 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 10: // bolt
      ctx.beginPath();
      ctx.moveTo(c + 6 * u, c - 30 * u);
      ctx.lineTo(c - 18 * u, c + 4 * u);
      ctx.lineTo(c - 2 * u, c + 4 * u);
      ctx.lineTo(c - 8 * u, c + 30 * u);
      ctx.lineTo(c + 18 * u, c - 6 * u);
      ctx.lineTo(c + 2 * u, c - 6 * u);
      ctx.closePath();
      ctx.fill();
      break;
    default: // crescent
      ctx.beginPath();
      ctx.arc(c, c, 25 * u, Math.PI * 0.3, Math.PI * 1.7);
      ctx.arc(c + 13 * u, c, 20 * u, Math.PI * 1.55, Math.PI * 0.45, true);
      ctx.closePath();
      ctx.fill();
      break;
  }
  ctx.restore();
}

export function createIconTexture(T, index) {
  const size = 160;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const [from, to] = ICON_PALETTES[index % ICON_PALETTES.length];
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  // Soft highlight across the upper half, like light on glass.
  const shine = ctx.createLinearGradient(0, 0, 0, size);
  shine.addColorStop(0, 'rgba(255,255,255,0.32)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, size, size);
  drawGlyph(ctx, index, size);
  return toTexture(T, canvas);
}

export const ICON_VARIANTS = 16;

/* ------------------------------ phone screen ------------------------------ */

const DISPLAY_FONT = "'Oswald', 'Karantina', 'Rubik', 'PingFang SC', 'Hiragino Sans', 'Yu Gothic', 'Microsoft YaHei', sans-serif";

function wrapLines(ctx, text, maxWidth) {
  const hasSpaces = /\s/.test(text);
  const units = hasSpaces ? text.split(/\s+/) : Array.from(text);
  const joiner = hasSpaces ? ' ' : '';
  const lines = [];
  let line = '';
  for (const unit of units) {
    const candidate = line ? line + joiner + unit : unit;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = unit;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The glowing screen of the phone: a small film poster, redrawn when the language changes. */
export function createScreen(T) {
  const width = 512;
  const height = 1088;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const texture = toTexture(T, canvas);

  function draw({ label = '', title = '', rtl = false, colors = ['#0f6d80', '#04090d'] } = {}) {
    ctx.save();
    ctx.clearRect(0, 0, width, height);

    const background = ctx.createLinearGradient(0, 0, width * 0.4, height);
    background.addColorStop(0, colors[0]);
    background.addColorStop(0.62, colors[1]);
    background.addColorStop(1, '#020405');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    // Warm glow behind the emblem.
    const glow = ctx.createRadialGradient(width / 2, 340, 10, width / 2, 340, 380);
    glow.addColorStop(0, 'rgba(255,196,110,0.5)');
    glow.addColorStop(0.4, 'rgba(255,150,70,0.1)');
    glow.addColorStop(1, 'rgba(255,150,70,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Top sensor pill.
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundRect(ctx, width / 2 - 62, 26, 124, 30, 15);
    ctx.fill();

    // Emblem: a ring of light with a projector beam.
    ctx.save();
    ctx.translate(width / 2, 340);
    ctx.fillStyle = 'rgba(255,214,150,0.28)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(240, -150);
    ctx.lineTo(240, 150);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffd596';
    ctx.lineWidth = 16;
    ctx.shadowColor = 'rgba(255,170,80,0.9)';
    ctx.shadowBlur = 34;
    ctx.beginPath();
    ctx.arc(0, 0, 118, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff3da';
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Label.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.fillStyle = '#ffc36a';
    ctx.font = `500 30px ${DISPLAY_FONT}`;
    try {
      ctx.letterSpacing = rtl ? '0px' : '7px';
    } catch {
      /* older browsers: no letter spacing on canvas */
    }
    ctx.fillText(String(label).toUpperCase(), width / 2, 590);
    try {
      ctx.letterSpacing = '0px';
    } catch {
      /* ignore */
    }

    // Title, shrunk until it fits in three lines.
    const text = String(title).toUpperCase();
    let fontSize = 104;
    let lines = [];
    while (fontSize > 44) {
      ctx.font = `600 ${fontSize}px ${DISPLAY_FONT}`;
      lines = wrapLines(ctx, text, width - 84);
      const widest = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
      if (lines.length <= 3 && widest <= width - 84) break;
      fontSize -= 6;
    }
    ctx.fillStyle = '#fbf5ea';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18;
    const lineHeight = fontSize * 1.02;
    lines.slice(0, 3).forEach((line, index) => {
      ctx.fillText(line, width / 2, 690 + index * lineHeight);
    });
    ctx.shadowBlur = 0;

    // Billing block: thin decorative lines, like the small print on a film poster.
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    const rows = [300, 360, 250];
    rows.forEach((rowWidth, index) => {
      roundRect(ctx, (width - rowWidth) / 2, 918 + index * 18, rowWidth, 6, 3);
      ctx.fill();
    });

    // Call-to-action pill.
    const pill = ctx.createLinearGradient(0, 992, 0, 1050);
    pill.addColorStop(0, '#ffd089');
    pill.addColorStop(1, '#ff9440');
    ctx.fillStyle = pill;
    roundRect(ctx, width / 2 - 120, 992, 240, 58, 29);
    ctx.fill();
    ctx.fillStyle = '#1a0e02';
    ctx.beginPath();
    ctx.moveTo(width / 2 - 9, 1008);
    ctx.lineTo(width / 2 + 15, 1021);
    ctx.lineTo(width / 2 - 9, 1034);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    texture.needsUpdate = true;
  }

  draw();
  return { texture, draw };
}

/* -------------------------- inside of the phone --------------------------- */

export function createBoardTexture(T) {
  const width = 512;
  const height = 1088;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const random = seededRandom(20261110);

  ctx.fillStyle = '#04141a';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(69,224,208,0.1)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Glowing traces that run in straight segments, like a circuit board.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 46; i += 1) {
    let x = 40 + Math.floor(random() * 14) * 32;
    let y = 40 + Math.floor(random() * 32) * 32;
    const warm = random() > 0.45;
    ctx.strokeStyle = warm ? 'rgba(255,180,84,0.85)' : 'rgba(69,224,208,0.7)';
    ctx.lineWidth = warm ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 2 + Math.floor(random() * 4);
    for (let s = 0; s < segments; s += 1) {
      if (s % 2 === 0) x = Math.min(width - 40, Math.max(40, x + (Math.floor(random() * 7) - 3) * 32));
      else y = Math.min(height - 40, Math.max(40, y + (Math.floor(random() * 9) - 4) * 32));
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = warm ? '#ffd596' : '#9ff5ea';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Chips.
  for (let i = 0; i < 9; i += 1) {
    const chipWidth = 60 + Math.floor(random() * 3) * 32;
    const chipHeight = 60 + Math.floor(random() * 3) * 32;
    const x = 48 + Math.floor(random() * 10) * 32;
    const y = 60 + Math.floor(random() * 28) * 32;
    ctx.fillStyle = '#0b222b';
    roundRect(ctx, x, y, chipWidth, chipHeight, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,180,84,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  return toTexture(T, canvas);
}

/** Small floating interface cards that fly out of the phone in the exploded view. */
export function createCardTexture(T, kind) {
  const width = 384;
  const height = 224;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(8,16,22,0.94)';
  roundRect(ctx, 0, 0, width, height, 34);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 3;
  roundRect(ctx, 2, 2, width - 4, height - 4, 32);
  ctx.stroke();

  if (kind === 0) {
    // "Sponsored" label card: a tag shape with two text bars.
    ctx.fillStyle = '#ffb454';
    roundRect(ctx, 34, 44, 96, 96, 22);
    ctx.fill();
    ctx.fillStyle = '#1a0e02';
    ctx.beginPath();
    ctx.arc(64, 74, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, 156, 58, 180, 18, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    roundRect(ctx, 156, 96, 132, 14, 7);
    ctx.fill();
    roundRect(ctx, 34, 168, 300, 12, 6);
    ctx.fill();
  } else if (kind === 1) {
    // Store button card: a bright pill with a play arrow.
    const pill = ctx.createLinearGradient(0, 60, 0, 164);
    pill.addColorStop(0, '#ffd089');
    pill.addColorStop(1, '#ff9440');
    ctx.fillStyle = pill;
    roundRect(ctx, 40, 62, width - 80, 100, 50);
    ctx.fill();
    ctx.fillStyle = '#1a0e02';
    ctx.beginPath();
    ctx.moveTo(96, 86);
    ctx.lineTo(140, 112);
    ctx.lineTo(96, 138);
    ctx.closePath();
    ctx.fill();
    roundRect(ctx, 164, 102, 150, 20, 10);
    ctx.fill();
  } else {
    // Language card: a globe with three bars.
    ctx.strokeStyle = '#45e0d0';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(88, 112, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(88, 112, 22, 50, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(38, 112);
    ctx.lineTo(138, 112);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, 170, 66, 170, 18, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    roundRect(ctx, 170, 104, 130, 14, 7);
    ctx.fill();
    roundRect(ctx, 170, 138, 150, 14, 7);
    ctx.fill();
  }

  return toTexture(T, canvas);
}
