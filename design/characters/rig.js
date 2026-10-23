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
 * Arms can bend: `elbowL` / `elbowR` (degrees, 0 = straight) split an arm into
 * an upper arm and a forearm. Straight arms draw exactly as before, so the
 * balloon animation never pays for elbows. Every character also has a
 * `persona`: its signature pose, face and lean for the Characters page
 * (`signature(c)` turns it into render options).
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
  function drawEyes(c, expr) {
    const [lx, ly] = FACE.eyeL;
    const [rx, ry] = FACE.eyeR;
    const eye = c.eye || EYE;
    // Line-drawn eyes (closed, X) on a dark patch (the panda) need a light stroke
    const lash = c.lash || eye;
    // Lower half of an eye under a lid line: half-closed, cool or smug. look: glance sideways.
    const lidded = (x, y, tilt, look = 0) =>
      `<path d="M${x - 5.5 + look},${y} A5.5,6.5 0 0 0 ${x + 5.5 + look},${y} Z" fill="${eye}"/>` +
      `<circle cx="${x + 1.5 + look}" cy="${y + 2.2}" r="1.5" fill="#fff"/>` +
      `<path d="M${x - 7.5},${y - tilt} L${x + 7.5},${y + tilt}" stroke="${c.lash || OUTLINE}" stroke-width="3.2" stroke-linecap="round"/>`;
    const shut = (x, y) => `<path d="M${x - 6.5},${y} Q${x},${y + 6} ${x + 6.5},${y}" fill="none" stroke="${lash}" stroke-width="3.5" stroke-linecap="round"/>`;
    const one = (x, y, side) => {
      switch (expr) {
        case 'cool':
          return lidded(x, y, 0);
        case 'smug':
          return lidded(x, y, -1.8 * side);
        case 'side':
          return lidded(x, y, 0, 2.5) +
            (side < 0 ? `<path d="M${x - 7},${y - 14} Q${x},${y - 19} ${x + 7},${y - 14}" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>` : '');
        case 'calm':
        case 'sleepy':
          return shut(x, y);
        case 'wink':
          if (side < 0) return `<path d="M${x - 7},${y + 2} Q${x},${y - 8} ${x + 7},${y + 2}" fill="none" stroke="${lash}" stroke-width="3.5" stroke-linecap="round"/>`;
          return `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="7" fill="${eye}"/><circle cx="${x + 1.8}" cy="${y - 2.6}" r="2.1" fill="#fff"/>`;
        case 'fierce':
          return `<ellipse cx="${x}" cy="${y + 1}" rx="5.5" ry="6" fill="${eye}"/><circle cx="${x + 1.6}" cy="${y - 1.4}" r="1.9" fill="#fff"/>` +
            `<path d="M${x - 8 * side},${y - 14} L${x + 7 * side},${y - 8}" stroke="${OUTLINE}" stroke-width="3.4" stroke-linecap="round"/>`;
        case 'joy':
          return `<path d="M${x - 7},${y + 2} Q${x},${y - 8} ${x + 7},${y + 2}" fill="none" stroke="${lash}" stroke-width="3.5" stroke-linecap="round"/>`;
        case 'whoa': // big shining eyes under raised, even brows: surprised and enjoying it (the app icon)
          return `<ellipse cx="${x}" cy="${y}" rx="9.5" ry="10.5" fill="#fff" stroke="${OUTLINE}" stroke-width="2.4"/>` +
            `<ellipse cx="${x}" cy="${y + 1.5}" rx="6.8" ry="7.8" fill="#7a4a30"/><ellipse cx="${x}" cy="${y + 2}" rx="4" ry="4.6" fill="${eye}"/>` +
            `<circle cx="${x + 3}" cy="${y - 2.2}" r="2.8" fill="#fff"/><circle cx="${x - 2.2}" cy="${y + 5}" r="1.4" fill="#fff"/>` +
            `<path d="M${x - 7},${y - 16} Q${x},${y - 21} ${x + 7},${y - 16}" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`;
        case 'nervous':
          return `<ellipse cx="${x - 2}" cy="${y + 1}" rx="5" ry="6.5" fill="${eye}"/>` +
            `<circle cx="${x - 0.5}" cy="${y - 2}" r="1.8" fill="#fff"/>`;
        case 'worried':
          return `<ellipse cx="${x}" cy="${y + 1}" rx="6" ry="7.5" fill="${eye}"/>` +
            `<circle cx="${x + 2}" cy="${y - 2}" r="2.2" fill="#fff"/><circle cx="${x - 2}" cy="${y + 3.5}" r="1.2" fill="#fff"/>` +
            `<path d="M${x - 8 * side},${y - 11} L${x + 6 * side},${y - 16}" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`;
        case 'scared':
          return `<circle cx="${x}" cy="${y}" r="8.5" fill="#fff" stroke="${eye}" stroke-width="2.5"/>` +
            `<circle cx="${x}" cy="${y + 1}" r="2.6" fill="${eye}"/>` +
            `<path d="M${x - 9 * side},${y - 13} L${x + 5 * side},${y - 18}" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`;
        case 'ko':
          return `<path d="M${x - 5.5},${y - 5.5} L${x + 5.5},${y + 5.5} M${x + 5.5},${y - 5.5} L${x - 5.5},${y + 5.5}" stroke="${lash}" stroke-width="3.5" stroke-linecap="round"/>`;
        default: // happy
          return `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="7" fill="${eye}"/>` +
            `<circle cx="${x + 1.8}" cy="${y - 2.6}" r="2.1" fill="#fff"/>`;
      }
    };
    // side: +1 for the left eye, -1 for the right, so brows mirror
    return one(lx, ly, 1) + one(rx, ry, -1);
  }

  function drawMouth(expr, style) {
    const [x, y] = FACE.mouth;
    const line = (d, w = 2.8) => `<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    switch (expr) {
      case 'smug':
      case 'side':
      case 'wink':
        return line(`M${x - 7},${y + 3} Q${x + 1},${y + 7} ${x + 8},${y}`);
      case 'cool':
        return line(`M${x - 5},${y + 4} Q${x + 1},${y + 6} ${x + 6},${y + 3}`);
      case 'calm':
        return line(`M${x - 5},${y + 2} Q${x},${y + 6} ${x + 5},${y + 2}`);
      case 'sleepy':
        return `<ellipse cx="${x}" cy="${y + 5}" rx="3.2" ry="3.8" ${s(MOUTH_IN, 'stroke-width="2.2"')}/>`;
      case 'fierce':
        return `<path d="M${x - 11},${y} Q${x},${y + 3} ${x + 11},${y} Q${x + 8},${y + 11} ${x},${y + 11} Q${x - 8},${y + 11} ${x - 11},${y} Z" ${s('#fff', 'stroke-width="2.5"')}/>` +
          line(`M${x - 9},${y + 4} Q${x},${y + 6.5} ${x + 9},${y + 4}`, 1.6);
      case 'blep':
        return `<path d="M${x - 1},${y + 3} v4 a3.5,3.5 0 0 0 7,0 v-4" ${s(TONGUE, 'stroke-width="2"')}/>` +
          line(`M${x - 7},${y + 1} q3.5,4 7,0 q3.5,4 7,0`, 2.6);
      case 'whoa': // an open "oh!" whose corners lift a little
        return `<path d="M${x - 9},${y + 1} Q${x},${y + 4} ${x + 9},${y + 1} Q${x + 10},${y + 18} ${x},${y + 20} Q${x - 10},${y + 18} ${x - 9},${y + 1} Z" ${s(MOUTH_IN, 'stroke-width="2.5"')}/>` +
          `<path d="M${x - 6},${y + 17} Q${x},${y + 11} ${x + 6},${y + 17} Q${x + 4},${y + 20} ${x},${y + 20} Q${x - 4},${y + 20} ${x - 6},${y + 17} Z" fill="${TONGUE}"/>`;
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
    if (expr === 'sleepy')
      return `<path d="M146,36 h9 l-9,10 h9 M160,20 h6 l-6,7 h6" fill="none" stroke="${OUTLINE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
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
    const nose = c.beak
      ? `<path d="M${nx - 7},${ny - 5} Q${nx},${ny - 9} ${nx + 7},${ny - 5} Q${nx + 3},${ny + 2} ${nx},${ny + 4} Q${nx - 3},${ny + 2} ${nx - 7},${ny - 5} Z" fill="${c.beak}" stroke="${OUTLINE}" stroke-width="2.2" stroke-linejoin="round"/>`
      : c.nose
      ? `<path d="M${nx - 5},${ny - 2.5} Q${nx},${ny - 5.5} ${nx + 5},${ny - 2.5} Q${nx + 4},${ny + 2.5} ${nx},${ny + 3.5} Q${nx - 4},${ny + 2.5} ${nx - 5},${ny - 2.5} Z" fill="${c.nose}" stroke="${OUTLINE}" stroke-width="2"/>`
      : '';
    // A fang peeks under a closed mouth (open mouths show their own inside)
    const fang = c.fang && !['joy', 'whoa', 'scared', 'ko', 'sleepy', 'fierce', 'blep'].includes(expr)
      ? `<path d="M${FACE.mouth[0] + 2},${FACE.mouth[1] + 4} l2.5,6 l2.5,-6.5 Z" fill="#fff" stroke="${OUTLINE}" stroke-width="1.8" stroke-linejoin="round"/>`
      : '';
    return cheeks + nose + drawEyes(c, expr) + drawMouth(expr, c.mouth) + fang + drawOverlays(expr);
  }

  // ---- body parts (shared geometry, coloured per character) ----
  const legShape = (color, foot) =>
    `<rect x="-9" y="-8" width="18" height="26" rx="9" ${s(color)}/>` +
    `<ellipse cx="0" cy="19" rx="12" ry="7.5" ${s(foot)}/>`;
  // bend: the elbow angle (0 = one straight piece, as the animations use).
  // extra: arm decor (a bat's wing) drawn behind the upper arm.
  const armShape = (color, paw, bend, extra = '') => {
    if (!bend)
      return extra + `<rect x="-7.5" y="-6" width="15" height="33" rx="7.5" ${s(color)}/>` +
        (paw ? `<ellipse cx="0" cy="21" rx="4.5" ry="3.5" fill="${paw}"/>` : '');
    return extra + `<rect x="-7.5" y="-6" width="15" height="24" rx="7.5" ${s(color)}/>` +
      `<g transform="translate(0 12) rotate(${bend})"><rect x="-7.5" y="-7.5" width="15" height="27" rx="7.5" ${s(color)}/>` +
      (paw ? `<ellipse cx="0" cy="13" rx="4.5" ry="3.5" fill="${paw}"/>` : '') + `</g>`;
  };

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
    // opts.layers.armL / armR overrides that: 'under' (behind the body), 'back' or 'front'.
    const arms = {
      armL: at('shoulderL', pose.armL, armShape(limb, c.paw, pose.elbowL, d.arm ? d.arm(c, 1) : '')),
      armR: at('shoulderR', pose.armR, armShape(limb, c.paw, pose.elbowR, d.arm ? d.arm(c, -1) : '')),
    };
    const layer = (k) => (opts.layers && opts.layers[k]) || (Math.abs(pose[k]) > ARM_FRONT_AT ? 'front' : 'back');
    const armsIn = (l) => (layer('armL') === l ? arms.armL : '') + (layer('armR') === l ? arms.armR : '');

    // opts.turn (-1..1): a three-quarter view, positive turns the face to the viewer's right. The face
    // slides that way and narrows, the marks and the top follow it less, the back slot (ears) slides away.
    const tn = opts.turn || 0;
    const slide = (dx, svg, sx = 1) =>
      tn && svg ? `<g transform="translate(${100 + dx * tn} 0) scale(${sx} 1) translate(-100 0)">${svg}</g>` : svg;
    const headShape = `<ellipse cx="${HEAD.cx}" cy="${HEAD.cy}" rx="${HEAD.rx}" ry="${HEAD.ry}"`;
    const head =
      `<g transform="${rot(pose.head, JOINTS.neck)}">` +
      slide(-8, d.back ? d.back(c) : '') +
      `${headShape} ${s(c.fur)}/>` +
      (d.marks ? `<clipPath id="${id}-head">${headShape}/></clipPath><g clip-path="url(#${id}-head)">${slide(10, d.marks(c))}</g>${headShape} fill="none" stroke="${OUTLINE}" stroke-width="${SW}"/>` : '') +
      // Turned, the face is clipped to the head: what slides past the far edge goes round the back
      (tn ? `<clipPath id="${id}-face">${headShape}/></clipPath><g clip-path="url(#${id}-face)">` : '') +
      slide(16, (d.front ? d.front(c) : '') + drawFace(c, expr), 1 - 0.14 * Math.abs(tn)) +
      (tn ? `</g>` : '') +
      slide(6, d.top ? d.top(c, id) : '') +
      `</g>`;

    const joints = opts.showJoints
      ? Object.entries(JOINTS).map(([, [x, y]]) => `<circle cx="${x}" cy="${y}" r="4" fill="#ff3d7f" stroke="#fff" stroke-width="1.5"/>`).join('')
      : '';

    // opts.over: drawn over the head but under raised arms (the noose around the neck)
    let inner = tail + legs + armsIn('under') + (opts.under || '') + body + armsIn('back') + head + (opts.over || '') + armsIn('front') + joints;
    // opts.lean: tilt the whole figure around its feet
    if (opts.lean) inner = `<g transform="rotate(${opts.lean} 100 204)">${inner}</g>`;
    // opts.bare: return the parts only, to place the character inside a larger scene
    if (opts.bare) return inner;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" class="hanged-char">${inner}</svg>`;
  }

  // ---- the 15 characters (each with its persona) ----
  const CHARACTERS = [
    {
      id: 'bun', name: 'Bun', species: 'Bunny',
      persona: { expr: 'cool', lean: -3, angles: { head: 8, armL: 14, armR: -140, elbowR: -50, legL: 6, legR: -2, tail: -10 }, layers: { armR: 'back' } },
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
      persona: { expr: 'smug', angles: { head: -7, armL: -30, elbowL: -78, armR: 30, elbowR: 78, legL: 4, legR: -4, tail: 12 } },
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
      persona: { expr: 'fierce', lean: 2, angles: { head: 3, armL: 42, elbowL: -105, armR: -42, elbowR: 105, legL: 9, legR: -9 } },
      fur: '#c68a5d', belly: '#f4d9bb', inner: '#f4d9bb', muzzle: '#f4d9bb', nose: '#4a2e2a', cheek: '#ff8f8f', paw: '#f4d9bb', mouth: 'smile',
      decor: {
        back: (c) => pair(`<circle cx="58" cy="44" r="17" ${s(c.fur)}/><circle cx="59" cy="45" r="8.5" fill="${c.inner}"/>`),
        front: (c) => `<ellipse cx="100" cy="100" rx="18" ry="13" fill="${c.muzzle}"/>`,
        tail: (c) => `<circle cx="5" cy="0" r="8" ${s(c.fur)}/>`,
      },
    },
    {
      id: 'ember', name: 'Ember', species: 'Fox',
      persona: { expr: 'wink', lean: -4, angles: { head: -6, armL: 10, armR: -80, elbowR: -22, legL: 5, legR: -3, tail: -18 } },
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
            persona: {
        expr: 'calm', angles: { head: 4, armL: -25, elbowL: -95, armR: 25, elbowR: 95, legL: 3, legR: -3 },
        // A cup of tea held in both paws
        held: () => `<path d="M116,146 a6,6 0 1 1 0,11" fill="none" stroke="${OUTLINE}" stroke-width="3"/>` +
          `<path d="M84,142 h32 v6 a16,14 0 0 1 -32,0 Z" fill="#9fd9c4" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`,
      },
      fur: '#ffffff', dark: '#3b3443', limb: '#3b3443', lash: '#ffffff', nose: '#3b3443', cheek: '#ffa3b5', mouth: 'smile',
      decor: {
        back: (c) => pair(`<circle cx="58" cy="44" r="16" ${s(c.dark)}/>`),
        marks: (c) => pair(`<ellipse cx="78" cy="87" rx="12" ry="14" transform="rotate(25 78 87)" fill="${c.dark}"/>`),
        tail: (c) => `<circle cx="4" cy="0" r="7" ${s(c.fur)}/>`,
      },
    },
    {
      id: 'ribbit', name: 'Ribbit', species: 'Frog prince',
                  persona: {
        expr: 'smug', lean: 3, angles: { head: -9, armL: 28, armR: 14, legL: 6, legR: -6 }, layers: { armR: 'under' },
        // The royal sceptre, held at the side
        held: () => `<path d="M67,178 L53,126" stroke="${OUTLINE}" stroke-width="10" stroke-linecap="round"/><path d="M67,178 L53,126" stroke="#ffd34d" stroke-width="4.5" stroke-linecap="round"/>` +
          `<circle cx="51" cy="118" r="9" fill="#ff6f91" stroke="${OUTLINE}" stroke-width="3"/><circle cx="48" cy="115" r="2.5" fill="#fff" opacity=".7"/>`,
      },
      fur: '#8fd16f', belly: '#e6f6c9', spot: '#6fb94f', cheek: '#ff8fa8', mouth: 'wide',
      decor: {
        back: (c) => pair(`<circle cx="70" cy="40" r="18" ${s(c.fur)}/><circle cx="70" cy="40" r="8" fill="${c.belly}"/>`),
        marks: (c) => `<circle cx="132" cy="66" r="5" fill="${c.spot}"/><circle cx="142" cy="78" r="3.5" fill="${c.spot}"/><circle cx="62" cy="64" r="3.5" fill="${c.spot}"/>`,
        top: () => `<path d="M86,38 L84,20 L93,28 L100,15 L107,28 L116,20 L114,38 Z" ${s('#ffd34d', 'stroke-width="3"')}/><circle cx="100" cy="31" r="3" fill="#ff6f91"/>`,
      },
    },
    {
      id: 'lolo', name: 'Lolo', species: 'Axolotl',
      persona: { expr: 'blep', lean: 3, angles: { head: 14, armL: 12, armR: -40, elbowR: 125, legL: 3, legR: -7, tail: 15 } },
      fur: '#ffb8d1', belly: '#ffe3ed', gill: '#ff6f9f', cheek: '#ff6f9f', mouth: 'smile',
      decor: {
        back: (c) => pair(
          tube('M56,58 L30,40', 10, c.gill) + tube('M52,72 L24,68', 10, c.gill) + tube('M54,86 L30,98', 10, c.gill)),
        tail: (c) => `<path d="M-2,-6 Q30,-10 48,-32 Q46,4 0,10 Z" ${s(c.fur)}/><path d="M12,-6 Q30,-10 42,-24 Q40,0 12,4 Z" fill="${c.belly}"/>`,
      },
    },
    {
      id: 'rexy', name: 'Rexy', species: 'Baby dino',
      persona: { expr: 'fierce', lean: -2, angles: { head: 4, armL: -40, elbowL: 150, armR: 40, elbowR: -150, legL: 12, legR: -12, tail: 10 }, layers: { armL: 'front', armR: 'front' } },
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
            persona: {
        expr: 'wink', angles: { head: -5, armL: 18, armR: -100, elbowR: -75, legL: 5, legR: -5, tail: -25 },
        // The ball, held up beside the face
        over: () => `<circle cx="146" cy="108" r="9.5" fill="#d4f06a" stroke="${OUTLINE}" stroke-width="2.8"/>` +
          `<path d="M138,103 Q146,109 154,103 M138,114 Q146,108 154,114" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
      },
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
      persona: { expr: 'side', lean: 4, angles: { head: 6, armL: 8, armR: -42, elbowR: 105, legL: 4, legR: -2 } },
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
    {
      id: 'pip', name: 'Pip', species: 'Penguin',
      fur: '#3f4a68', face: '#ffffff', belly: '#ffffff', beak: '#ffb43d', cheek: '#ff9fbb', foot: '#ffb43d', scarf: '#ff5f6d', mouth: 'smile',
      persona: { expr: 'cool', angles: { head: -4, armL: 22, armR: -22, legL: 8, legR: -8, tail: 0 } },
      decor: {
        marks: (c) => `<path d="M100,60 C90,40 50,44 50,82 C50,114 78,128 100,128 C122,128 150,114 150,82 C150,44 110,40 100,60 Z" fill="${c.face}"/>`,
        body: (c) => `<path d="M76,118 Q100,132 124,118 L126,128 Q100,142 74,128 Z" ${s(c.scarf, 'stroke-width="3"')}/>` +
          `<path d="M112,130 L122,158 L110,160 L104,134 Z" ${s(c.scarf, 'stroke-width="3"')}/>`,
        tail: (c) => `<path d="M-2,-6 L16,4 L-2,8 Z" ${s(c.fur)}/>`,
      },
    },
    {
      id: 'sage', name: 'Sage', species: 'Owl',
      fur: '#b07a55', belly: '#f6e6cc', disc: '#f6e6cc', beak: '#ffb43d', cheek: '#ff9f8f', limb: '#8f5f42', foot: '#ffb43d', mouth: 'smile',
            persona: {
        expr: 'smug', lean: -2, angles: { head: -8, armL: -25, elbowL: -85, armR: 25, elbowR: 85, legL: 5, legR: -5 },
        // A book hugged to the chest
        held: () => `<rect x="84" y="134" width="32" height="24" rx="3" fill="#6a8fe0" stroke="${OUTLINE}" stroke-width="3"/>` +
          `<path d="M89,134 v24" stroke="${OUTLINE}" stroke-width="2.4"/>`,
      },
      decor: {
        back: (c) => pair(`<path d="M60,48 L50,12 L80,38 Z" ${s(c.fur)}/>`),
        front: (c) => pair(`<circle cx="80" cy="85" r="17" fill="${c.disc}"/>`) +
          pair(`<circle cx="80" cy="85" r="13" fill="none" stroke="${OUTLINE}" stroke-width="2.6"/>`) +
          `<path d="M93,82 Q100,77 107,82" fill="none" stroke="${OUTLINE}" stroke-width="2.6" stroke-linecap="round"/>`,
        body: () => `<path d="M90,150 l5,5 l5,-5 l5,5 l5,-5 M90,162 l5,5 l5,-5 l5,5 l5,-5" fill="none" stroke="#d8bf98" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
        tail: (c) => `<path d="M-2,-4 L18,-10 L14,0 L20,6 L-2,8 Z" ${s(c.limb, 'stroke-width="3"')}/>`,
      },
    },
    {
      id: 'rocco', name: 'Rocco', species: 'Raccoon',
      fur: '#a9a5b8', mask: '#5a536e', white: '#f4f2f8', belly: '#e6e3ee', inner: '#5a536e', nose: '#2b2238', eye: '#17121f', cheek: '#ff9fbb', limb: '#7d7891', mouth: 'cat',
            persona: {
        expr: 'side', lean: -3, angles: { head: -6, armL: -12, armR: 14, legL: 6, legR: -2, tail: -8 },
        layers: { armL: 'under', armR: 'under' },
        // A letter tile hidden behind the back (badly)
        under: () => `<g transform="rotate(14 136 160)"><rect x="124" y="146" width="26" height="28" rx="5" fill="#ffe08a" stroke="${OUTLINE}" stroke-width="3"/>` +
          `<path d="M131,168 L137,152 L143,168 M133,163 h8" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></g>`,
      },
      decor: {
        back: (c) => pair(`<path d="M52,62 Q44,26 64,18 Q84,22 90,40 Z" ${s(c.fur)}/><path d="M60,48 Q56,30 66,26 Q78,30 80,40 Z" fill="${c.inner}"/>`),
        marks: (c) => `<path d="M46,70 Q100,58 154,70 L154,58 Q100,42 46,58 Z" fill="${c.white}"/>` +
          `<path d="M42,86 Q56,68 82,74 Q100,80 118,74 Q144,68 158,86 Q146,102 122,98 Q100,92 78,98 Q54,102 42,86 Z" fill="${c.mask}"/>` +
          `<ellipse cx="100" cy="106" rx="22" ry="14" fill="${c.white}"/>`,
        tail: (c, id) => {
          const shape = 'M-2,-6 C18,-20 42,-42 58,-34 C68,-26 54,4 2,8 Z';
          return `<clipPath id="${id}-tail"><path d="${shape}"/></clipPath>` +
            `<path d="${shape}" ${s(c.fur)}/>` +
            `<g clip-path="url(#${id}-tail)" fill="${c.mask}"><path d="M18,-30 L30,-36 L40,10 L28,10 Z M38,-44 L50,-46 L62,0 L50,0 Z"/></g>` +
            `<path d="${shape}" fill="none" stroke="${OUTLINE}" stroke-width="${SW}" stroke-linejoin="round"/>`;
        },
      },
    },
    {
      id: 'koa', name: 'Koa', species: 'Koala',
      fur: '#a8aebb', belly: '#eef0f4', inner: '#f4f5f8', bigNose: '#3b3443', cheek: '#ffa3b5', mouth: 'smile',
            persona: {
        expr: 'sleepy', lean: 2, angles: { head: 10, armL: -28, elbowL: -70, armR: 28, elbowR: 70, legL: 4, legR: -4 },
        // A eucalyptus sprig hugged to the chest, poking out to the side
        held: () => `<path d="M96,166 Q130,148 156,104" fill="none" stroke="#6b8f5a" stroke-width="3.2" stroke-linecap="round"/>` +
          [[134, 142, 30], [140, 130, -150], [148, 122, 20], [152, 110, -120], [156, 102, -70]]
            .map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="9" ry="4.5" transform="rotate(${a} ${x} ${y}) translate(7 0)" fill="#9fd08a" stroke="${OUTLINE}" stroke-width="2.2"/>`).join(''),
      },
      decor: {
        back: (c) => pair(`<circle cx="52" cy="52" r="24" ${s(c.fur)}/><circle cx="54" cy="54" r="13" fill="${c.inner}"/>`),
        front: (c) => `<ellipse cx="100" cy="89" rx="10" ry="12" ${s(c.bigNose, 'stroke-width="2"')}/><ellipse cx="96" cy="84" rx="3" ry="2.2" fill="#fff" opacity=".5"/>`,
        tail: (c) => `<circle cx="4" cy="0" r="7" ${s(c.fur)}/>`,
      },
    },
    {
      id: 'vesper', name: 'Vesper', species: 'Bat',
      fur: '#7a6a9c', belly: '#c9b8e6', inner: '#f2a7c3', wing: '#5b4d7a', limb: '#5b4d7a', nose: '#3b3046', cheek: '#ff8fb8', fang: true, mouth: 'smile',
      persona: { expr: 'smug', lean: -3, angles: { head: -6, armL: 18, armR: -30, elbowR: 120, legL: 5, legR: -5 }, layers: { armR: 'front' } },
      decor: {
        back: (c) => pair(`<path d="M58,60 L36,2 L88,38 Z" ${s(c.fur)}/><path d="M60,46 L48,16 L76,36 Z" fill="${c.inner}"/>`),
        arm: (c, side) => `<path d="M${-2 * side},-2 L${-2 * side},26 Q${14 * side},30 ${22 * side},22 Q${18 * side},14 ${22 * side},6 Q${12 * side},2 ${-2 * side},-2 Z" ${s(c.wing, 'stroke-width="3"')}/>`,
      },
    },
  ];

  // The character's signature look (Characters page): its persona as render options.
  // A persona's props: `under` (behind the body), `held` (on the belly, under the arms), `over` (over the head).
  const signature = (c) => {
    const p = c.persona || {};
    const prop = (k) => (p[k] ? p[k](c) : '');
    return { expr: p.expr, angles: p.angles, lean: p.lean, layers: p.layers, under: prop('under'), held: prop('held'), over: prop('over') };
  };

  // ---- profile pictures: the persona in a circle, on a backdrop that fits its personality ----
  // The window on the rig (rig coordinates): the head plus the shoulders, so crossed arms and props show.
  const AV = { x: 22, y: 6, s: 156 };
  const star = (x, y, r, fill) =>
    `<path d="M${x},${y - r} Q${x},${y} ${x + r},${y} Q${x},${y} ${x},${y + r} Q${x},${y} ${x - r},${y} Q${x},${y} ${x},${y - r} Z" fill="${fill}"/>`;
  const glow = (pts, fill) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${fill}" opacity=".25"/><circle cx="${x}" cy="${y}" r="3" fill="${fill}"/>`).join('');
  const cloud = (x, y, k) =>
    `<g transform="translate(${x} ${y}) scale(${k})" fill="#fff"><circle cx="0" cy="0" r="9"/><circle cx="11" cy="-4" r="11"/><circle cx="23" cy="1" r="8"/><rect x="0" y="0" width="23" height="9"/></g>`;
  const snow = (x, y, r) =>
    `<path d="M${x - r},${y} h${2 * r} M${x},${y - r} v${2 * r} M${x - r * 0.7},${y - r * 0.7} l${r * 1.4},${r * 1.4} M${x + r * 0.7},${y - r * 0.7} l${-r * 1.4},${r * 1.4}" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`;
  const bat = (x, y, k) =>
    `<path transform="translate(${x} ${y}) scale(${k})" d="M0,0 Q-6,-6 -14,-3 Q-10,0 -10,4 Q-6,1 -3,4 Q0,1 3,4 Q6,1 10,4 Q10,0 14,-3 Q6,-6 0,0 Z" fill="#2a2140"/>`;
  // Letters drawn as strokes (no fonts: react-native-svg has none to give)
  const GLYPH = {
    E: (x, y) => `M${x + 4},${y - 6} h-8 v12 h8 M${x - 4},${y} h6`,
    S: (x, y) => `M${x + 4},${y - 5} Q${x},${y - 9} ${x - 4},${y - 5} Q${x - 6},${y - 1} ${x},${y} Q${x + 6},${y + 1} ${x + 4},${y + 5} Q${x},${y + 9} ${x - 4},${y + 5}`,
    T: (x, y) => `M${x - 5},${y - 6} h10 M${x},${y - 6} v12`,
  };
  const tile = (x, y, a, ch) =>
    `<g transform="rotate(${a} ${x} ${y})" opacity=".9"><rect x="${x - 11}" y="${y - 12}" width="22" height="24" rx="5" fill="#ffe08a" stroke="${OUTLINE}" stroke-width="2"/>` +
    `<path d="${GLYPH[ch](x, y)}" fill="none" stroke="${OUTLINE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  const fill = (color) => `<rect x="0" y="0" width="200" height="200" fill="${color}"/>`;
  const rays = (n, color) => Array.from({ length: n }, (_, i) => {
    const a = (i * 360 / n * Math.PI) / 180, b = (((i + 0.47) * 360 / n) * Math.PI) / 180;
    const p = (t) => `${(100 + 140 * Math.cos(t)).toFixed(1)},${(80 + 140 * Math.sin(t)).toFixed(1)}`;
    return `<path d="M100,80 L${p(a)} L${p(b)} Z" fill="${color}"/>`;
  }).join('');

  // ring: the avatar's ring colour. bg: the backdrop, in rig coordinates.
  const AVATARS = {
    mochi: { ring: '#f08a4b', bg: () => fill('#ffd8b8') +
      [0, 1, 2, 3, 4, 5].map((i) => `<path d="M${-20 + i * 40},180 L${60 + i * 40},-20" stroke="#ffc59a" stroke-width="14"/>`).join('') },
    bun: { ring: '#7cc4f2', bg: () => fill('#cfeaff') + cloud(30, 40, 1.1) + cloud(140, 22, 0.8) + cloud(150, 120, 1) },
    coco: { ring: '#e0913f', bg: () => fill('#ffd27a') + rays(12, '#ffe3a3') },
    biscuit: { ring: '#7fbf5a', bg: () => fill('#d9f0ff') + `<path d="M0,128 Q60,110 100,124 Q150,140 200,118 L200,200 L0,200 Z" fill="#a8dc8a"/>` + cloud(36, 34, 0.8) },
    pip: { ring: '#6a9fd8', bg: () => fill('#bfe0f7') + snow(42, 40, 6) + snow(158, 30, 5) + snow(160, 112, 6) + snow(36, 120, 4.5) + snow(128, 14, 3.5) },
    bao: { ring: '#6fb48e', bg: () => fill('#d7f0dc') +
      [38, 160].map((x) => `<rect x="${x - 5}" y="-10" width="10" height="200" rx="4" fill="#9fd4a8"/><path d="M${x - 5},40 h10 M${x - 5},90 h10 M${x - 5},140 h10" stroke="#7fbf8b" stroke-width="2.5"/>`).join('') },
    koa: { ring: '#8c88c9', bg: () => fill('#c9c6ec') +
      `<circle cx="150" cy="34" r="13" fill="#fff6c9"/><circle cx="156" cy="29" r="12" fill="#c9c6ec"/>` + star(40, 36, 5, '#fff') + star(60, 120, 3.5, '#fff') + star(158, 104, 4, '#fff') },
    lolo: { ring: '#ff7fae', bg: () => fill('#ffd3e4') +
      [[40, 40, 8], [56, 22, 4], [154, 120, 9], [160, 36, 5], [34, 116, 5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#fff" stroke-width="2.5"/>`).join('') },
    rocco: { ring: '#5a536e', bg: () => fill('#4b4466') + `<ellipse cx="100" cy="70" rx="70" ry="64" fill="#635a85"/>` +
      tile(38, 96, -14, 'E') + tile(164, 92, 12, 'S') + tile(150, 136, -8, 'T') },
    ember: { ring: '#ff7a3d', bg: () => fill('#ffc7a6') + `<circle cx="100" cy="80" r="62" fill="#ffd9c2"/>` +
      star(40, 42, 8, '#fff') + star(160, 34, 6, '#ffe58a') + star(156, 118, 7, '#fff') },
    sage: { ring: '#8f5f42', bg: () => {
      // A shelf of books behind the head
      const books = ['#6a8fe0', '#e07a6a', '#7fbf8b', '#e0b84a', '#a07ad0'];
      let x = 22, out = fill('#f1dfc1');
      for (let i = 0; i < 12; i++) {
        const w = 11 + ((i * 7) % 6), h = 30 + (i % 3) * 3;
        out += `<rect x="${x}" y="${44 - h}" width="${w}" height="${h}" rx="2" fill="${books[i % 5]}" opacity=".55"/>`;
        x += w + 1;
      }
      return out + `<rect x="20" y="44" width="160" height="4" fill="#c9a77c"/>`;
    } },
    rexy: { ring: '#ff6a4d', bg: () => fill('#ffb59e') +
      `<path d="M0,40 L30,26 L54,46 L84,22 L112,44 L140,20 L168,42 L200,28 L200,0 L0,0 Z M0,150 L36,128 L64,146 L100,124 L134,146 L166,126 L200,144 L200,200 L0,200 Z" fill="#ff8f73"/>` },
    vesper: { ring: '#5b4d7a', bg: () => fill('#2f2a4f') +
      `<circle cx="100" cy="74" r="66" fill="#fff3c4" opacity=".25"/><circle cx="100" cy="74" r="58" fill="#fff3c4"/>` +
      bat(32, 112, 1.1) + bat(170, 104, 0.85) + star(150, 140, 3.5, '#fff') + star(40, 140, 3, '#fff') },
    button: { ring: '#e85d5d', bg: () => fill('#2f5a46') + `<ellipse cx="100" cy="150" rx="110" ry="40" fill="#3f7458"/>` +
      glow([[36, 40], [58, 108], [160, 50], [150, 120], [128, 22], [40, 140]], '#fff7a8') },
    ribbit: { ring: '#e0b02a', bg: () => fill('#8c6fd1') + `<rect x="60" y="0" width="80" height="170" fill="#a58ae0"/>` +
      `<path d="M60,0 L60,40 L80,30 L100,40 L120,30 L140,40 L140,0 Z" fill="#ffd34d" opacity=".5"/>` +
      star(36, 50, 6, '#ffd34d') + star(164, 110, 5, '#ffd34d') + star(160, 30, 4, '#fff') },
  };
  const avatarRing = (c) => (AVATARS[c.id] || {}).ring || OUTLINE;

  // The profile picture: the persona (without its lean, so the head sits in the middle) on its backdrop,
  // clipped to a circle that fills the viewBox. The app draws the ring natively; opts.ring draws it here.
  function avatar(c, opts = {}) {
    const look = AVATARS[c.id];
    const id = `av${++uid}`;
    const r = AV.s / 2, cx = AV.x + r, cy = AV.y + r;
    const pad = opts.ring ? 6 : 0;
    const body = render(c, { ...signature(c), lean: 0, bare: true });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${AV.x - pad} ${AV.y - pad} ${AV.s + 2 * pad} ${AV.s + 2 * pad}">` +
      `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
      `<g clip-path="url(#${id})">${look ? look.bg() : ''}${body}</g>` +
      (opts.ring
        ? `<circle cx="${cx}" cy="${cy}" r="${r + 1.5}" fill="none" stroke="#fff" stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="${r + 4.5}" fill="none" stroke="${avatarRing(c)}" stroke-width="4"/>`
        : '') +
      `</svg>`;
  }

  global.HangedRig = {
    render, signature, avatar, avatarRing, tube, CHARACTERS, POSES, JOINTS, FACE, VIEWBOX, OUTLINE, SW,
    EXPRESSIONS: ['happy', 'joy', 'nervous', 'worried', 'scared', 'ko'],
    // Attitude faces: the personas use them, the game never does
    MOODS: ['cool', 'smug', 'side', 'wink', 'fierce', 'calm', 'sleepy', 'blep', 'whoa'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
