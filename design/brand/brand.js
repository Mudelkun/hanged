/*
 * Hanged: the brand. The wordmark (Play's letter tiles, each hanging from one of
 * the game's balloons) and the loading screen (the word solves itself, the buddy
 * floats up, lift-off). Like rig.js, a plain script that attaches `HangedBrand` to
 * the global object and returns SVG strings: design/branding.html previews it,
 * design/brand/export.html renders the native splash image from it, and the app
 * draws it through src/brand/brand.ts. Change the brand here, never in a copy.
 *
 * Needs rig.js and balloons.js loaded first (the balloons, clouds and buddy).
 *
 * Text is drawn with the `fonts` you pass: SVG attributes for the bold and
 * semibold Fredoka. The browser default is a family + weight; the app passes
 * its loaded font names (an SVG on a phone can't pick a weight by number).
 */
(function (global) {
  const { OUTLINE: OUT, SW } = global.HangedRig;
  const B = global.BalloonAnim;
  const BAL = B.BALLOONS.map((b) => b[2]); // the game's balloon colours

  const FONTS = { bold: 'font-family="Fredoka" font-weight="700"', semi: 'font-family="Fredoka" font-weight="600"' };

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const ease = {
    in: (p) => p * p * p,
    inOut: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
    back: (p) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2,
  };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // ---- pieces ----
  const TILE = { w: 56, h: 64, r: 15, lip: 6 };
  const LOOK = {
    ok: { fill: '#5fd3a5', lip: '#38b283' }, // Play's correct letter
    clue: { fill: '#ffd667', lip: '#f0b43a' }, // Play's clue letter
  };
  /** A letter tile centred on x, y. No look = a hidden letter (dashed, empty). */
  function tile(ch, look, x, y, rot, s, fonts) {
    const { w, h, r, lip } = TILE, L = LOOK[look];
    const inner = L
      ? `<rect x="${-w / 2}" y="${-h / 2 + lip}" width="${w}" height="${h}" rx="${r}" fill="${L.lip}" stroke="${OUT}" stroke-width="${SW}"/>` +
        `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${r}" fill="${L.fill}" stroke="${OUT}" stroke-width="${SW}"/>` +
        `<path d="M${-w / 2 + 9},${-h / 2 + 21} q0,-11 11,-11 h10" stroke="#fff" stroke-opacity=".75" stroke-width="5" stroke-linecap="round" fill="none"/>` +
        `<text y="14.5" text-anchor="middle" ${fonts.bold} font-size="42" fill="${OUT}">${esc(ch)}</text>`
      : `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${r}" fill="#fff" fill-opacity=".8" stroke="#8cc0e4" stroke-width="3.5" stroke-dasharray="7 6"/>` +
        `<rect x="-11" y="${h / 2 - 16}" width="22" height="5" rx="2.5" fill="#8cc0e4"/>`;
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${s.toFixed(3)})">${inner}</g>`;
  }
  const SPARK = 'M0,-12 C1,-4 4,-1 12,0 C4,1 1,4 0,12 C-1,4 -4,1 -12,0 C-4,-1 -1,-4 0,-12 Z';
  const sparkle = (x, y, p) =>
    `<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(0.5 + p).toFixed(2)}) rotate(${(p * 90).toFixed(0)})" d="${SPARK}" fill="#ffd34d" stroke="#fff" stroke-width="2" opacity="${(1 - p * p).toFixed(2)}"/>`;
  /** A string from a balloon's knot (scale bs) to a point. */
  const string = (bx, by, bs, x, y, sway) => {
    const ky = by + 33 * bs;
    return `M${bx.toFixed(1)},${ky.toFixed(1)} Q${((bx + x) / 2 + sway).toFixed(1)},${((ky + y) / 2).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  };

  // ---- the wordmark ----
  // Per letter, in order (they repeat if the name gets longer than six letters)
  const WM = {
    look: ['ok', 'clue', 'ok', 'ok', 'clue', 'ok'], // mint and butter, as in Play
    bal: [9, 1, 3, 5, 0, 2], // red, sky, lilac, orange, pink, yellow
    bx: [-4, 3, -2, 4, -3, 2], by: [0, -12, 6, -8, 4, -14], ty: [0, -4, 2, -3, 1, -2], rot: [-6, 4, -3, 5, -4, 6],
    bs: 0.82, pitch: 66,
  };
  const at = (list, i) => list[i % list.length];
  // viewBoxes for a six-letter word: with its balloons (also the native splash image), and the tiles only
  const BOX = [-210, -148, 420, 250];
  const BOX_COMPACT = [-210, -48, 420, 140];

  /**
   * The wordmark's parts, in its own units (centred on 0, 0).
   * reveal: 0..1, or one per letter (0 = hidden, 1 = shown); hop: px per letter; pill: 0..1 (the
   * tagline popping in); bob: 0..1 of the float; balloons: false = the tiles only.
   */
  function wordmark({ word = 'HANGED', tagline = 'WORD GUESSING GAME', fonts = FONTS, t = 0, bob = 1, reveal = 1, hop = null, pill = 1, balloons = true } = {}) {
    const letters = [...word], mid = (letters.length - 1) / 2;
    let strings = '', bals = '', tiles = '';
    letters.forEach((ch, i) => {
      const ph = t * 1.7 + i * 0.8, dy = Math.sin(ph) * 3.5 * bob - (hop ? hop[i] : 0);
      const x = (i - mid) * WM.pitch, y = at(WM.ty, i) + dy;
      const rv = Array.isArray(reveal) ? reveal[i] : reveal;
      // The hidden tile swells like a balloon about to pop, then springs back as its letter
      const q = (rv - 0.3) / 0.7;
      const s = rv < 0.3 ? 1 + (0.14 * rv) / 0.3 : 1 + 0.14 * Math.exp(-4 * q) * Math.cos(9 * q);
      tiles += tile(ch, rv >= 0.3 ? at(WM.look, i) : null, x, y, at(WM.rot, i) + Math.sin(ph + 0.7) * 2.5 * bob, s, fonts);
      if (rv >= 0.3 && rv < 1) tiles += sparkle(x + 30, y - 34, q);
      if (!balloons) return;
      const bx = x + at(WM.bx, i) + Math.sin(ph * 0.7 + 1) * 2 * bob, by = -98 + at(WM.by, i) + dy * 1.2;
      strings += string(bx, by, WM.bs, x, y - TILE.h / 2 + 2, Math.sin(ph) * 4 * bob);
      bals += B.balloon(bx, by, BAL[at(WM.bal, i)], { scale: WM.bs }, t);
    });
    const half = Math.max(80, 15 + [...tagline].length * 6.4); // the pill fits its text
    const p = pill <= 0 ? '' :
      `<g transform="translate(0 ${balloons ? 76 : 70}) scale(${ease.back(pill).toFixed(3)})" opacity="${clamp(pill * 2).toFixed(2)}">` +
      `<rect x="${-half}" y="-17" width="${2 * half}" height="34" rx="17" fill="#fff" stroke="${OUT}" stroke-width="3"/>` +
      `<text y="6" text-anchor="middle" ${fonts.semi} font-size="16" letter-spacing="3" fill="#2a86c8">${esc(tagline)}</text></g>`;
    return (strings ? `<path d="${strings}" fill="none" stroke="${OUT}" stroke-width="2.2" stroke-linecap="round"/>` : '') + bals + tiles + p;
  }

  // ---- the loading screen ----
  // Seconds from the moment the app takes over from the native splash (which is frame 0)
  const SPLASH = {
    bg: '#dff1ff', // the native splash's background colour (app.json)
    scale: 0.8, // the wordmark's size on screen: BOX is 420 wide, so 336 points (app.json's imageWidth)
    start: 0.15, step: 0.1, flip: 0.34, // letter i turns from start + i * step, for flip seconds
    up: [1.05, 1.65], // the word rises to make room
    buddy: [1.25, 2.0], // the buddy floats up
    exit: 2.5, lift: 0.6, // lift-off
  };
  SPLASH.solved = SPLASH.start + 5 * SPLASH.step + SPLASH.flip;
  SPLASH.fade = [SPLASH.exit + 0.2, SPLASH.exit + SPLASH.lift + 0.1]; // the screen fades into the app
  SPLASH.end = SPLASH.fade[1];
  /** When letter i starts to turn. */
  SPLASH.letterAt = (i) => SPLASH.start + i * SPLASH.step;

  // Clouds [x, y as shares of the screen, scale]
  const SKY_CLOUDS = [[0.18, 0.18, 0.9], [0.82, 0.3, 0.7], [0.1, 0.66, 0.6], [0.9, 0.82, 0.8], [0.46, 0.94, 0.5]];
  // The buddy's balloon scene, without its sky or clouds, in scene units (the camera keeps the ground out)
  const buddyScene = (c, f) => `<g transform="translate(0 ${f.cam})">` +
    B.scene(c, f, { sky: false, clouds: false, camera: true }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + `</g>`;

  /**
   * The loading screen at second t, as an SVG filling a w × h screen. At t = 0 it's exactly the
   * native splash: the blank wordmark centred on the sky colour. character: the player's buddy
   * (a rig character), or null for a new player (the word plays alone). still: Reduce Motion's
   * single frame, the word shown and centred, nothing moving.
   */
  function splash(t, { w = 390, h = 844, character = null, word, tagline, fonts, still = false } = {}) {
    const S = SPLASH, n = [...(word || 'HANGED')].length, solved = S.letterAt(n - 1) + S.flip;
    if (still) t = solved + 0.5;
    const reveal = Array.from({ length: n }, (_, i) => seg(t, S.letterAt(i), S.letterAt(i) + S.flip));
    const hop = Array.from({ length: n }, (_, i) => 12 * Math.sin(Math.PI * seg(t, solved + i * 0.05, solved + i * 0.05 + 0.28)));
    const lift = ease.in(seg(t, S.exit, S.exit + S.lift));
    // Native splash: the wordmark box is centred on the screen. It then rises to make room, and flies off.
    const cy = BOX[1] + BOX[3] / 2;
    const wy = h / 2 - cy * S.scale - (still ? 0 : 100 * ease.inOut(seg(t, ...S.up))) - h * 0.97 * lift;
    const clouds = SKY_CLOUDS.map(([x, y, sc]) => B.cloud(x * w + t * 7, y * h + h * 0.73 * lift, sc)).join('');
    const sun = `<circle cx="${w - 72}" cy="118" r="30" fill="#ffe58a" stroke="#f5c84b" stroke-width="3"/>`;

    let buddy = '';
    const rise = seg(t, ...S.buddy);
    if (character && rise > 0 && !still) {
      const f = B.frame(0, 0, 1, t);
      if (lift > 0) f.expr = 'joy';
      const by = h / 2 + 46 + (1 - ease.back(rise)) * h * 0.62 - h * 1.16 * lift;
      buddy = `<g transform="translate(${(w / 2 - 195 * 0.9).toFixed(1)} ${by.toFixed(1)}) scale(0.9)">${buddyScene(character, f)}</g>`;
    }
    const mark = wordmark({ word, tagline, fonts, t, bob: still ? 0 : ease.inOut(seg(t, 0, 0.5)), reveal, hop: still ? null : hop, pill: seg(t, solved + 0.1, solved + 0.45) });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
      `<rect width="${w}" height="${h}" fill="${S.bg}"/>` +
      `<g opacity="${(still ? 1 : seg(t, 0.1, 0.7)).toFixed(2)}">${sun}${clouds}</g>` + buddy +
      `<g transform="translate(${w / 2} ${wy.toFixed(1)}) scale(${S.scale})">${mark}</g>` +
      `</svg>`;
  }

  global.HangedBrand = { wordmark, splash, tile, SPLASH, BOX, BOX_COMPACT, FONTS, TILE };
})(typeof window !== 'undefined' ? window : globalThis);
