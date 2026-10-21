/*
 * Balloons: the 10-stage balloon animation (concept, replaces the hanging).
 *
 * The character floats under a bunch of 10 balloons. Stage N is shown after
 * N wrong guesses: N balloons have popped and the character sinks a little
 * lower each time (more per pop as the lift runs out). At stage 10 the last
 * balloon pops, the character hangs in the air for a beat, then drops like a
 * stone and lands hard on its bottom: a big squash, a shake, one bounce, dust
 * and cracks in the ground. It ends up sitting there seeing stars: dazed,
 * never hurt. Shorter limits map the same way as before:
 *   stage = Math.round(wrong * 10 / maxWrong)
 *
 * Built on the shared rig from rig.js, so it works on every character, and
 * it keeps the API of hanging.js (STAGES, frame, scene, SCENE, DURATION) so
 * the app can swap one for the other.
 *
 * The app shows the scene through a camera (CAMERA, f.cam): a window 440
 * units tall that follows the character down, a little slower than it sinks,
 * so the character stays big in a short scene card. scene() also takes
 * { sky: false } (the app draws its own sky and sun) and { clouds: false }.
 *
 * Every forward step: the balloon swells and pops (the first POP of the
 * transition), then the character drops with a springy bounce. A stage can
 * instead list `beats`: keyframes it passes through on the way (stage 10).
 */
(function (global) {
  const { render, tube, OUTLINE, SW, JOINTS } = global.HangedRig;

  const SCENE = { w: 400, h: 600 };
  const GROUND = 560;
  const SCALE = 0.75; // the character's size in the scene
  const BASE = [100, 186]; // bottom of the body, in character units: tx/ty place this point
  const PAW = 21; // shoulder -> paw, in character units (armShape in rig.js)
  const LAND_X = 200; // where the character hits the ground
  const HOP = 0.3; // share of the landing spent on the bounce after the first hit
  const CAMERA = { x: -400, w: SCENE.w + 800, h: 440 }; // the app's window; the grass runs 400 past each side
  const POP = 0.16; // share of a forward transition spent on the pop, before the drop

  const SKY = '#dff1ff';
  const GRASS = '#bfe6a8';
  const HILL = '#d4efc1';
  const CLOD = '#a8d48f';

  // The bunch, in character units: [x, y, colour], back to front
  const BALLOONS = [
    [104, -172, '#ff6f91'],
    [152, -170, '#7fcaff'],
    [128, -146, '#ffd34d'],
    [78, -140, '#b58cff'],
    [178, -138, '#8fd16f'],
    [148, -112, '#ff9f5a'],
    [96, -108, '#5fd3c4'],
    [186, -100, '#ff8fd1'],
    [66, -92, '#9fb4ff'],
    [122, -80, '#ff7a7a'],
  ];
  // Balloon popped by each wrong guess: outer ones first, the last one sits on top
  const POP_ORDER = [8, 7, 0, 9, 3, 4, 6, 1, 5, 2];
  const RANK = [];
  POP_ORDER.forEach((b, k) => (RANK[b] = k));

  const A = (o) => ({ head: 0, armL: 28, armR: -138, legL: 0, legR: 0, tail: 0, ...o });
  const alt = (n) => 300 + 150 * Math.pow(n / 9, 1.4); // body bottom y while floating with 10 - n balloons

  // Keyframes. Fields left out are inherited from the previous stage.
  const RAW = [
    { label: 'Floats along', expr: 'happy', tx: 190, ty: alt(0), rot: 0, stars: 0, a: A({ armL: 140, head: -4 }), loop: 'wave' },
    { label: 'Pop! No worries', tx: 196, ty: alt(1), a: A({ head: -2 }), loop: 'float' },
    { label: 'Swings its feet', tx: 202, ty: alt(2), a: A({ armL: 40 }), loop: 'swing' },
    { label: 'Hmm…', expr: 'nervous', tx: 206, ty: alt(3), a: A({ armL: 20, head: 8 }), loop: 'float' },
    { label: 'Holds on tight', tx: 204, ty: alt(4), a: A({ armL: -24, head: 4 }) },
    { label: 'Sinking', expr: 'worried', tx: 200, ty: alt(5), a: A({ armL: 60 }), loop: 'kick' },
    { label: 'Flaps to stay up', tx: 196, ty: alt(6), a: A({ armL: 100, head: -4 }), loop: 'flap' },
    { label: 'Uh-oh', expr: 'scared', tx: 200, ty: alt(7), a: A({ armL: 125, head: 4 }), loop: 'panic' },
    { label: 'Two left', tx: 198, ty: alt(8), a: A({ armL: 135, head: -4 }) },
    { label: 'The last balloon', tx: 200, ty: alt(9), a: A({ armL: 150, armR: -150, head: 4 }), loop: 'cling' },
    { label: 'Thud! Hits the ground', dur: 2200, loop: 'dazed', loopOut: 0.3, loopIn: 0.75, beats: [
      { until: POP }, // the last balloon pops
      // It hangs in the air for a beat, holding the empty string, and looks down...
      { until: 0.38, expr: 'nervous', ty: alt(9) - 6, a: A({ armL: 28, armR: -150, head: 12 }), limp: true },
      // ...drops like a stone...
      { until: 0.6, ease: 'fall', expr: 'scared', tx: LAND_X, ty: GROUND, a: A({ armL: 165, armR: -165, legL: 22, legR: -22, head: -8 }) },
      // ...and lands hard on its bottom, legs splayed, seeing stars but fine
      { until: 1, ease: 'spring', impact: true, expr: 'ko', stars: 1,
        a: A({ armL: 62, armR: -62, legL: 78, legR: -78, head: 14, tail: 30 }) },
    ] },
  ];

  const ONE_OFF = { ease: undefined, exprAt: undefined, impact: undefined, limp: undefined, dur: undefined, loopIn: undefined, loopOut: undefined, beats: undefined };
  const merge = (prev, s) => ({ ...prev, ...ONE_OFF, ...s, a: { ...prev.a, ...s.a } });
  const STAGES = [];
  RAW.forEach((s, i) => {
    const prev = STAGES[i - 1] || {};
    if (!s.beats) return STAGES.push(merge(prev, s));
    let k = prev;
    const beats = s.beats.map(({ until, ease, ...b }) => ({ at: until, ease, k: (k = merge(k, b)) }));
    STAGES.push({ ...k, ...s, beats });
  });

  // Looping motion per stage: returns offsets for time t (seconds). rot swings around the paw.
  const bob = (t) => ({ ty: Math.sin(t * 1.8) * 3, rot: Math.sin(t * 1.3) * 3, tail: Math.sin(t * 3) * 10,
    legL: Math.sin(t * 1.3 + 0.6) * 6, legR: Math.sin(t * 1.3 + 0.6) * 6 });
  const LOOPS = {
    float: bob,
    wave: (t) => ({ ...bob(t), armL: Math.sin(t * 9) * 20 }),
    swing: (t) => ({ ...bob(t), legL: Math.sin(t * 4) * 20, legR: -Math.sin(t * 4) * 20 }),
    kick: (t) => ({ ...bob(t), legL: Math.sin(t * 8) * 14, legR: -Math.sin(t * 8) * 14 }),
    flap: (t) => ({ ...bob(t), armL: Math.sin(t * 13) * 26, ty: Math.sin(t * 13) * 1.5 }),
    panic: (t) => ({ ty: Math.sin(t * 2) * 2, rot: Math.sin(t * 4) * 5, legL: Math.sin(t * 12) * 20, legR: -Math.sin(t * 12) * 20,
      armL: Math.sin(t * 14) * 22, head: Math.sin(t * 9) * 3, tail: Math.sin(t * 8) * 18 }),
    cling: (t) => ({ rot: Math.sin(t * 2.2) * 5, tx: Math.sin(t * 40) * 0.6, legL: Math.sin(t * 6) * 10, legR: Math.sin(t * 6 + 1) * 10,
      armL: Math.sin(t * 30) * 3 }),
    dazed: (t) => ({ head: Math.sin(t * 2.4) * 6, armL: Math.sin(t * 2.4) * 4, armR: -Math.sin(t * 2.4 + 0.5) * 4, tail: Math.sin(t * 2) * 8 }),
  };

  const lerp = (a, b, p) => a + (b - a) * p;
  const clamp = (p) => Math.max(0, Math.min(1, p));
  const EASE = {
    default: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    spring: (p) => 1 - Math.exp(-6 * p) * Math.cos(11 * p), // overshoots then settles: the bob of the balloons
    fall: (p) => Math.pow(p, 2.4),
  };

  // Camera top: follows the character down at 60% of its speed, from the sky to the ground
  const camAt = (ty) => Math.max(0, Math.min(SCENE.h - CAMERA.h, (ty - alt(0)) * 0.6));

  // Keyframes a transition passes through, each with the p at which it is reached
  function keysFor(from, to) {
    const S0 = STAGES[from], S1 = STAGES[to];
    if (to === from + 1 && S1.beats) return [{ at: 0, k: S0 }, ...S1.beats];
    if (to > from) return [{ at: 0, k: S0 }, { at: POP, k: S0 }, { at: 1, k: S1, ease: 'spring' }];
    return [{ at: 0, k: S0 }, { at: 1, k: S1 }];
  }

  // The pose at a point between stage `from` and stage `to` (p: 0..1), plus loops at time t.
  function frame(from, to, p, t, loops = true) {
    const keys = keysFor(from, to);
    let i = 1;
    while (i < keys.length - 1 && p > keys[i].at) i++;
    const k0 = keys[i - 1].k, k1 = keys[i].k;
    const lp = clamp((p - keys[i - 1].at) / (keys[i].at - keys[i - 1].at || 1));
    const e = (EASE[keys[i].ease] || EASE.default)(lp);
    const f = {
      from, to, p, t,
      expr: lp < (k1.exprAt || 0) ? k0.expr : k1.expr,
      tx: lerp(k0.tx, k1.tx, e),
      ty: lerp(k0.ty, k1.ty, e),
      rot: lerp(k0.rot, k1.rot, e),
      stars: clamp(lerp(k0.stars, k1.stars, e)),
      limp: !!k1.limp,
      impact: k1.impact && to === from + 1 ? lp : -1, // 0..1 after hitting the ground, else -1
      a: {},
    };
    for (const k in k1.a) f.a[k] = lerp(k0.a[k], k1.a[k], e);
    f.cam = camAt(f.ty); // from the keyframes only: the camera ignores the loops and the bounce
    // The hit: a hard squash and a hop, then a smaller squash on the second touch, and the scene shakes
    const hit = (x, amp) => (x < 0 ? 0 : amp * Math.exp(-7 * x) * Math.cos(16 * x));
    f.squash = f.impact >= 0 ? hit(f.impact, 0.36) + hit(f.impact - HOP, 0.14) : 0;
    f.shake = f.impact >= 0 ? Math.sin(f.impact * 90) * 7 * Math.exp(-8 * f.impact) : 0;
    if (f.impact >= 0 && f.impact < HOP) f.ty -= 28 * Math.sin((Math.PI * f.impact) / HOP);

    // Cross-fade the loops; a stage can hold its loop back (stage 10 freezes mid-air)
    if (loops) {
      const S1 = STAGES[to], inAt = S1.loopIn || 0;
      const w = [1 - clamp(p / (S1.loopOut || 1)), clamp((p - inAt) / (1 - inAt))];
      [STAGES[from].loop, S1.loop].forEach((name, j) => {
        const o = LOOPS[name] ? LOOPS[name](t) : {};
        for (const k in o) {
          if (k in f.a) f.a[k] += o[k] * w[j];
          else f[k] += o[k] * w[j];
        }
      });
    }
    return f;
  }

  // ---- shapes ----
  const starPath = (n, R, r) => {
    let d = '';
    for (let i = 0; i < n * 2; i++) {
      const a = (Math.PI * i) / n - Math.PI / 2, k = i % 2 ? r : R;
      d += `${i ? 'L' : 'M'}${(Math.cos(a) * k).toFixed(1)},${(Math.sin(a) * k).toFixed(1)}`;
    }
    return d + 'Z';
  };
  const STAR = starPath(5, 8, 3.6);
  const BURST = starPath(8, 24, 11);
  const BALLOON = 'M0,-27 C15,-27 23,-15 23,-2 C23,13 11,24 0,28 C-11,24 -23,13 -23,-2 C-23,-15 -15,-27 0,-27 Z';
  const KNOT_Y = 33; // bottom of the balloon knot, where the string starts

  function balloon(x, y, col, st, t) {
    const wob = st.shake ? Math.sin(t * 70) * 6 : 0;
    return `<g transform="translate(${x} ${y}) rotate(${wob}) scale(${st.scale})">` +
      `<path d="M-5,${KNOT_Y} L0,27 L5,${KNOT_Y} Z" fill="${col}" stroke="${OUTLINE}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="${BALLOON}" fill="${col}" stroke="${OUTLINE}" stroke-width="${SW}"/>` +
      `<ellipse cx="-9" cy="-12" rx="4.5" ry="8" transform="rotate(28 -9 -12)" fill="#fff" opacity=".6"/>` +
      `</g>`;
  }

  // b: 0..1 through the pop. A white star flash, rays, then rubber scraps falling
  function burst(x, y, col, b) {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      const a = ((i * 45 + 22.5) * Math.PI) / 180, r1 = 18 + b * 22, r2 = 26 + b * 34;
      rays += `M${x + Math.cos(a) * r1},${y + Math.sin(a) * r1} L${x + Math.cos(a) * r2},${y + Math.sin(a) * r2}`;
    }
    const scraps = [-1, 0.3, 1].map((d, j) =>
      `<g transform="translate(${x + d * b * 34} ${y + b * b * 50 + j * 5}) rotate(${b * 260 * d})">${tube('M-5,0 q2.5,-5 5,0 q2.5,5 5,0', 3, col)}</g>`).join('');
    return `<g opacity="${(1 - b).toFixed(2)}">` +
      (b < 0.5 ? `<path transform="translate(${x} ${y}) scale(${0.8 + b * 0.9})" d="${BURST}" fill="${col}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>` +
        `<path transform="translate(${x} ${y}) scale(${0.4 + b * 0.5})" d="${BURST}" fill="#fff"/>` : '') +
      `<path d="${rays}" stroke="${OUTLINE}" stroke-width="8" stroke-linecap="round"/><path d="${rays}" stroke="${col}" stroke-width="4" stroke-linecap="round"/>${scraps}</g>`;
  }

  // Present, popping (swell then burst), gone, or re-inflating when stepping back
  function balloonState(k, f) {
    const was = k >= f.from, is = k >= f.to;
    if (was && is) return { scale: 1 };
    if (!was && !is) return null;
    if (!was) return { scale: EASE.default(f.p) };
    if (f.p < POP) return { scale: 1 + 0.22 * (f.p / POP), shake: true };
    const b = (f.p - POP) / 0.4;
    return b < 1 ? { burst: b } : null;
  }

  // Over the head (turns with it): stars circling
  function dazed(f) {
    let stars = '';
    for (let j = 0; j < 3; j++) {
      const a = f.t * 3.2 + (j * 2 * Math.PI) / 3;
      stars += `<path transform="translate(${100 + Math.cos(a) * 50} ${18 + Math.sin(a) * 11}) scale(${1 + Math.sin(a) * 0.25}) rotate(${f.t * 90})" d="${STAR}" fill="#ffd34d" stroke="${OUTLINE}" stroke-width="2.2" stroke-linejoin="round"/>`;
    }
    return `<g opacity="${f.stars.toFixed(2)}" transform="rotate(${f.a.head} ${JOINTS.neck[0]} ${JOINTS.neck[1]})">` +
      stars + `</g>`;
  }

  // ---- scenery ----
  let uid = 0;
  const cloud = (x, y, sc) => {
    const puffs = [[-22, 0, 14], [0, -10, 20], [22, -2, 15], [36, 6, 10], [-36, 6, 10]];
    const shape = (extra) => puffs.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${extra}/>`).join('') +
      `<rect x="-46" y="4" width="92" height="12" rx="6" ${extra}/>`;
    return `<g transform="translate(${x} ${y}) scale(${sc})">${shape('fill="#c9e2f5" stroke="#c9e2f5" stroke-width="6"')}${shape('fill="#fff"')}</g>`;
  };
  // x, y, scale, drift speed. Spread over the camera's width, so they also scroll past as it pans down.
  const CLOUDS = [[40, 70, 1, 6], [250, 150, 0.8, 4], [140, 300, 0.65, 3], [-250, 190, 0.9, 5],
    [560, 80, 0.75, 4], [620, 330, 0.7, 3], [-180, 400, 0.6, 4], [330, 440, 0.7, 5]];
  const clouds = (t) =>
    CLOUDS.map(([x, y, sc, v]) => cloud((((x + t * v - CAMERA.x) % CAMERA.w) + CAMERA.w) % CAMERA.w + CAMERA.x, y, sc)).join('');

  function sky() {
    const id = `bsky${++uid}`;
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY}"/><stop offset="1" stop-color="#fbf6ff"/></linearGradient></defs>` +
      `<rect x="${CAMERA.x}" y="0" width="${CAMERA.w}" height="${GROUND}" fill="url(#${id})"/>` +
      `<circle cx="330" cy="62" r="26" fill="#ffe58a" stroke="#f5c84b" stroke-width="3"/>`;
  }
  const hills = () =>
    `<ellipse cx="40" cy="${GROUND + 6}" rx="150" ry="58" fill="${HILL}"/><ellipse cx="370" cy="${GROUND + 8}" rx="130" ry="44" fill="${HILL}"/>`;

  // Grass runs past the scene edges so wider crops stay filled
  const ground = () =>
    `<path d="M-400,${GROUND} H${SCENE.w + 400} V${SCENE.h} H-400 Z" fill="${GRASS}"/>` +
    `<path d="M-400,${GROUND} H${SCENE.w + 400}" stroke="${OUTLINE}" stroke-width="${SW}"/>` +
    [[24, 20], [92, 28], [330, 18], [376, 28]].map(([x, y]) =>
      `<g transform="translate(${x} ${GROUND + y})"><circle r="4.5" fill="#fff" stroke="${OUTLINE}" stroke-width="2"/><circle r="1.8" fill="#ffd34d"/></g>`).join('');

  // Cracks left in the ground where the character landed
  const cracks = () =>
    `<path d="M${LAND_X - 12},${GROUND} l-12,10 l-10,-2 l-12,12 M${LAND_X + 8},${GROUND} l10,12 l14,-3 l8,12 M${LAND_X - 2},${GROUND} l2,16" ` +
    `fill="none" stroke="${OUTLINE}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

  // Dust clouds, flying clods of earth and impact lines, lt: 0..1 after the hit
  const CLODS = [[-1.3, 1], [-0.7, 1.5], [0.6, 1.6], [1.2, 1.1]];
  function dust(lt) {
    const puffs = [-1, 1].flatMap((d) => [0, 1].map((j) =>
      `<circle cx="${LAND_X + d * (34 + j * 24 + lt * 40)}" cy="${GROUND - 10 - j * 8 - lt * 10}" r="${(14 - j * 4) * (0.6 + lt)}" fill="#fff" stroke="#e8dfd0" stroke-width="2"/>`)).join('');
    const clods = CLODS.map(([vx, vy]) =>
      `<circle cx="${LAND_X + vx * (20 + lt * 70)}" cy="${GROUND - vy * lt * 100 + lt * lt * 100}" r="3.5" fill="${CLOD}" stroke="${OUTLINE}" stroke-width="2"/>`).join('');
    const lines = lt < 0.35 ? [-1, 1].map((d) =>
      `<path d="M${LAND_X + d * 48},${GROUND - 34} l${d * 14},-14 M${LAND_X + d * 56},${GROUND - 16} l${d * 20},-4" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`).join('') : '';
    return `<g opacity="${(1 - lt).toFixed(2)}">${puffs}${clods}${lines}</g>`;
  }

  // Paw of the right arm (it holds the strings), in character units
  function pawAt(deg) {
    const r = (deg * Math.PI) / 180, [x, y] = JOINTS.shoulderR;
    return [x - PAW * Math.sin(r), y + PAW * Math.cos(r)];
  }

  function scene(c, f, { sky: withSky = true, clouds: withClouds = true } = {}) {
    const [px, py] = pawAt(f.a.armR);
    const t = f.t || 0;
    let strings = '', bunch = '';
    BALLOONS.forEach(([bx, by, col], i) => {
      const st = balloonState(RANK[i], f);
      if (!st) return;
      const x = bx + Math.sin(t * 1.1 + i * 1.7) * 3, y = by + Math.cos(t * 1.3 + i) * 2.5;
      if (st.burst != null) return (bunch += burst(x, y, col, st.burst));
      const ky = y + KNOT_Y * st.scale;
      strings += `M${x},${ky} Q${(x + px) / 2 + Math.sin(t * 1.5 + i) * 5},${(ky + py) / 2} ${px},${py}`;
      bunch += balloon(x, y, col, st, t);
    });
    // After the last pop, the empty string droops from the paw with a scrap of rubber
    const last = BALLOONS[POP_ORDER[9]][2];
    const limp = f.limp
      ? `<path d="M${px},${py} q24,14 20,42 q-4,18 8,30" fill="none" stroke="${OUTLINE}" stroke-width="2" stroke-linecap="round"/>` +
        `<g transform="translate(${px + 30} ${py + 74})">${tube('M-5,0 q2.5,-5 5,0 q2.5,5 5,0', 3, last)}</g>`
      : '';

    const sq = f.squash;
    const character =
      `<g transform="translate(${f.tx} ${f.ty}) scale(${SCALE * (1 + sq * 0.5)} ${SCALE * (1 - sq)}) translate(${-BASE[0]} ${-BASE[1]})">` +
      `<g transform="rotate(${-f.rot * 0.4} ${px} ${py})">` +
      `<path d="${strings}" fill="none" stroke="${OUTLINE}" stroke-width="2" stroke-linecap="round" opacity=".85"/>${limp}${bunch}</g>` +
      `<g transform="rotate(${f.rot} ${px} ${py})">` +
      render(c, { bare: true, expr: f.expr, angles: f.a, over: f.stars > 0.01 ? dazed(f) : '' }) +
      `</g></g>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCENE.w} ${SCENE.h}" class="balloon-scene">` +
      `<g transform="translate(0 ${f.shake.toFixed(2)})">` +
      (withSky ? sky() : '') + (withClouds ? clouds(t) : '') + hills() + ground() + (f.stars > 0.01 ? cracks() : '') + character +
      (f.impact >= 0 && f.impact < 1 ? dust(f.impact) : '') +
      `</g></svg>`;
  }

  const DURATION = 900; // ms per stage transition, unless the stage sets `dur`

  global.BalloonAnim = { STAGES, LOOPS, BALLOONS, POP_ORDER, frame, scene, SCENE, CAMERA, DURATION };
})(typeof window !== 'undefined' ? window : globalThis);
