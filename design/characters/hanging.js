/*
 * Hanged: the 10-stage hanging animation.
 *
 * Stage N is shown after N wrong guesses (0 = round start, 10 = hanged).
 * With a lower wrong-guess limit (hard levels), map the count to a stage:
 *   stage = Math.round(wrong * 10 / maxWrong)
 *
 * Every stage is a keyframe that drives the shared rig from rig.js, so it
 * works on every character with no per-character animation. Each stage
 * also has a looping motion (breathing, wobbling, swinging...). Moving to
 * the next stage tweens the numbers and cross-fades the loops.
 */
(function (global) {
  const { render, tube, OUTLINE, SW } = global.HangedRig;

  const ROPE = '#ecc47f';
  const WOOD = '#c98f5a';
  const WOOD_LINE = '#a8703f';
  const STOOL = '#f2b57c';
  const GRASS = '#bfe6a8';

  const SCENE = { w: 480, h: 470 };
  const GROUND = 430;
  const HANG = [250, 54]; // where the rope leaves the beam
  const SEAT = 64; // stool height
  const FEET = 205; // bottom of the feet, in character units
  const STAND = GROUND - FEET; // character y when standing on the ground
  const ON_STOOL = STAND - SEAT; // character y when standing on the stool
  const PIVOTS = { feet: [100, FEET], neck: [100, 124] };
  const KNOT = [130, 111]; // noose knot, in character units (beside the neck)

  const A = (o) => ({ head: 0, armL: 28, armR: -28, legL: 0, legR: 0, tail: 0, ...o });

  // Keyframes. Fields left out are inherited from the previous stage.
  const RAW = [
    { label: 'Says hi', expr: 'happy', tx: 260, ty: STAND, rot: 0, pivot: 'feet', a: A({ armR: -150, head: -4 }),
      coil: 'ground', rope: 'none', stool: { x: 130, rot: 0 }, swing: 0, arc: 0, loop: 'wave' },
    { label: 'Picks up a rope', a: A({ armL: -28, armR: 28, head: -4 }), tx: 205, coil: 'held', loop: 'idle', arc: -10 },
    { label: 'Throws it over the beam', expr: 'nervous', tx: 215, a: A({ armL: 135, armR: -128, head: -8 }), coil: 'none', rope: 'thrown', arc: -22 },
    { label: 'Ties a noose', a: A({ armL: 62, armR: -20, head: -10 }), rope: 'noose', arc: 0, loop: 'fiddle' },
    { label: 'Drags the stool under it', expr: 'worried', tx: 230, rot: -8, a: A({ armL: 82, armR: 64, head: -6, legL: -8, legR: -20 }),
      stool: { x: 250, rot: 0 }, loop: 'push' },
    { label: 'Climbs up', tx: 188, ty: STAND - 26, rot: -10, a: A({ armL: 70, armR: -40, legL: 75, legR: -5, head: -4 }), arc: -18, loop: 'idle' },
    // ride: the feet stay pinned to the stool seat, so the character moves with it
    { label: 'Stands on the stool', ride: true, tx: 150, ty: ON_STOOL, rot: 0, a: A({ armL: 112, armR: -112, head: -4, legL: 0, legR: 0 }), arc: -20 },
    { label: 'Puts the noose on', a: A({ armL: 14, armR: -14, head: 5 }), rope: 'worn', arc: 0, loop: 'shiver' },
    { label: 'The stool wobbles', expr: 'scared', a: A({ armL: 88, armR: -96, head: 6 }), loop: 'wobble' },
    // Still standing: the stool tips under the feet but has not fallen yet
    { label: 'The stool tips', rot: 6, a: A({ armL: 125, armR: -95, legR: -30, head: 8 }),
      stool: { x: 250, rot: 8 }, loop: 'teeter' },
    // The only stage where the character leaves the stool: fall, rope bounce, done
    { label: 'Hanged', ride: false, expr: 'ko', exprAt: 0.6, dur: 1200, ease: 'drop', tx: 150, ty: ON_STOOL + 18, rot: 0, pivot: 'neck',
      a: A({ head: 18, armL: 5, armR: -3, legL: 3, legR: -1, tail: 40 }), stool: { x: 336, rot: 90 }, loop: 'sway' },
  ];
  const STAGES = [];
  RAW.forEach((s, i) => {
    const prev = STAGES[i - 1] || {};
    STAGES.push({ ...prev, ease: undefined, exprAt: undefined, dur: undefined, ...s, a: { ...prev.a, ...s.a }, stool: { ...prev.stool, ...s.stool } });
  });

  // Looping motion per stage: returns offsets for time t (seconds).
  const LOOPS = {
    idle: (t) => ({ ty: Math.sin(t * 2.6) * 1.5, tail: Math.sin(t * 3) * 10 }),
    wave: (t) => ({ ty: Math.sin(t * 2.6) * 1.5, armR: Math.sin(t * 9) * 18, tail: Math.sin(t * 3) * 12 }),
    fiddle: (t) => ({ armL: Math.sin(t * 10) * 10, armR: Math.sin(t * 10 + 1) * 8, head: Math.sin(t * 2) * 3 }),
    push: (t) => ({ rot: Math.sin(t * 7) * 1.5, tx: Math.sin(t * 7) * 1.5, legL: Math.sin(t * 7) * 6, legR: -Math.sin(t * 7) * 6 }),
    shiver: (t) => ({ tx: Math.sin(t * 40) * 0.7, armL: Math.sin(t * 30) * 3, armR: Math.sin(t * 30) * 3 }),
    wobble: (t) => ({ rot: Math.sin(t * 7) * 5, stoolRot: Math.sin(t * 7 - 0.4) * 4, armL: Math.sin(t * 9) * 14, armR: Math.sin(t * 9 + 1) * 14 }),
    teeter: (t) => ({ stoolRot: Math.sin(t * 6) * 3.5, rot: Math.sin(t * 6 + 0.3) * 3, armL: Math.sin(t * 10) * 20,
      armR: Math.sin(t * 10 + 1) * 20, legR: Math.sin(t * 8) * 10, head: Math.sin(t * 6) * 3 }),
    sway: (t) => ({ swing: Math.sin(t * 1.6) * 3, head: Math.sin(t * 1.6 + 0.6) * 2, tail: Math.sin(t * 1.6) * 4 }),
  };

  const lerp = (a, b, p) => a + (b - a) * p;
  const EASE = {
    default: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    drop: (p) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }, // overshoot = rope bounce
  };

  // Top-centre of the stool seat in scene units (the stool tips around its right foot)
  function seatTop(x, deg) {
    const r = (deg * Math.PI) / 180;
    return [x + 30 - 30 * Math.cos(r) + SEAT * Math.sin(r), GROUND - 30 * Math.sin(r) - SEAT * Math.cos(r)];
  }

  // The pose at a point between stage `from` and stage `to` (p: 0..1), plus loops at time t.
  function frame(from, to, p, t, loops = true) {
    const A0 = STAGES[from], A1 = STAGES[to];
    const e = (EASE[A1.ease] || EASE.default)(p);
    const f = {
      expr: p < (A1.exprAt ?? 0.35) ? A0.expr : A1.expr,
      coil: p < 0.5 ? A0.coil : A1.coil,
      rope: p < 0.5 ? A0.rope : A1.rope,
      // The rotation pivot slides between feet and neck so switching it never jumps
      pivot: PIVOTS[A0.pivot].map((v, i) => lerp(v, PIVOTS[A1.pivot][i], e)),
      tx: lerp(A0.tx, A1.tx, e),
      ty: lerp(A0.ty, A1.ty, e),
      rot: lerp(A0.rot, A1.rot, e),
      swing: 0,
      stoolX: lerp(A0.stool.x, A1.stool.x, e),
      stoolRot: lerp(A0.stool.rot, A1.stool.rot, e),
      a: {},
    };
    for (const k in A1.a) f.a[k] = lerp(A0.a[k], A1.a[k], e);

    // Cross-fade the previous stage's loop into the new one
    const off = {};
    if (loops) {
      const add = (name, w) => {
        const o = LOOPS[name] ? LOOPS[name](t) : {};
        for (const k in o) off[k] = (off[k] || 0) + o[k] * w;
      };
      add(A0.loop, 1 - p);
      add(A1.loop, p);
    }
    f.stoolRot += off.stoolRot || 0;
    delete off.stoolRot;

    // Stand on the (possibly tipping) seat
    const ride = (A0.ride ? 1 - p : 0) + (A1.ride ? p : 0);
    if (ride > 0) {
      const [sx, sy] = seatTop(f.stoolX, f.stoolRot);
      f.tx = lerp(f.tx, sx - PIVOTS.feet[0], ride);
      f.ty = lerp(f.ty, sy - FEET, ride);
    }
    f.ty += (A1.arc || 0) * Math.sin(Math.PI * p);

    for (const k in off) {
      if (k in f.a) f.a[k] += off[k];
      else f[k] += off[k];
    }
    return f;
  }

  // ---- props ----
  const coil = (cx, cy, rings = 3) => {
    let out = '';
    for (let i = 0; i < rings; i++) out += tube(`M${cx - 19},${cy - 6 - i * 6} a19,7 0 1 0 38,0 a19,7 0 1 0 -38,0`, 5, ROPE);
    return out;
  };

  const gallows = () =>
    `<ellipse cx="70" cy="${GROUND + 2}" rx="46" ry="9" fill="#9fd28a"/>` +
    tube('M70,138 L156,44', 13, WOOD) +
    `<rect x="58" y="30" width="24" height="${GROUND - 26}" rx="9" fill="${WOOD}" stroke="${OUTLINE}" stroke-width="${SW}"/>` +
    `<rect x="44" y="30" width="238" height="24" rx="11" fill="${WOOD}" stroke="${OUTLINE}" stroke-width="${SW}"/>` +
    `<path d="M66,90 v40 M74,220 v54 M70,340 v30 M110,42 h40 M190,40 h30" stroke="${WOOD_LINE}" stroke-width="3" stroke-linecap="round"/>`;

  // Grass runs past the scene edges so wider crops (e.g. the Play screen) stay filled
  const ground = () =>
    `<path d="M-400,${GROUND} H${SCENE.w + 400} V${SCENE.h} H-400 Z" fill="${GRASS}"/>` +
    `<path d="M-400,${GROUND} H${SCENE.w + 400}" stroke="${OUTLINE}" stroke-width="${SW}"/>` +
    [[24, 452], [180, 446], [420, 450], [454, 440]].map(([x, y]) =>
      `<g transform="translate(${x} ${y})"><circle r="4.5" fill="#fff" stroke="${OUTLINE}" stroke-width="2"/><circle r="1.8" fill="#ffd34d"/></g>`).join('');

  const stool = (x, rot) =>
    `<g transform="translate(${x} ${GROUND}) rotate(${rot} 30 0)">` +
    `<rect x="-22" y="-30" width="44" height="8" rx="3" fill="${STOOL}" stroke="${OUTLINE}" stroke-width="3"/>` +
    `<rect x="-31" y="-52" width="11" height="52" rx="4" fill="${STOOL}" stroke="${OUTLINE}" stroke-width="3"/>` +
    `<rect x="20" y="-52" width="11" height="52" rx="4" fill="${STOOL}" stroke="${OUTLINE}" stroke-width="3"/>` +
    `<rect x="-38" y="-${SEAT}" width="76" height="16" rx="7" fill="${STOOL}" stroke="${OUTLINE}" stroke-width="${SW}"/>` +
    `</g>`;

  const beamWrap = () =>
    `<rect x="${HANG[0] - 7}" y="27" width="14" height="30" rx="5" fill="${ROPE}" stroke="${OUTLINE}" stroke-width="2.5"/>` +
    `<path d="M${HANG[0] - 7},36 l14,-4 M${HANG[0] - 7},46 l14,-4" stroke="${OUTLINE}" stroke-width="1.6"/>`;

  const knotBlob = (x, y, deg = 0) =>
    `<g transform="translate(${x} ${y}) rotate(${deg})"><rect x="-7" y="-9" width="14" height="18" rx="5" fill="${ROPE}" stroke="${OUTLINE}" stroke-width="2.5"/>` +
    `<path d="M-7,-3 h14 M-7,3 h14" stroke="${OUTLINE}" stroke-width="1.6"/></g>`;

  // Character units -> scene units for the current frame (before the swing)
  function toScene(f, [x, y]) {
    const [px, py] = f.pivot;
    const r = (f.rot * Math.PI) / 180;
    const dx = x - px, dy = y - py;
    return [px + dx * Math.cos(r) - dy * Math.sin(r) + f.tx, py + dx * Math.sin(r) + dy * Math.cos(r) + f.ty];
  }

  function scene(c, f) {
    const [hx, hy] = HANG;
    let rope = '';
    let over = '';
    if (f.rope !== 'none') rope += beamWrap();
    if (f.rope === 'thrown') rope += tube(`M${hx},${hy} C${hx + 4},200 ${hx - 4},330 ${hx},${GROUND - 14}`, 5, ROPE) + coil(hx, GROUND, 2);
    if (f.rope === 'noose')
      rope += tube(`M${hx},${hy} L${hx},146`, 5, ROPE) +
        tube(`M${hx},164 C${hx - 26},166 ${hx - 22},210 ${hx},210 C${hx + 22},210 ${hx + 26},166 ${hx},164`, 5, ROPE) +
        knotBlob(hx, 156);
    if (f.rope === 'worn') {
      const [kx, ky] = toScene(f, [KNOT[0], KNOT[1] - 8]);
      rope += tube(`M${hx},${hy} L${kx},${ky}`, 5, ROPE);
      over = tube(`M72,114 Q100,136 ${KNOT[0]},${KNOT[1] + 2}`, 5.5, ROPE) + knotBlob(KNOT[0], KNOT[1], -28);
    }

    const [px, py] = f.pivot;
    const character =
      `<g transform="translate(${f.tx} ${f.ty}) rotate(${f.rot} ${px} ${py})">` +
      render(c, { bare: true, expr: f.expr, angles: f.a, held: f.coil === 'held' ? coil(100, 168) : '', over }) +
      `</g>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCENE.w} ${SCENE.h}" class="hanged-scene">` +
      ground() + gallows() + stool(f.stoolX, f.stoolRot) +
      (f.coil === 'ground' ? coil(300, GROUND) : '') +
      `<g transform="rotate(${f.swing} ${hx} ${hy})">${rope}${character}</g>` +
      `</svg>`;
  }

  const DURATION = 750; // ms per stage transition, unless the stage sets `dur`

  global.HangedAnim = { STAGES, LOOPS, frame, scene, SCENE, DURATION };
})(typeof window !== 'undefined' ? window : globalThis);
