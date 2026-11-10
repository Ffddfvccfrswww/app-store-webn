/* ==========================================================================
   SHOTS — the shot list of the film
   Every section of the page that carries data-shot="name" is a camera
   position. While the visitor scrolls from one section to the next, the
   scene blends between the two shots.

   Units: the phone is 3.2 tall. The camera looks down the negative Z axis.
     cam      camera position           look     point the camera looks at
     phone    phone position            rot      phone rotation (radians)
     scale    phone size                explode  0 assembled … 1 exploded
     beam     projector beam strength   flare    lens flare strength
     bokeh    background lights         aim      where the beam points
                                                 (omit = follow the phone)
     formation  how the app tiles arrange themselves (see icons.js)
     dim      how much the page darkens the scene for readable text (0–1)
     bars     cinema letterbox bars (0 hidden … 1 shown)
   ========================================================================== */

const OFFSTAGE = [0, 6.4, -4];

export const SHOTS = {
  hero: {
    cam: [0, 0.15, 8.6],
    look: [0.2, 0, 0],
    phone: [2.25, -0.05, 0],
    rot: [0.06, -0.52, 0.05],
    scale: 1,
    explode: 0,
    beam: 1,
    flare: 1,
    bokeh: 0.6,
    formation: 'orbit',
    dim: 0,
    bars: 1,
  },
  crowd: {
    cam: [0, 0.3, 10.2],
    look: [0, 0, 0],
    phone: [2.9, 0.3, -1.6],
    rot: [0.25, -1.25, 0.22],
    scale: 0.82,
    explode: 0,
    beam: 0.55,
    flare: 0.7,
    bokeh: 0.95,
    formation: 'chaos',
    dim: 0.1,
    bars: 0,
  },
  prod1: {
    cam: [0, 0.2, 8.3],
    look: [0.4, 0, 0],
    phone: [2.3, 0, 0],
    rot: [0.04, -0.78, 0],
    scale: 1,
    explode: 0.1,
    beam: 0.85,
    flare: 0.8,
    bokeh: 0.5,
    formation: 'halo',
    dim: 0.08,
    bars: 0,
  },
  prod2: {
    cam: [0, 0.25, 8.3],
    look: [0.4, 0, 0],
    phone: [2.25, 0, 0],
    rot: [0.1, -1.02, 0.04],
    scale: 1,
    explode: 0.62,
    beam: 0.85,
    flare: 0.8,
    bokeh: 0.5,
    formation: 'halo',
    dim: 0.08,
    bars: 0,
  },
  prod3: {
    cam: [0, 0.3, 8.5],
    look: [0.4, 0, 0],
    phone: [2.1, 0, 0],
    rot: [0.14, -0.74, -0.05],
    scale: 1,
    explode: 1,
    beam: 0.9,
    flare: 0.85,
    bokeh: 0.5,
    formation: 'halo',
    dim: 0.08,
    bars: 0,
  },
  prod4: {
    cam: [0, 0.15, 8.1],
    look: [0.4, 0, 0],
    phone: [2.25, 0, 0],
    rot: [0.03, -0.3, 0],
    scale: 1.04,
    explode: 0,
    beam: 1.25,
    flare: 1.1,
    bokeh: 0.55,
    formation: 'orbit',
    dim: 0.05,
    bars: 0,
  },
  showing: {
    cam: [0, 0.5, 10.5],
    look: [0, 0.6, 0],
    phone: OFFSTAGE,
    rot: [0.5, -0.2, 0],
    scale: 0.7,
    explode: 0,
    beam: 0.3,
    flare: 0.4,
    bokeh: 1,
    formation: 'wall',
    aim: [0, -1, 0],
    dim: 0.64,
    bars: 0,
  },
  honest: {
    cam: [0, 0.2, 10],
    look: [0, 0, 0],
    phone: OFFSTAGE,
    rot: [0.5, -0.2, 0],
    scale: 0.7,
    explode: 0,
    beam: 0.35,
    flare: 0.3,
    bokeh: 0.9,
    formation: 'drift',
    aim: [0, -1, 0],
    dim: 0.7,
    bars: 0,
  },
  tickets: {
    cam: [0, -0.2, 9.4],
    look: [0, 0, 0],
    phone: OFFSTAGE,
    rot: [0.5, -0.2, 0],
    scale: 0.7,
    explode: 0,
    beam: 0.7,
    flare: 0.5,
    bokeh: 0.8,
    formation: 'drift',
    aim: [0, -1.5, 0],
    dim: 0.6,
    bars: 0,
  },
  faq: {
    cam: [0, 0, 9.6],
    look: [0, 0, 0],
    phone: OFFSTAGE,
    rot: [0.5, -0.2, 0],
    scale: 0.7,
    explode: 0,
    beam: 0.3,
    flare: 0.3,
    bokeh: 0.6,
    formation: 'drift',
    aim: [0, -1.5, 0],
    dim: 0.7,
    bars: 0,
  },
  finale: {
    cam: [0, 0, 8.8],
    look: [0, 0, 0],
    phone: [0, 0.3, -2.6],
    rot: [0, 0, 0],
    scale: 1.25,
    explode: 0,
    beam: 1.3,
    flare: 1.25,
    bokeh: 0.7,
    formation: 'frame',
    dim: 0.36,
    bars: 1,
  },
};

/** Changes for tall, narrow screens: the phone moves above the text. */
const NARROW = {
  hero: { cam: [0, 0.3, 11.6], look: [0, 0.5, 0], phone: [0, 1.95, 0], scale: 0.78, rot: [0.08, -0.38, 0.03] },
  crowd: { cam: [0, 0.3, 13], look: [0, 0.4, 0], phone: [0.5, 2.2, -1.5], scale: 0.68 },
  prod1: { cam: [0, 0.3, 11.8], look: [0, 0.4, 0], phone: [0, 1.85, 0], scale: 0.74 },
  prod2: { cam: [0, 0.3, 11.8], look: [0, 0.4, 0], phone: [0, 1.85, 0], scale: 0.74 },
  prod3: { cam: [0, 0.3, 12.2], look: [0, 0.4, 0], phone: [0, 1.85, 0], scale: 0.74 },
  prod4: { cam: [0, 0.3, 11.6], look: [0, 0.4, 0], phone: [0, 1.85, 0], scale: 0.78 },
  showing: { phone: [0, 8.5, -4], dim: 0.7 },
  honest: { phone: [0, 8.5, -4], dim: 0.74 },
  tickets: { phone: [0, 8.5, -4], dim: 0.68 },
  faq: { phone: [0, 8.5, -4], dim: 0.74 },
  finale: { cam: [0, 0, 12], phone: [0, 0.6, -2.6], scale: 1.02, dim: 0.46 },
};

const VECTOR_KEYS = ['cam', 'look', 'phone', 'rot', 'aim'];
const NUMBER_KEYS = ['scale', 'explode', 'beam', 'flare', 'bokeh', 'dim', 'bars'];

/**
 * Resolve one shot for the current screen.
 * @param {string} name
 * @param {{narrow: boolean, mirror: number, aspect: number}} view
 *        mirror is -1 for right-to-left languages, so the phone sits opposite the text.
 */
export function resolveShot(name, view) {
  const base = SHOTS[name] || SHOTS.hero;
  const override = view.narrow ? NARROW[name] || {} : {};
  const shot = { ...base, ...override };

  // On narrower desktop windows, pull the phone in so it stays in frame.
  const reach = view.narrow ? 1 : Math.min(1.12, Math.max(0.6, view.aspect / 1.78));
  const out = { formation: shot.formation, followPhone: !shot.aim };

  out.cam = [shot.cam[0] * view.mirror, shot.cam[1], shot.cam[2]];
  out.look = [shot.look[0] * view.mirror * reach, shot.look[1], shot.look[2]];
  out.phone = [shot.phone[0] * view.mirror * reach, shot.phone[1], shot.phone[2]];
  out.rot = [shot.rot[0], shot.rot[1] * view.mirror, shot.rot[2] * view.mirror];
  out.aim = shot.aim ? [shot.aim[0] * view.mirror, shot.aim[1], shot.aim[2]] : out.phone.slice();
  for (const key of NUMBER_KEYS) out[key] = shot[key];
  return out;
}

/** Blend two resolved shots. t = 0 gives `from`, t = 1 gives `to`. */
export function blendShots(from, to, t) {
  const out = { formation: t < 0.5 ? from.formation : to.formation };
  for (const key of VECTOR_KEYS) {
    out[key] = [
      from[key][0] + (to[key][0] - from[key][0]) * t,
      from[key][1] + (to[key][1] - from[key][1]) * t,
      from[key][2] + (to[key][2] - from[key][2]) * t,
    ];
  }
  for (const key of NUMBER_KEYS) out[key] = from[key] + (to[key] - from[key]) * t;
  return out;
}
