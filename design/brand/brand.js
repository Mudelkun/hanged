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
  const SPARKLE = `<path d="${SPARK}" fill="#ffd34d" stroke="#fff" stroke-width="2"/>`;
  /** p: 0..1 through the sparkle: it grows, turns and fades. */
  const sparkle = (x, y, p) =>
    `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(0.5 + p).toFixed(2)}) rotate(${(p * 90).toFixed(0)})" opacity="${(1 - p * p).toFixed(2)}">${SPARKLE}</g>`;
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
  const SHOWN = 0.3; // a turning letter shows from here (0..1 of its turn)

  /** Letter i of n at second t, in wordmark units: its tile (x, y, rot) and its balloon (bx, by). bob: 0..1 of the float; hop: px up. */
  function letterPose(i, n, t, bob, hop) {
    const ph = t * 1.7 + i * 0.8, dy = Math.sin(ph) * 3.5 * bob - hop;
    const x = (i - (n - 1) / 2) * WM.pitch, y = at(WM.ty, i) + dy;
    return {
      x, y, rot: at(WM.rot, i) + Math.sin(ph + 0.7) * 2.5 * bob,
      bx: x + at(WM.bx, i) + Math.sin(ph * 0.7 + 1) * 2 * bob, by: -98 + at(WM.by, i) + dy,
    };
  }
  /** Where letter i's tile hangs from its balloon: the end of the string, from the balloon's centre. */
  const drop = (i, n) => {
    const p = letterPose(i, n, 0, 0, 0);
    return [p.x - p.bx, p.y - TILE.h / 2 + 2 - p.by];
  };
  /** Letter i's balloon around its own 0, 0, with its string down to its tile. */
  const letterBalloon = (i, n) =>
    `<path d="${string(0, 0, WM.bs, ...drop(i, n), 0)}" fill="none" stroke="${OUT}" stroke-width="2.2" stroke-linecap="round"/>` +
    B.balloon(0, 0, BAL[at(WM.bal, i)], { scale: WM.bs }, 0);
  /** A turning tile's size (rv: 0..1 of its turn): it swells like a balloon about to pop, then springs back as its letter. */
  function swell(rv) {
    const q = (rv - SHOWN) / (1 - SHOWN);
    return rv < SHOWN ? 1 + (0.14 * rv) / SHOWN : 1 + 0.14 * Math.exp(-4 * q) * Math.cos(9 * q);
  }
  const pillHalf = (tagline) => Math.max(80, 15 + [...tagline].length * 6.4); // the pill fits its text
  /** The tagline pill around its own 0, 0. */
  const pillSvg = (tagline, fonts) => {
    const half = pillHalf(tagline);
    return `<rect x="${-half}" y="-17" width="${2 * half}" height="34" rx="17" fill="#fff" stroke="${OUT}" stroke-width="3"/>` +
      `<text y="6" text-anchor="middle" ${fonts.semi} font-size="16" letter-spacing="3" fill="#2a86c8">${esc(tagline)}</text>`;
  };

  /**
   * The wordmark's parts, in its own units (centred on 0, 0).
   * reveal: 0..1, or one per letter (0 = hidden, 1 = shown); hop: px per letter; pill: 0..1 (the
   * tagline popping in); bob: 0..1 of the float; balloons: false = the tiles only.
   */
  function wordmark({ word = 'HANGED', tagline = 'WORD GUESSING GAME', fonts = FONTS, t = 0, bob = 1, reveal = 1, hop = null, pill = 1, balloons = true } = {}) {
    const letters = [...word], n = letters.length;
    let bals = '', tiles = '';
    letters.forEach((ch, i) => {
      const p = letterPose(i, n, t, bob, hop ? hop[i] : 0);
      const rv = Array.isArray(reveal) ? reveal[i] : reveal;
      tiles += tile(ch, rv >= SHOWN ? at(WM.look, i) : null, p.x, p.y, p.rot, swell(rv), fonts);
      if (rv >= SHOWN && rv < 1) tiles += sparkle(p.x + 30, p.y - 34, (rv - SHOWN) / (1 - SHOWN));
      if (balloons) bals += `<g transform="translate(${p.bx.toFixed(1)} ${p.by.toFixed(1)})">${letterBalloon(i, n)}</g>`;
    });
    return bals + tiles + (pill <= 0 ? '' :
      `<g transform="translate(0 ${balloons ? 76 : 70}) scale(${ease.back(pill).toFixed(3)})" opacity="${clamp(pill * 2).toFixed(2)}">${pillSvg(tagline, fonts)}</g>`);
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
  const SUN = '<circle r="30" fill="#ffe58a" stroke="#f5c84b" stroke-width="3"/>';
  const BUDDY = 0.9; // the buddy's scene, in points per scene unit
  // viewBoxes around each layer's 0, 0 (a balloon's height depends on its string). The buddy's
  // holds every character around its paw, with a margin for wider ears or props.
  const LAYER_BOX = {
    sun: [-32, -32, 64, 64], cloud: [-54, -26, 104, 44], sparkle: [-14, -14, 28, 28],
    tile: [-32, -36, 64, 78], balloon: [-24, -26, 48], buddy: [-100, -226, 156, 300],
  };

  /**
   * The loading screen as layers, back to front. A layer's drawing never changes, only where it is:
   * the app draws each one once and moves it on the UI thread, so the animation stays smooth on any
   * phone, even while the app loads underneath. splash() composes the same layers into one SVG.
   *
   * Each layer: svg, its drawing around its own 0, 0; box, a viewBox that holds it; unit, points per
   * unit; zoom, the largest scale it reaches (the app draws it that sharp); and at(t), where it is at
   * second t: x, y (its 0, 0 on screen, in points), r (degrees), s (scale) and o (opacity).
   * character: the player's buddy, or null for a new player (the word plays alone). still: Reduce
   * Motion's single frame, the word shown and centred, nothing moving.
   */
  function splashLayers({ w = 390, h = 844, character = null, word = 'HANGED', tagline = 'WORD GUESSING GAME', fonts = FONTS, still = false } = {}) {
    // The native splash's size (SPLASH.scale), so the hand-over is seamless; smaller only on a screen too
    // narrow for its 336 points with 12 to spare a side (under 360: never an iPhone, whose narrowest is 375)
    const S = SPLASH, k = Math.min(S.scale, (w - 24) / BOX[2]), letters = [...word], n = letters.length, solved = S.letterAt(n - 1) + S.flip;
    const layers = [];
    const add = (svg, box, unit, at, zoom = 1) => {
      const m = still && at(solved + 0.5);
      layers.push({ svg, box, unit, zoom, at: still ? () => m : at });
    };
    const pos = (x, y, r = 0, s = 1, o = 1) => ({ x, y, r, s, o });
    const lift = (t) => ease.in(seg(t, S.exit, S.exit + S.lift));
    const sky = (t) => (still ? 1 : seg(t, 0.1, 0.7));

    add(SUN, LAYER_BOX.sun, 1, (t) => pos(w - 72, 118, 0, 1, sky(t)));
    const cloud = B.cloud(0, 0, 1);
    SKY_CLOUDS.forEach(([x, y, sc]) => add(cloud, LAYER_BOX.cloud, sc, (t) => pos(x * w + t * 7, y * h + h * 0.73 * lift(t), 0, 1, sky(t))));

    // The buddy floats up from below, bobbing and swaying from its paw, and cheers at lift-off
    if (character) {
      const f = B.frame(0, 0, 1, 0, false), [px, py] = B.paw(f);
      const drawing = (expr) => `<g transform="translate(${-px} ${f.cam - py})">` +
        B.scene(character, { ...f, expr }, { sky: false, clouds: false, camera: true }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>';
      const buddy = (joy) => (t) => {
        const rise = seg(t, ...S.buddy), up = lift(t);
        const y = h / 2 + 46 + (1 - ease.back(rise)) * h * 0.62 - h * 1.16 * up;
        return pos(w / 2 + BUDDY * (px - 195), y + BUDDY * (py + Math.sin(t * 1.8) * 3), Math.sin(t * 1.3) * 2, 1,
          !still && rise > 0 && up > 0 === joy ? 1 : 0);
      };
      add(drawing(f.expr), LAYER_BOX.buddy, BUDDY, buddy(false));
      add(drawing('joy'), LAYER_BOX.buddy, BUDDY, buddy(true));
    }

    // The word: where the native splash has it (its box centred), then it rises to make room, and flies off
    const cy = BOX[1] + BOX[3] / 2;
    const mark = (t, x, y) => [w / 2 + x * k, h / 2 + (y - cy) * k - (still ? 0 : 100 * ease.inOut(seg(t, ...S.up))) - h * 0.97 * lift(t)];
    // Each letter turns in turn, and once the word is solved the tiles hop in a wave
    const pose = (t, i) => letterPose(i, n, t, still ? 0 : ease.inOut(seg(t, 0, 0.5)),
      still ? 0 : 12 * Math.sin(Math.PI * seg(t, solved + i * 0.05, solved + i * 0.05 + 0.28)));
    const reveal = (t, i) => seg(t, S.letterAt(i), S.letterAt(i) + S.flip);
    letters.forEach((_, i) => add(letterBalloon(i, n), [...LAYER_BOX.balloon, drop(i, n)[1] + 30], k, (t) => {
      const p = pose(t, i);
      return pos(...mark(t, p.bx, p.by));
    }));
    letters.forEach((ch, i) => {
      const tileAt = (shown) => (t) => {
        const p = pose(t, i), rv = reveal(t, i);
        return pos(...mark(t, p.x, p.y), p.rot, swell(rv), rv >= SHOWN === shown ? 1 : 0);
      };
      add(tile(ch, null, 0, 0, 0, 1, fonts), LAYER_BOX.tile, k, tileAt(false), 1.14);
      add(tile(ch, at(WM.look, i), 0, 0, 0, 1, fonts), LAYER_BOX.tile, k, tileAt(true), 1.14);
      add(SPARKLE, LAYER_BOX.sparkle, k, (t) => {
        const p = pose(t, i), rv = reveal(t, i), q = clamp((rv - SHOWN) / (1 - SHOWN));
        return pos(...mark(t, p.x + 30, p.y - 34), q * 90, 0.5 + q, rv >= SHOWN && rv < 1 ? 1 - q * q : 0);
      }, 1.5);
    });
    const half = pillHalf(tagline);
    add(pillSvg(tagline, fonts), [-half - 2, -19, 2 * half + 4, 38], k, (t) => {
      const p = seg(t, solved + 0.1, solved + 0.45);
      return pos(...mark(t, 0, 76), 0, ease.back(p), clamp(p * 2));
    }, 1.1);
    return layers;
  }

  /**
   * The loading screen at second t, as an SVG filling a w × h screen: its layers, composed (the
   * previews). At t = 0 it's exactly the native splash: the blank wordmark centred on the sky colour.
   */
  function splash(t, opts = {}) {
    const { w = 390, h = 844 } = opts;
    const parts = splashLayers(opts).map(({ svg, unit, at }) => {
      const { x, y, r, s, o } = at(t);
      return o <= 0 ? '' : `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(1)}) scale(${(s * unit).toFixed(3)})"` +
        `${o < 1 ? ` opacity="${o.toFixed(2)}"` : ''}>${svg}</g>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${SPLASH.bg}"/>${parts.join('')}</svg>`;
  }

  global.HangedBrand = { wordmark, splash, splashLayers, tile, SPLASH, BOX, BOX_COMPACT, FONTS, TILE };
})(typeof window !== 'undefined' ? window : globalThis);
