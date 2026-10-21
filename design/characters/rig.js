/*
 * Hanged: shared character rig.
 *
 * Every character uses the SAME skeleton: same joints, same parts and the
 * same draw order. A character is only a "skin": colours plus decorations
 * hung on fixed slots. Poses and expressions are defined once and work on
 * every character, so the 10-stage hanging animation is authored once.
 *
 * Parts (each rotates around its joint):
 *   tail  -> JOINTS.tail      legL / legR -> JOINTS.hipL / hipR
 *   body  (static)            armL / armR -> JOINTS.shoulderL / shoulderR
 *   head  -> JOINTS.neck      (the rope attaches at the neck)
 *
 * Head slots, in draw order:
 *   back  (behind the head: ears, spikes, gills)
 *   head shape -> marks (clipped to the head: stripes, patches)
 *   front (over the head, under the face: floppy ears, whiskers, muzzle)
 *   face  (cheeks, nose, eyes, mouth: driven by the expression)
 *   top   (over everything: caps, crowns)
 */
(function (global) {
  const OUTLINE = '#3a2b4d';
  const EYE = '#2b2238';
  const MOUTH_IN = '#6b2c43';
  const TONGUE = '#ff8fa3';
  const SW = 3.5;
  const VIEWBOX = '-10 -40 220 260';

  const JOINTS = {
    neck: [100, 124],
    shoulderL: [73, 134],
    shoulderR: [127, 134],
    hipL: [87, 178],
    hipR: [113, 178],
    tail: [126, 170],
  };

  const FACE = {
    eyeL: [80, 84],
    eyeR: [120, 84],
    nose: [100, 95],
    mouth: [100, 101],
    cheekL: [66, 99],
    cheekR: [134, 99],
  };

  const HEAD = { cx: 100, cy: 80, rx: 54, ry: 47 };
  const ARM_FRONT_AT = 100;

  // ---- poses: rotation in degrees per part (positive = clockwise) ----
  const POSES = {
    idle: { head: 0, armL: 28, armR: -28, legL: 0, legR: 0, tail: 0 },
    cheer: { head: -5, armL: 125, armR: -125, legL: 10, legR: -10, tail: -15 },
    panic: { head: 6, armL: 158, armR: -158, legL: 16, legR: -16, tail: 25 },
    dangle: { head: 18, armL: 5, armR: -3, legL: 3, legR: -1, tail: 40 },
  };

  // ---- helpers ----
  const s = (fill, extra = '') =>
    `fill="${fill}" stroke="${OUTLINE}" stroke-width="${SW}" stroke-linejoin="round" ${extra}`;
  // A thick outlined stroke (tails, gills, whiskers-style limbs)
  const tube = (d, width, color) =>
    `<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="${width + SW * 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const rot = (deg, [x, y]) => `rotate(${deg} ${x} ${y})`;
  const mirror = (svg) => `<g transform="translate(200 0) scale(-1 1)">${svg}</g>`;
  const pair = (svg) => svg + mirror(svg);

  // ---- face ----
  function drawEyes(expr) {
    const [lx, ly] = FACE.eyeL;
    const [rx, ry] = FACE.eyeR;
    const one = (x, y, side) => {
      switch (expr) {
        case 'joy':
          return `<path d="M${x - 7},${y + 2} Q${x},${y - 8} ${x + 7},${y + 2}" fill="none" stroke="${EYE}" stroke-width="3.5" stroke-linecap="round"/>`;
        case 'nervous':
          return `<ellipse cx="${x - 2}" cy="${y + 1}" rx="5" ry="6.5" fill="${EYE}"/>` +
            `<circle cx="${x - 0.5}" cy="${y - 2}" r="1.8" fill="#fff"/>`;
        case 'worried':
          return `<ellipse cx="${x}" cy="${y + 1}" rx="6" ry="7.5" fill="${EYE}"/>` +
            `<circle cx="${x + 2}" cy="${y - 2}" r="2.2" fill="#fff"/><circle cx="${x - 2}" cy="${y + 3.5}" r="1.2" fill="#fff"/>` +
            `<path d="M${x - 8 * side},${y - 11} L${x + 6 * side},${y - 16}" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`;
        case 'scared':
          return `<circle cx="${x}" cy="${y}" r="8.5" fill="#fff" stroke="${EYE}" stroke-width="2.5"/>` +
            `<circle cx="${x}" cy="${y + 1}" r="2.6" fill="${EYE}"/>` +
            `<path d="M${x - 9 * side},${y - 13} L${x + 5 * side},${y - 18}" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`;
        case 'ko':
          return `<path d="M${x - 5.5},${y - 5.5} L${x + 5.5},${y + 5.5} M${x + 5.5},${y - 5.5} L${x - 5.5},${y + 5.5}" stroke="${EYE}" stroke-width="3.5" stroke-linecap="round"/>`;
        default: // happy
          return `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="7" fill="${EYE}"/>` +
            `<circle cx="${x + 1.8}" cy="${y - 2.6}" r="2.1" fill="#fff"/>`;
      }
    };
    // side: +1 for the left eye, -1 for the right, so brows mirror
    return one(lx, ly, 1) + one(rx, ry, -1);
  }

  function drawMouth(expr, style) {
    const [x, y] = FACE.mouth;
    switch (expr) {
      case 'joy':
        return `<path d="M${x - 9},${y - 1} H${x + 9} Q${x + 9},${y + 12} ${x},${y + 12} Q${x - 9},${y + 12} ${x - 9},${y - 1} Z" ${s(MOUTH_IN, 'stroke-width="2.5"')}/>` +
          `<ellipse cx="${x}" cy="${y + 8}" rx="4.5" ry="3" fill="${TONGUE}"/>`;
      case 'nervous':
        return `<path d="M${x - 8},${y + 3} q2,-3 4,0 t4,0 t4,0 t4,0" fill="none" stroke="${OUTLINE}" stroke-width="2.6" stroke-linecap="round"/>`;
      case 'worried':
        return `<path d="M${x - 6},${y + 5} Q${x},${y - 1} ${x + 6},${y + 5}" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>`;
      case 'scared':
        return `<ellipse cx="${x}" cy="${y + 5}" rx="5.5" ry="7" ${s(MOUTH_IN, 'stroke-width="2.5"')}/>`;
      case 'ko':
        return `<path d="M${x - 9},${y + 3} q2.25,-3 4.5,0 t4.5,0 t4.5,0 t4.5,0" fill="none" stroke="${OUTLINE}" stroke-width="2.6" stroke-linecap="round"/>` +
          `<path d="M${x + 1},${y + 4} v4 a3.5,3.5 0 0 0 7,0 v-4" ${s(TONGUE, 'stroke-width="2"')}/>`;
      default: // happy: depends on the character's mouth style
        if (style === 'cat')
          return `<path d="M${x - 7},${y - 1} q3.5,5 7,0 q3.5,5 7,0" fill="none" stroke="${OUTLINE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
        if (style === 'wide')
          return `<path d="M${x - 15},${y} Q${x},${y + 11} ${x + 15},${y}" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>`;
        return `<path d="M${x - 6},${y + 1} Q${x},${y + 7} ${x + 6},${y + 1}" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>`;
    }
  }

  function drawOverlays(expr) {
    const drop = (x, y, sc = 1) =>
      `<path transform="translate(${x} ${y}) scale(${sc})" d="M0,-9 C4,-3 7,1 7,4 A7,7 0 0 1 -7,4 C-7,1 -4,-3 0,-9 Z" fill="#9fdcff" stroke="${OUTLINE}" stroke-width="2"/>`;
    if (expr === 'nervous') return drop(148, 60, 0.9);
    if (expr === 'worried') return drop(150, 58) + drop(52, 66, 0.7);
    if (expr === 'scared')
      return `<path d="M73,93 q-2,8 1,14 M127,93 q2,8 -1,14" fill="none" stroke="#7fcaff" stroke-width="3.5" stroke-linecap="round"/>` + drop(152, 56);
    return '';
  }

  function drawFace(c, expr) {
    const cheeks = expr === 'ko' ? '' :
      `<ellipse cx="${FACE.cheekL[0]}" cy="${FACE.cheekL[1]}" rx="8" ry="5" fill="${c.cheek}" opacity=".6"/>` +
      `<ellipse cx="${FACE.cheekR[0]}" cy="${FACE.cheekR[1]}" rx="8" ry="5" fill="${c.cheek}" opacity=".6"/>`;
    const [nx, ny] = FACE.nose;
    const nose = c.nose
      ? `<path d="M${nx - 5},${ny - 2.5} Q${nx},${ny - 5.5} ${nx + 5},${ny - 2.5} Q${nx + 4},${ny + 2.5} ${nx},${ny + 3.5} Q${nx - 4},${ny + 2.5} ${nx - 5},${ny - 2.5} Z" fill="${c.nose}" stroke="${OUTLINE}" stroke-width="2"/>`
      : '';
    return cheeks + nose + drawEyes(expr) + drawMouth(expr, c.mouth) + drawOverlays(expr);
  }

  // ---- body parts (shared geometry, coloured per character) ----
  const legShape = (color, foot) =>
    `<rect x="-9" y="-8" width="18" height="26" rx="9" ${s(color)}/>` +
    `<ellipse cx="0" cy="19" rx="12" ry="7.5" ${s(foot)}/>`;
  const armShape = (color, paw) =>
    `<rect x="-7.5" y="-6" width="15" height="33" rx="7.5" ${s(color)}/>` +
    (paw ? `<ellipse cx="0" cy="21" rx="4.5" ry="3.5" fill="${paw}"/>` : '');

  let uid = 0;

  function render(c, opts = {}) {
    const pose = { ...POSES.idle, ...(POSES[opts.pose] || {}), ...(opts.angles || {}) };
    const expr = opts.expr || 'happy';
    const id = `hc${++uid}`;
    const limb = c.limb || c.fur;
    const foot = c.foot || limb;
    const d = c.decor || {};
    const at = (j, deg, inner) =>
      `<g transform="translate(${JOINTS[j][0]} ${JOINTS[j][1]}) rotate(${deg})">${inner}</g>`;

    const tail = d.tail ? at('tail', pose.tail, d.tail(c, id)) : '';
    const legs = at('hipL', pose.legL, legShape(limb, foot)) + at('hipR', pose.legR, legShape(limb, foot));
    const body =
      `<rect x="70" y="108" width="60" height="78" rx="28" ${s(c.body || c.fur)}/>` +
      (c.belly ? `<ellipse cx="100" cy="158" rx="19" ry="20" fill="${c.belly}"/>` : '') +
      (d.body ? d.body(c) : '') +
      (opts.held || ''); // a prop held against the belly, under the arms
    // An arm raised past ARM_FRONT_AT degrees draws in front of the head
    // (paws on cheeks, grabbing the rope); otherwise it sits behind it.
    const armL = at('shoulderL', pose.armL, armShape(limb, c.paw));
    const armR = at('shoulderR', pose.armR, armShape(limb, c.paw));
    const front = (a) => Math.abs(a) > ARM_FRONT_AT;
    const armsBack = (front(pose.armL) ? '' : armL) + (front(pose.armR) ? '' : armR);
    const armsFront = (front(pose.armL) ? armL : '') + (front(pose.armR) ? armR : '');

    const headShape = `<ellipse cx="${HEAD.cx}" cy="${HEAD.cy}" rx="${HEAD.rx}" ry="${HEAD.ry}"`;
    const head =
      `<g transform="${rot(pose.head, JOINTS.neck)}">` +
      (d.back ? d.back(c) : '') +
      `${headShape} ${s(c.fur)}/>` +
      (d.marks ? `<clipPath id="${id}-head">${headShape}/></clipPath><g clip-path="url(#${id}-head)">${d.marks(c)}</g>${headShape} fill="none" stroke="${OUTLINE}" stroke-width="${SW}"/>` : '') +
      (d.front ? d.front(c) : '') +
      drawFace(c, expr) +
      (d.top ? d.top(c, id) : '') +
      `</g>`;

    const joints = opts.showJoints
      ? Object.entries(JOINTS).map(([, [x, y]]) => `<circle cx="${x}" cy="${y}" r="4" fill="#ff3d7f" stroke="#fff" stroke-width="1.5"/>`).join('')
      : '';

    // opts.over: drawn over the head but under raised arms (the noose around the neck)
    const inner = tail + legs + body + armsBack + head + (opts.over || '') + armsFront + joints;
    // opts.bare: return the parts only, to place the character inside a larger scene
    if (opts.bare) return inner;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" class="hanged-char">${inner}</svg>`;
  }

  // ---- the 10 characters ----
  const CHARACTERS = [
    {
      id: 'bun', name: 'Bun', species: 'Bunny',
      fur: '#fff7f0', belly: '#ffe6ee', inner: '#ffc2d1', nose: '#ff8fab', cheek: '#ff9fbb', paw: '#ffc2d1', mouth: 'cat',
      decor: {
        back: (c) => pair(
          `<g transform="rotate(-10 82 46)"><ellipse cx="82" cy="4" rx="14" ry="38" ${s(c.fur)}/>` +
          `<ellipse cx="82" cy="8" rx="6.5" ry="27" fill="${c.inner}"/></g>`),
        tail: (c) => `<circle cx="6" cy="-2" r="11" ${s('#ffffff')}/>`,
      },
    },
    {
      id: 'mochi', name: 'Mochi', species: 'Kitty',
      fur: '#ffb46e', belly: '#fff1de', inner: '#ffd3dc', stripe: '#f08a4b', nose: '#ff7f9e', cheek: '#ff8f8f', mouth: 'cat',
      decor: {
        back: (c) => pair(
          `<path d="M54,64 Q54,30 62,14 Q78,22 96,40 Z" ${s(c.fur)}/>` +
          `<path d="M63,50 Q63,34 67,26 Q76,32 85,41 Z" fill="${c.inner}"/>`),
        marks: (c) =>
          `<path d="M100,32 v14 M87,34 l3,11 M113,34 l-3,11" stroke="${c.stripe}" stroke-width="5" stroke-linecap="round"/>` +
          pair(`<path d="M44,74 h10 M45,84 h8" stroke="${c.stripe}" stroke-width="4.5" stroke-linecap="round"/>`),
        front: () => pair(`<path d="M36,92 L54,95 M38,102 L54,100" stroke="${OUTLINE}" stroke-width="2" stroke-linecap="round"/>`),
        tail: (c) => tube('M0,0 C22,2 36,-6 34,-30 C33,-40 40,-46 46,-42', 11, c.fur) +
          `<path d="M34,-30 C33,-40 40,-46 46,-42" fill="none" stroke="${c.stripe}" stroke-width="11" stroke-linecap="round"/>`,
      },
    },
    {
      id: 'coco', name: 'Coco', species: 'Teddy bear',
      fur: '#c68a5d', belly: '#f4d9bb', inner: '#f4d9bb', muzzle: '#f4d9bb', nose: '#4a2e2a', cheek: '#ff8f8f', paw: '#f4d9bb', mouth: 'smile',
      decor: {
        back: (c) => pair(`<circle cx="58" cy="44" r="17" ${s(c.fur)}/><circle cx="59" cy="45" r="8.5" fill="${c.inner}"/>`),
        front: (c) => `<ellipse cx="100" cy="100" rx="18" ry="13" fill="${c.muzzle}"/>`,
        tail: (c) => `<circle cx="5" cy="0" r="8" ${s(c.fur)}/>`,
      },
    },
    {
      id: 'ember', name: 'Ember', species: 'Fox',
      fur: '#ff8a4c', belly: '#fff4e6', white: '#fff4e6', inner: '#fff0dd', tip: '#5b3a46', nose: '#3a2b4d', cheek: '#ff7a7a', limb: '#ff8a4c', foot: '#5b3a46', mouth: 'cat',
      decor: {
        back: (c) => pair(
          `<path d="M50,68 Q46,26 54,4 Q78,18 96,40 Z" ${s(c.fur)}/>` +
          `<path d="M59,52 Q57,30 60,18 Q74,28 84,40 Z" fill="${c.inner}"/>`),
        marks: (c) => `<path d="M40,92 Q66,80 100,96 Q134,80 160,92 L160,140 L40,140 Z" fill="${c.white}"/>`,
        tail: (c, id) => {
          const shape = 'M-2,-4 C14,-30 44,-52 62,-40 C72,-30 58,0 2,8 Z';
          return `<clipPath id="${id}-tail"><path d="${shape}"/></clipPath>` +
            `<path d="${shape}" ${s(c.fur)}/>` +
            `<g clip-path="url(#${id}-tail)"><circle cx="64" cy="-40" r="16" fill="${c.white}"/></g>` +
            `<path d="${shape}" fill="none" stroke="${OUTLINE}" stroke-width="${SW}" stroke-linejoin="round"/>`;
        },
      },
    },
    {
      id: 'bao', name: 'Bao', species: 'Panda',
      fur: '#ffffff', dark: '#3b3443', limb: '#3b3443', nose: '#3b3443', cheek: '#ffa3b5', mouth: 'smile',
      decor: {
        back: (c) => pair(`<circle cx="58" cy="44" r="16" ${s(c.dark)}/>`),
        marks: (c) => pair(`<ellipse cx="78" cy="87" rx="12" ry="14" transform="rotate(25 78 87)" fill="${c.dark}"/>`),
        tail: (c) => `<circle cx="4" cy="0" r="7" ${s(c.fur)}/>`,
      },
    },
    {
      id: 'ribbit', name: 'Ribbit', species: 'Frog prince',
      fur: '#8fd16f', belly: '#e6f6c9', spot: '#6fb94f', cheek: '#ff8fa8', mouth: 'wide',
      decor: {
        back: (c) => pair(`<circle cx="70" cy="40" r="18" ${s(c.fur)}/><circle cx="70" cy="40" r="8" fill="${c.belly}"/>`),
        marks: (c) => `<circle cx="132" cy="66" r="5" fill="${c.spot}"/><circle cx="142" cy="78" r="3.5" fill="${c.spot}"/><circle cx="62" cy="64" r="3.5" fill="${c.spot}"/>`,
        top: () => `<path d="M86,38 L84,20 L93,28 L100,15 L107,28 L116,20 L114,38 Z" ${s('#ffd34d', 'stroke-width="3"')}/><circle cx="100" cy="31" r="3" fill="#ff6f91"/>`,
      },
    },
    {
      id: 'lolo', name: 'Lolo', species: 'Axolotl',
      fur: '#ffb8d1', belly: '#ffe3ed', gill: '#ff6f9f', cheek: '#ff6f9f', mouth: 'smile',
      decor: {
        back: (c) => pair(
          tube('M56,58 L30,40', 10, c.gill) + tube('M52,72 L24,68', 10, c.gill) + tube('M54,86 L30,98', 10, c.gill)),
        tail: (c) => `<path d="M-2,-6 Q30,-10 48,-32 Q46,4 0,10 Z" ${s(c.fur)}/><path d="M12,-6 Q30,-10 42,-24 Q40,0 12,4 Z" fill="${c.belly}"/>`,
      },
    },
    {
      id: 'rexy', name: 'Rexy', species: 'Baby dino',
      fur: '#79d4b0', belly: '#fff3c4', spike: '#ffcf5a', cheek: '#ff8fa8', mouth: 'smile',
      decor: {
        back: (c) =>
          `<path d="M88,38 L100,14 L112,38 Z" ${s(c.spike)}/>` +
          pair(`<path d="M62,50 L64,26 L82,40 Z" ${s(c.spike)}/>`),
        marks: (c) => `<circle cx="70" cy="56" r="5" fill="#5fbf98"/><circle cx="132" cy="60" r="6" fill="#5fbf98"/><circle cx="142" cy="72" r="3.5" fill="#5fbf98"/>`,
        tail: (c) =>
          `<path d="M24,-14 L30,-28 L36,-12 Z" ${s(c.spike, 'stroke-width="3"')}/>` +
          `<path d="M-4,-10 C20,-14 40,-8 58,-20 C52,4 26,14 -2,10 Z" ${s(c.fur)}/>`,
      },
    },
    {
      id: 'biscuit', name: 'Biscuit', species: 'Puppy',
      fur: '#f5d6a8', ear: '#a8714a', muzzle: '#fff3e2', belly: '#fff3e2', nose: '#3a2b4d', cheek: '#ff8f8f', mouth: 'smile',
      decor: {
        marks: (c) => `<ellipse cx="123" cy="80" rx="16" ry="15" fill="${c.ear}" opacity=".85"/>`,
        front: (c) =>
          `<ellipse cx="100" cy="100" rx="17" ry="12" fill="${c.muzzle}"/>` +
          pair(`<path d="M72,42 C52,34 36,46 38,78 C39,94 52,98 58,86 C64,72 64,58 76,50 Z" ${s(c.ear)}/>`),
        tail: (c) => tube('M0,0 C14,-2 20,-14 22,-26', 10, c.fur),
      },
    },
    {
      id: 'button', name: 'Button', species: 'Mushroom sprite',
      fur: '#ffe8cc', body: '#fff3e3', belly: '#ffffff', cap: '#ff6b6b', cheek: '#ff8f8f', limb: '#fff3e3', mouth: 'smile',
      decor: {
        top: (c, id) => {
          const cap = 'M34,72 C22,22 66,0 100,0 C134,0 178,22 166,72 C140,58 60,58 34,72 Z';
          return `<clipPath id="${id}-cap"><path d="${cap}"/></clipPath>` +
            `<path d="${cap}" ${s(c.cap)}/>` +
            `<g clip-path="url(#${id}-cap)" fill="#fff"><circle cx="100" cy="20" r="11"/><circle cx="62" cy="40" r="9"/><circle cx="140" cy="38" r="10"/><circle cx="160" cy="62" r="7"/><circle cx="40" cy="62" r="6"/></g>` +
            `<path d="${cap}" fill="none" stroke="${OUTLINE}" stroke-width="${SW}" stroke-linejoin="round"/>`;
        },
      },
    },
  ];

  global.HangedRig = { render, tube, CHARACTERS, POSES, JOINTS, FACE, VIEWBOX, OUTLINE, SW, EXPRESSIONS: ['happy', 'joy', 'nervous', 'worried', 'scared', 'ko'] };
})(typeof window !== 'undefined' ? window : globalThis);
