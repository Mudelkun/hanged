/*
 * Hanged: the level path's world (the level map and the level-up card).
 *
 * A winding road of stops, level 1 at the bottom, climbing terraces above a
 * sea of clouds: every stop sits on its own grassy plateau over a tall rock
 * cliff, joined by grassy ramps, with pines, fences, lanterns, cottages,
 * waterfalls and far floating islands. The goal is a castle with a crown: at
 * the top level it stands behind the last stop; below it, the app's fog hides
 * the road and only the castle's mountain shows, far away (`farMountain`).
 *
 * Plain script, like design/characters/rig.js: it attaches `HangedWorld` to
 * the global object and returns SVG strings. The design preview
 * (design/level-top.html) and the app (src/world/world.ts, rendered with
 * react-native-svg's SvgXml) both draw from it, so change the world here.
 * The SVG stays inside what SvgXml supports on iOS: no masks, no nested
 * <svg>, no filters, no paint-order.
 *
 * `art()` returns the world as a list of pieces, back to front, each with the
 * vertical range it covers, so the app can draw a tall world in bands and give
 * each band only the pieces it shows. The stops, the character and the fog are
 * not in it: the app draws them as views, on top.
 */
(function (global) {
  const C = {
    sky1: '#4aaeef', sky2: '#cdeeff', haze: '#e2f2ff', mist: '#eef8ff', cloudShade: '#cfe6f6',
    grass: '#8fd16a', grassL: '#addf88', grassD: '#64ad49',
    pine: '#3f915a', pineL: '#58ad66', pineD: '#2c7445', leaf: '#5fba68', leafL: '#86d58c', trunk: '#8a5a3a',
    rockT: '#e4ad7c', rockM: '#c98c60', rockB: '#a3704f', crack: '#8f5c3d', crackL: '#f3c99c',
    stone: '#d8d1c6', stoneD: '#a39a8e', road: '#efd5a1', roadD: '#cfa96b',
    wood: '#d9a066', woodD: '#9c6638', water: '#7fd0ff',
    far: '#b7d9a6', farCliff: '#d8b9a2', farCliffD: '#c9a58c', farPine: '#8fbf98', farPineL: '#a5cfab', farPineD: '#79a985',
    mountain: '#b4c3df', mountainD: '#9fb0d1',
    sun: '#ffd667', sunGlow: '#ffe593', gold: '#ffd667', goldD: '#f0b43a', coral: '#ff7b6b', coralD: '#e05a49',
  };
  /** Vertical distance between two stops. */
  const STEP = 84;
  /** A stop's size (the app draws the stop itself). */
  const NODE = 46;
  const CLIFF = 112;
  const RAMP = 104;
  const ROAD_W = 13;
  const ROAD_DASH = '5 8';
  const CLOUD_W = 104;
  /** Rows of clouds packed into the fog's bank where the road goes in. */
  const BANK_ROWS = 3;

  const f = Math.round;
  /** Circles as one path's data: same-coloured circles cost one SVG element, not one each. */
  const dots = (list) => list.map(([x, y, r]) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`).join('');
  /** A repeatable 0…1 number for decoration `n`, so the world looks the same on every visit. */
  const rand = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  // Each stretch of road is an S-curve: it leaves a stop straight up and enters the next straight up.
  const curve = (a, b) => `M${f(a.x)} ${f(a.y)}C${f(a.x)} ${f(a.y - STEP / 2)} ${f(b.x)} ${f(b.y + STEP / 2)} ${f(b.x)} ${f(b.y)}`;
  function bezier(a, b, s) {
    const u = 1 - s;
    const k0 = u * u * u, k1 = 3 * u * u * s, k2 = 3 * u * s * s, k3 = s * s * s;
    return { x: (k0 + k1) * a.x + (k2 + k3) * b.x, y: k0 * a.y + k1 * (a.y - STEP / 2) + k2 * (b.y + STEP / 2) + k3 * b.y };
  }
  /** The road's unit normal at s, pointing toward the viewer (down the screen) where it can. */
  function normal(a, b, s) {
    const p = bezier(a, b, Math.max(0, s - 0.01)), q = bezier(a, b, Math.min(1, s + 0.01));
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
    return n.y < 0 ? { x: -n.x, y: -n.y } : n;
  }

  /**
   * The stops of levels 1…`shown` (at most `levels`) on a path `width` wide, with
   * `below` of room under level 1 and `above` over the last stop.
   */
  function layout(width, below, above, shown, levels) {
    const count = Math.min(levels, Math.max(1, shown));
    const height = (count - 1) * STEP + below + above;
    const amp = Math.min(width * 0.27, 110);
    const at = (i) => ({ x: width / 2 + amp * Math.sin(i * 1.25), y: height - below - i * STEP });
    return {
      width, height, above, count,
      stops: Array.from({ length: count }, (_, i) => at(i)),
      /** Where the next stop would be, deep in the fog. Never drawn with its number. */
      hidden: at(count),
      /** There are levels past the last stop shown: the fog hides them. */
      more: count < levels,
    };
  }

  /* ---------- small things ---------- */
  const CLOUD = '<circle cx="28" cy="32" r="15"/><circle cx="48" cy="22" r="19"/><circle cx="70" cy="29" r="15"/><rect x="14" y="30" width="72" height="17" rx="8.5"/>';
  /** A cloud `w` wide (100 × 54 box), top-left at (x, y); `shade` adds its flat raised shadow. */
  const cloud = (x, y, w, opacity = 1, shade = true) =>
    `<g transform="translate(${f(x)} ${f(y)}) scale(${(w / 100).toFixed(3)})" opacity="${opacity}">${shade ? `<g fill="${C.cloudShade}" transform="translate(0 4)">${CLOUD}</g>` : ''}<g fill="#fff">${CLOUD}</g></g>`;
  const spark = (x, y, s, c = C.gold) =>
    `<path transform="translate(${f(x - s / 2)} ${f(y - s / 2)}) scale(${(s / 24).toFixed(3)})" d="M12 1.5c.9 5.6 4.9 9.6 10.5 10.5-5.6.9-9.6 4.9-10.5 10.5-.9-5.6-4.9-9.6-10.5-10.5C7.1 11.1 11.1 7.1 12 1.5z" fill="${c}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`;
  /** A crown `w` wide, its top-left at (x − w/2, y), 28 × 22 box, gold unless told otherwise. */
  const crown = (x, y, w, fill = C.gold, edge = C.goldD) =>
    `<g transform="translate(${f(x - w / 2)} ${f(y)}) scale(${(w / 28).toFixed(3)})"><path d="M2 19 4 6.5l6 5L14 2l4 9.5 6-5L26 19z" fill="${fill}" stroke="${edge}" stroke-width="2" stroke-linejoin="round"/><rect x="2" y="17" width="24" height="4.5" rx="2" fill="${edge}"/><circle cx="14" cy="2.5" r="2" fill="${C.coral}"/><circle cx="4" cy="6.5" r="1.7" fill="#6cc4ff"/><circle cx="24" cy="6.5" r="1.7" fill="#6cc4ff"/></g>`;
  const shadow = (x, y, rx) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * 0.28)}" fill="#2f5d2a" opacity=".18"/>`;

  function pine(x, y, s = 1, c = C) {
    const h = 54 * s, w = 32 * s;
    const tri = (apex, base, ww, fill) => `<path d="M${f(x)} ${f(apex)}L${f(x - ww / 2)} ${f(base)}H${f(x + ww / 2)}Z" fill="${fill}" stroke="${fill}" stroke-width="${f(3.5 * s)}" stroke-linejoin="round"/>`;
    const tri2 = (ls, fill) => `<path d="${ls.map(([apex, base, ww]) => `M${f(x)} ${f(apex)}L${f(x - ww / 2)} ${f(base)}H${f(x + ww / 2)}Z`).join('')}" fill="${fill}" stroke="${fill}" stroke-width="${f(3.5 * s) || 1}" stroke-linejoin="round"/>`;
    const layers = [[y - h * 0.62, y - h * 0.13, w], [y - h * 0.84, y - h * 0.4, w * 0.8], [y - h, y - h * 0.64, w * 0.58]];
    // The right halves in one path: the trees are lit from the left
    const shade = layers.map(([a, b, ww]) => `M${f(x)} ${f(a)}L${f(x + ww / 2)} ${f(b)}H${f(x + ww * 0.08)}Z`).join('');
    return shadow(x, y, w * 0.42) + `<rect x="${f(x - 3 * s)}" y="${f(y - h * 0.18)}" width="${f(6 * s)}" height="${f(h * 0.18)}" rx="${f(2 * s)}" fill="${C.trunk}"/>`
      + tri(...layers[0], c.pine) + tri2(layers.slice(1), c.pineL) + `<path d="${shade}" fill="${c.pineD}" opacity=".55"/>`;
  }
  const tree = (x, y, s = 1) => shadow(x, y, 14 * s)
    + `<rect x="${f(x - 3 * s)}" y="${f(y - 16 * s)}" width="${f(6 * s)}" height="${f(16 * s)}" rx="${f(2 * s)}" fill="${C.trunk}"/>`
    + `<path d="${dots([[x - 9 * s, y - 22 * s, 12 * s], [x + 9 * s, y - 22 * s, 12 * s], [x, y - 32 * s, 14 * s]])}" fill="${C.leaf}"/>`
    + `<path d="${dots([[x + 9 * s, y - 20 * s, 9 * s]])}" fill="${C.pineL}"/><path d="${dots([[x - 5 * s, y - 37 * s, 6 * s]])}" fill="${C.leafL}"/>`;
  const bush = (x, y, r) => `<path d="${dots([[x - r * 0.7, y, r * 0.75], [x + r * 0.7, y, r * 0.75], [x, y - r * 0.45, r]])}" fill="${C.leaf}"/>`
    + `<path d="${dots([[x - r * 0.3, y - r * 0.7, r * 0.38]])}" fill="${C.leafL}"/>`;
  const rock = (x, y, s = 1) => `<ellipse cx="${f(x)}" cy="${f(y - 5 * s)}" rx="${f(12 * s)}" ry="${f(8 * s)}" fill="#a9a094"/><ellipse cx="${f(x - 1.5 * s)}" cy="${f(y - 8 * s)}" rx="${f(9.5 * s)}" ry="${f(5.5 * s)}" fill="#d6cfc4"/>`;
  /** Flowers [x, y, colour]: the petals of each colour in one path, the gold hearts in another. */
  const flowers = (list) => [...new Set(list.map((l) => l[2]))].map((c) => `<path d="${dots(list.filter((l) => l[2] === c).map(([x, y]) => [x, y, 3.5]))}" fill="${c}"/>`).join('')
    + `<path d="${dots(list.map(([x, y]) => [x, y, 1.5]))}" fill="${C.gold}"/>`;
  function fence(pts) {
    const rails = [10, 5].map((h) => `M${pts.map((p) => `${f(p.x)} ${f(p.y - h)}`).join('L')}`).join('');
    return `<path d="${rails}" stroke="${C.wood}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`
      + pts.map((p) => `<rect x="${f(p.x - 2)}" y="${f(p.y - 15)}" width="4" height="16" rx="1.5" fill="${C.woodD}"/>`).join('');
  }
  const lantern = (x, y) => shadow(x, y, 6)
    + `<rect x="${f(x - 2)}" y="${f(y - 44)}" width="4" height="44" rx="2" fill="${C.woodD}"/><path d="M${f(x)} ${f(y - 42)}h11" stroke="${C.woodD}" stroke-width="3" stroke-linecap="round"/>`
    + `<circle cx="${f(x + 11)}" cy="${f(y - 31)}" r="11" fill="#fff3b0" opacity=".55"/><rect x="${f(x + 6)}" y="${f(y - 38)}" width="10" height="13" rx="2.5" fill="${C.gold}" stroke="${C.woodD}" stroke-width="2"/>`;
  function cottage(x, y, s = 1) {
    const p = (dx, dy) => `${f(x + dx * s)} ${f(y + dy * s)}`;
    return shadow(x, y, 20 * s)
      + `<path d="M${p(-15, 0)}V${f(y - 20 * s)}H${f(x + 15 * s)}V${f(y)}Z" fill="#fff1dc"/><path d="M${p(2, 0)}V${f(y - 20 * s)}H${f(x + 15 * s)}V${f(y)}Z" fill="#f0dcc0"/>`
      + `<path d="M${p(6, -26)}V${f(y - 38 * s)}H${f(x + 12 * s)}V${f(y - 26 * s)}Z" fill="#b0715a"/>`
      + `<path d="M${p(-20, -18)}L${p(0, -36)}L${p(20, -18)}Z" fill="#e8705f" stroke="#e8705f" stroke-width="${f(3 * s)}" stroke-linejoin="round"/><path d="M${p(0, -36)}L${p(20, -18)}H${f(x + 4 * s)}Z" fill="#c95646"/>`
      + `<rect x="${f(x - 10 * s)}" y="${f(y - 11 * s)}" width="${f(7 * s)}" height="${f(11 * s)}" rx="${f(3 * s)}" fill="#a3704f"/><rect x="${f(x + 4 * s)}" y="${f(y - 14 * s)}" width="${f(7 * s)}" height="${f(6 * s)}" rx="${f(1.5 * s)}" fill="${C.gold}"/>`;
  }
  /** The castle, its gate at (x, y). Its crown tops out about 150·s above y. */
  function castle(x, y, s = 1) {
    const wall = '#fff4ee', side = '#f3ddd3';
    const box = (x0, y0, w, h, fill) => `<path d="M${f(x0)} ${f(y0)}h${f(w)}v${f(h)}h${f(-w)}Z" fill="${fill}"/>`;
    const tower = (cx, w, top, roofH) => box(cx - w / 2, y - top, w, top, wall) + box(cx + w * 0.1, y - top, w * 0.4, top, side)
      + `<path d="M${f(cx - w / 2 - 4 * s)} ${f(y - top)}L${f(cx)} ${f(y - top - roofH)}L${f(cx + w / 2 + 4 * s)} ${f(y - top)}Z" fill="${C.coral}" stroke="${C.coral}" stroke-width="${f(2 * s)}" stroke-linejoin="round"/>`
      + `<path d="M${f(cx)} ${f(y - top - roofH)}L${f(cx + w / 2 + 4 * s)} ${f(y - top)}H${f(cx + 2 * s)}Z" fill="${C.coralD}"/>`
      + `<path d="M${f(cx - 3.5 * s)} ${f(y - top * 0.55)}v${f(-7 * s)}a${f(3.5 * s)} ${f(3.5 * s)} 0 0 1 ${f(7 * s)} 0v${f(7 * s)}Z" fill="#6a5ae0" opacity=".75"/>`;
    let merlons = '';
    for (let mx = x - 34 * s; mx < x + 32 * s; mx += 10 * s) merlons += `M${f(mx)} ${f(y - 52 * s)}h${f(6 * s)}v${f(7 * s)}h${f(-6 * s)}Z`;
    const pennant = (px, py, c) => `<path d="M${f(px)} ${f(py)}v${f(-16 * s)}" stroke="${C.woodD}" stroke-width="${f(2 * s)}"/><path d="M${f(px)} ${f(py - 16 * s)}l${f(13 * s)} ${f(4 * s)}l${f(-13 * s)} ${f(4 * s)}Z" fill="${c}"/>`;
    return shadow(x, y + 2, 64 * s)
      + tower(x - 44 * s, 24 * s, 70 * s, 34 * s) + tower(x + 44 * s, 24 * s, 70 * s, 34 * s)
      + pennant(x - 44 * s, y - 104 * s, C.gold) + pennant(x + 44 * s, y - 104 * s, '#5bb8f5')
      + box(x - 34 * s, y - 46 * s, 68 * s, 46 * s, wall) + box(x + 6 * s, y - 46 * s, 28 * s, 46 * s, side) + `<path d="${merlons}" fill="${wall}"/>`
      + box(x - 17 * s, y - 88 * s, 34 * s, 46 * s, wall) + box(x + 2 * s, y - 88 * s, 15 * s, 46 * s, side)
      + `<path d="M${f(x - 22 * s)} ${f(y - 88 * s)}L${f(x)} ${f(y - 124 * s)}L${f(x + 22 * s)} ${f(y - 88 * s)}Z" fill="${C.coral}" stroke="${C.coral}" stroke-width="${f(2 * s)}" stroke-linejoin="round"/>`
      + `<path d="M${f(x)} ${f(y - 124 * s)}L${f(x + 22 * s)} ${f(y - 88 * s)}H${f(x + 2 * s)}Z" fill="${C.coralD}"/>`
      + `<circle cx="${f(x)}" cy="${f(y - 70 * s)}" r="${f(6 * s)}" fill="${C.gold}" stroke="${C.goldD}" stroke-width="${f(2 * s)}"/>`
      + `<path d="M${f(x - 10 * s)} ${f(y)}v${f(-14 * s)}a${f(10 * s)} ${f(10 * s)} 0 0 1 ${f(20 * s)} 0v${f(14 * s)}Z" fill="#8a5a3a"/><path d="M${f(x)} ${f(y)}v${f(-23 * s)}" stroke="#6e4329" stroke-width="${f(1.5 * s)}"/>`
      + `<g transform="rotate(-6 ${f(x)} ${f(y - 132 * s)})">${crown(x, y - 150 * s, 30 * s)}</g>`;
  }
  /** A floating island far away: pale, with two little pines. */
  function island(x, y, s) {
    const w = 110 * s, h = 70 * s;
    const far = { pine: C.farPine, pineL: C.farPineL, pineD: C.farPineD };
    return `<g opacity=".95"><path d="M${f(x - w / 2)} ${f(y)}C${f(x - w / 2)} ${f(y + h * 0.5)} ${f(x - w * 0.14)} ${f(y + h * 0.8)} ${f(x)} ${f(y + h)}C${f(x + w * 0.14)} ${f(y + h * 0.8)} ${f(x + w / 2)} ${f(y + h * 0.5)} ${f(x + w / 2)} ${f(y)}Z" fill="${C.farCliff}"/>`
      + `<path d="M${f(x + w * 0.08)} ${f(y)}C${f(x + w * 0.1)} ${f(y + h * 0.5)} ${f(x + w * 0.06)} ${f(y + h * 0.8)} ${f(x)} ${f(y + h)}C${f(x + w * 0.14)} ${f(y + h * 0.8)} ${f(x + w / 2)} ${f(y + h * 0.5)} ${f(x + w / 2)} ${f(y)}Z" fill="${C.farCliffD}"/>`
      + `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(w / 2 + 3)}" ry="${f(11 * s)}" fill="${C.far}"/>${pine(x - w * 0.22, y + 2 * s, 0.55 * s, far)}${pine(x + w * 0.12, y, 0.7 * s, far)}</g>`;
  }
  const waterfall = (id, x, y, len, w = 15) =>
    `<rect x="${f(x - w / 2)}" y="${f(y)}" width="${w}" height="${f(len)}" rx="${w / 2}" fill="url(#${id}Fall)"/>`
    + `<path d="M${f(x - w * 0.2)} ${f(y + 8)}v${f(len * 0.55)}M${f(x + w * 0.18)} ${f(y + 18)}v${f(len * 0.35)}" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>`
    + `<ellipse cx="${f(x)}" cy="${f(y + 2)}" rx="${f(w * 0.7)}" ry="4" fill="#e9f8ff"/>`;

  /* ---------- terrain ---------- */
  // A terrace's grass is an ellipse (a stop's plateau) or a thick stroke along the road (a ramp)
  const plateau = (p, big = 0) => ({ e: true, cx: p.x, cy: p.y + 10, rx: 74 + big, ry: 36 + big * 0.35 });
  const ramp = (a, b) => ({ a, b, d: curve(a, b), w: RAMP });
  const shapeSvg = (sh, dy, fill, shrink = 0) => sh.e
    ? `<ellipse cx="${f(sh.cx)}" cy="${f(sh.cy + dy)}" rx="${f(sh.rx - shrink)}" ry="${f(sh.ry - shrink * 0.7)}" fill="${fill}"/>`
    : `<path d="${sh.d}" transform="translate(0 ${dy})" stroke="${fill}" stroke-width="${sh.w - shrink * 2}" fill="none"/>`;

  /** The bottom outline of a shape, left to right, as [x, y] points: where its cliff hangs from. */
  function lowerEdge(sh) {
    if (sh.e) {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const x = sh.cx - sh.rx + (2 * sh.rx * i) / 20, u = (x - sh.cx) / sh.rx;
        pts.push([x, sh.cy + sh.ry * Math.sqrt(Math.max(0, 1 - u * u))]);
      }
      return pts;
    }
    // A thick stroke: sample it across and along, keep the lowest point in each 6 pt column
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const s = i / 60, p = bezier(sh.a, sh.b, s), n = normal(sh.a, sh.b, s);
      for (let d = -1; d <= 1; d += 0.25) pts.push([p.x + (n.x * d * sh.w) / 2, p.y + (n.y * d * sh.w) / 2]);
    }
    const x0 = Math.min(...pts.map((q) => q[0])), x1 = Math.max(...pts.map((q) => q[0]));
    const cols = Math.ceil((x1 - x0) / 6) + 1, low = new Array(cols).fill(-Infinity);
    for (const [x, y] of pts) {
      const k = Math.round((x - x0) / 6);
      if (y > low[k]) low[k] = y;
    }
    for (let k = 0; k < cols; k++) if (low[k] === -Infinity) low[k] = k > 0 ? low[k - 1] : low.find((y) => y > -Infinity);
    return low.map((y, k) => [Math.min(x0 + k * 6, x1), y]);
  }

  /** The rock face under a shape: its bottom outline extruded down, lit from the left, cracked. */
  function cliff(sh, id, depth = CLIFF) {
    const edge = lowerEdge(sh);
    const d = `M${edge.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}L${edge.slice().reverse().map(([x, y]) => `${f(x)} ${f(y + depth)}`).join('L')}Z`;
    let dark = '', light = '';
    const x0 = edge[0][0], x1 = edge[edge.length - 1][0], yAt = (x) => edge[Math.round(((x - x0) / (x1 - x0 || 1)) * (edge.length - 1))][1];
    for (let k = 0, x = x0 + 6 + rand(x0) * 8; x < x1 - 4; k++, x += 10 + rand(x + k) * 11) {
      const top = yAt(x) + 8 + rand(x * 1.3) * depth * 0.25;
      const len = Math.min(16 + rand(x * 2.1) * depth * 0.45, yAt(x) + depth - 8 - top);
      if (len < 6) continue;
      dark += `M${f(x)} ${f(top)}v${f(len)}`;
      if (k % 2) light += `M${f(x - 4)} ${f(top + 6)}v${f(len * 0.5)}`;
    }
    const right = edge.filter(([x]) => x >= x0 + (x1 - x0) * 0.55);
    const shade = right.length > 1 ? `M${right.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}L${right.slice().reverse().map(([x, y]) => `${f(x)} ${f(y + depth * 0.85)}`).join('L')}Z` : ''
    return `<path d="${d}" fill="url(#${id}RockV)"/>` + (shade ? `<path d="${shade}" fill="#5a3420" opacity=".13"/>` : '')
      + (dark ? `<path d="${dark}" stroke="${C.crack}" stroke-opacity=".42" stroke-width="2.2" stroke-linecap="round" fill="none"/>` : '')
      + (light ? `<path d="${light}" stroke="${C.crackL}" stroke-opacity=".55" stroke-width="1.5" stroke-linecap="round" fill="none"/>` : '');
  }
  const lip = (sh) => shapeSvg(sh, 7, C.grassD);
  const grass = (sh) => shapeSvg(sh, 0, C.grass);
  const shine = (sh) => shapeSvg(sh, -3, C.grassL, 14);
  /** The vertical range a terrace covers, its cliff included. */
  const span = (sh, depth = CLIFF) => (sh.e ? [sh.cy - sh.ry - 4, sh.cy + sh.ry + depth + 8] : [sh.b.y - sh.w / 2 - 4, sh.a.y + sh.w / 2 + depth + 8]);

  /** The gradients `art` refers to, with ids prefixed by `id` (each picture needs its own). */
  function defs(L, id) {
    const last = L.stops[L.stops.length - 1];
    return `<defs>
<linearGradient id="${id}Sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${f(L.height)}"><stop offset="0" stop-color="${C.sky1}"/><stop offset="1" stop-color="${C.sky2}"/></linearGradient>
<linearGradient id="${id}RockV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.rockT}"/><stop offset=".3" stop-color="${C.rockT}"/><stop offset=".62" stop-color="${C.rockM}"/><stop offset=".85" stop-color="${C.rockB}"/><stop offset="1" stop-color="${C.haze}"/></linearGradient>
<linearGradient id="${id}Fall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.water}"/><stop offset=".65" stop-color="#bfe9ff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="${id}Glow" gradientUnits="userSpaceOnUse" cx="${f(last.x + 40)}" cy="${f(last.y - 175)}" r="340"><stop offset="0" stop-color="#fff4c4"/><stop offset=".45" stop-color="#ffe9a8" stop-opacity=".55"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
</defs>`;
  }

  /**
   * The world, back to front: { defs, pieces: [{ y0, y1, svg }] }. With levels
   * past the last stop (`layout.more`) a plank bridge runs from it into the fog;
   * on the top level the castle stands behind the last stop, in the sun.
   */
  function art(L, id) {
    const { width: W, height: H, stops } = L, last = stops[stops.length - 1], summit = !L.more;
    const pieces = [];
    const put = (y0, y1, svg) => pieces.push({ y0, y1, svg });
    const deco = [];
    const add = (y, top, svg) => deco.push({ y, y0: y - top, svg });

    // Far away: soft clouds, floating islands, the sun
    for (let k = 0, y = 90; y < H - 40; k++, y += 150 + rand(k) * 60) {
      const w = 140 + rand(k + 9) * 80, x = W * (0.1 + rand(k + 50) * 0.8);
      put(y, y + w * 0.54, cloud(x - w / 2, y, w, 0.55, false));
    }
    for (let k = 0, y = 140; y < H - 160; k++, y += 150 + rand(k + 20) * 70) {
      const side = k % 2 ? 1 : -1, s = 0.55 + rand(k + 40) * 0.35;
      put(y - 40, y + 72 * s, island(W / 2 + side * W * (0.39 + rand(k + 31) * 0.07), y, s));
    }
    // The castle's size fits the sky over the last stop, so it's never cut off
    const castleS = Math.max(0.5, Math.min(0.95, (L.above - 40) / 190));
    if (summit) {
      const sun = { x: last.x + 40, y: last.y - 175 * Math.min(1, castleS / 0.95) };
      let rays = '';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, b = a + Math.PI / 16, r = 560;
        rays += `M${f(sun.x)} ${f(sun.y)}L${f(sun.x + r * Math.cos(a))} ${f(sun.y + r * Math.sin(a))}L${f(sun.x + r * Math.cos(b))} ${f(sun.y + r * Math.sin(b))}Z`;
      }
      put(0, last.y + 160, `<rect width="${W}" height="${f(last.y + 160)}" fill="url(#${id}Glow)"/>`);
      put(sun.y - 560, sun.y + 560, `<path d="${rays}" fill="#fff6cf" opacity=".42"/>`);
      put(sun.y - 50, sun.y + 50, `<circle cx="${f(sun.x)}" cy="${f(sun.y)}" r="46" fill="${C.sunGlow}" opacity=".55"/><circle cx="${f(sun.x)}" cy="${f(sun.y)}" r="34" fill="${C.sun}"/>`);
    } else {
      const sy = Math.max(130, last.y - 250);
      put(sy - 32, sy + 32, `<circle cx="${f(W * 0.18)}" cy="${f(sy)}" r="30" fill="${C.sunGlow}" opacity=".9"/>`);
    }

    // Terraces from the top down: each stop's plateau, and the ramp climbing to it from the stop below.
    // A plateau's grass covers the top of its ramp's cliff; the plateau below covers the ramp's foot.
    for (let k = stops.length - 1; k >= 0; k--) {
      const p = stops[k], pl = plateau(p, summit && k === stops.length - 1 ? 34 : 0), rp = k > 0 ? ramp(stops[k - 1], p) : null;
      const [y0, y1] = rp ? [Math.min(span(pl)[0], span(rp)[0]), Math.max(span(pl)[1], span(rp)[1])] : span(pl);
      let svg = cliff(pl, id) + (rp ? cliff(rp, id) : '');
      svg += rp ? lip(rp) + lip(pl) + grass(rp) + grass(pl) + shine(rp) + shine(pl) : lip(pl) + grass(pl) + shine(pl);
      if (rp && k % 3 === 1) {
        const a = stops[k - 1], m = bezier(a, p, 0.5), n = normal(a, p, 0.5);
        svg += waterfall(id, m.x + n.x * (RAMP / 2 - 8), m.y + n.y * (RAMP / 2 - 8) + 2, CLIFF + 40);
      }
      put(y0, y1 + 40, svg);
    }
    // The meadow at the foot
    const by = stops[0].y;
    const base = { e: true, cx: W / 2, cy: by + 66, rx: W * 0.62, ry: 54 };
    put(by + 8, by + 66 + 54 + 158, cliff(base, id, 150) + lip(base) + grass(base) + shine(base));

    // The road: a dirt track with white dashes, one piece per stretch
    stops.slice(1).forEach((p, i) => {
      const d = curve(stops[i], p);
      put(p.y - 12, stops[i].y + 12,
        `<path d="${d}" stroke="${C.roadD}" stroke-width="${ROAD_W + 5}" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${C.road}" stroke-width="${ROAD_W}" stroke-linecap="round" fill="none"/>`
        + `<path d="${d}" stroke="#fff" stroke-opacity=".85" stroke-width="2.5" stroke-dasharray="${ROAD_DASH}" stroke-linecap="round" fill="none"/>`);
    });
    if (!summit) {
      const d = curve(last, L.hidden);
      put(L.hidden.y - 12, last.y + 12, `<path d="${d}" stroke="${C.woodD}" stroke-width="17" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${C.wood}" stroke-width="12" stroke-dasharray="5 3" fill="none"/>`);
    }
    // A stone ring under every stop
    stops.forEach((p) => {
      const blocks = [-22, -8, 8, 22].map((dx) => `M${f(p.x + dx)} ${f(p.y + 6)}v${f(12 - Math.abs(dx) * 0.15)}`).join('');
      put(p.y - 4, p.y + 32, `<ellipse cx="${f(p.x)}" cy="${f(p.y + 17)}" rx="34" ry="13" fill="${C.stoneD}"/><ellipse cx="${f(p.x)}" cy="${f(p.y + 12)}" rx="33" ry="12" fill="${C.stone}"/><path d="${blocks}" stroke="${C.stoneD}" stroke-width="1.4"/>`);
    });

    // Things on the terraces, sorted back to front
    stops.forEach((p, i) => {
      const next = stops[i + 1] || stops[i - 1] || { x: p.x + 1 };
      // The road leaves for the next stop on one side: decorate the other
      const free = next.x > p.x ? -1 : 1;
      if (summit && i === stops.length - 1) {
        const side = p.x < W / 2 ? 1 : -1;
        add(p.y - 34, 160 * castleS, castle(p.x + side * 46, p.y - 34, castleS));
        add(p.y - 4, 50, pine(p.x - side * 62, p.y - 4, 0.9));
        add(p.y + 34, 50, pine(p.x - side * 88, p.y + 34, 0.8) + bush(p.x + side * 92, p.y + 30, 11));
        return;
      }
      if (i % 5 === 3) {
        add(p.y - 6, 40, cottage(p.x + free * 56, p.y - 6, 0.95));
        add(p.y - 24, 40, pine(p.x + free * 40, p.y - 24, 0.7));
      } else {
        add(p.y, 56, pine(p.x + free * 54, p.y, 1));
        add(p.y + 16, 42, pine(p.x + free * 68, p.y + 16, 0.75));
      }
      add(p.y + 30, 14, rock(p.x + free * 38, p.y + 30, 0.8) + flowers([[p.x + free * 20, p.y + 34, '#fff'], [p.x - free * 44, p.y + 30, '#ffb3c7']]));
      if (i % 3 === 2) add(p.y + 24, 46, lantern(p.x - free * 40, p.y + 24));
      else add(p.y + 28, 16, bush(p.x - free * 50, p.y + 28, 9));
    });
    stops.slice(1).forEach((p, k) => {
      const a = stops[k];
      const off = (s, d) => {
        const q = bezier(a, p, s), n = normal(a, p, s);
        return { x: q.x + n.x * d, y: q.y + n.y * d };
      };
      const t = off(0.5, -34);
      add(t.y, 52, k % 2 ? tree(t.x, t.y, 0.85) : pine(t.x, t.y, 0.9));
      const t2 = off(0.25, -30);
      add(t2.y, 16, bush(t2.x, t2.y, 8));
      // A fence on the cliff side, except where the waterfall spills over it
      if ((k + 1) % 3 !== 1) {
        const pts = [0.32, 0.5, 0.68].map((s) => off(s, 30));
        add(pts[1].y, 20, fence(pts));
      }
      const fl = off(0.82, 24);
      add(fl.y, 6, flowers([[fl.x, fl.y, '#fff'], [fl.x + 9, fl.y + 4, '#fff3b0']]));
    });
    [[0.12, 44, 1.1, pine], [0.2, 70, 0.9, tree], [0.85, 40, 1.15, pine], [0.76, 66, 0.8, pine], [0.92, 82, 0.9, tree], [0.06, 90, 0.9, pine]].forEach(([fx, dy, s, draw]) =>
      add(by + dy, 64, draw(W * fx, by + dy, s)));
    deco.sort((a, b) => a.y - b.y).forEach((d) => put(d.y0, d.y + 8, d.svg));

    // Clouds in front, around the cliffs' feet, never over the road
    stops.forEach((p, i) => {
      if (i % 2) return;
      const w = 160 + rand(i + 3) * 40, y = p.y + 70 + rand(i) * 20;
      put(y, y + w * 0.58, cloud(p.x < W / 2 ? -70 : W - 90, y, w, 0.95));
    });
    [[-40, 150, 200], [W * 0.35, 168, 190], [W - 150, 150, 210]].forEach(([x, dy, w]) => put(by + dy, by + dy + w * 0.58, cloud(x, by + dy, w)));

    // The top: a gold ring around the last stop and a few sparkles
    if (summit) {
      put(last.y - 40, last.y + 46, `<circle cx="${f(last.x)}" cy="${f(last.y)}" r="32" fill="none" stroke="${C.gold}" stroke-width="3.5" opacity=".95"/>`
        + spark(last.x - 42, last.y - 20, 17) + spark(last.x + 38, last.y + 26, 13) + spark(last.x - 34, last.y + 34, 10, '#fff'));
    }
    return { defs: defs(L, id), pieces };
  }

  /** One slice of the world as a whole <svg>, `top` to `top + height`, with only the pieces it shows. */
  function slice(L, world, id, top, height) {
    const body = world.pieces.filter((p) => p.y1 >= top && p.y0 <= top + height).map((p) => p.svg).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${f(height)}" viewBox="0 ${f(top)} ${L.width} ${f(height)}">${world.defs}`
      + `<rect x="0" y="${f(top)}" width="${L.width}" height="${f(height)}" fill="url(#${id}Sky)"/>${body}</svg>`;
  }

  /**
   * The fog's clouds: a thick bank of overlapping clouds where the road goes in,
   * then sparse, fainter puffs drifting in the mist up to the top of the path.
   * Listed top first, so the lower clouds overlap the ones behind them.
   * `shade`: the front row and the puffs have a flat shadow; the bank's back rows
   * don't (overlapping shadows drew a hard line). `drift`: how far it sways.
   */
  function cloudSpots(L) {
    const spots = [];
    for (let row = 0, y = L.hidden.y + 12; y > -CLOUD_W / 2; row++) {
      const bank = row < BANK_ROWS;
      const xs = bank ? (row % 2 ? [0.02, 0.36, 0.7, 1.02] : [0.08, 0.38, 0.66, 0.95]) : [row % 2 ? 0.26 : 0.76];
      xs.forEach((fx, k) => {
        const w = CLOUD_W * (bank ? 1.25 : 1.05) * (1 + ((row + k) % 3) * 0.1);
        // Neighbours drift opposite ways, so the fog breathes instead of sliding
        const drift = ((row + k) % 2 ? 1 : -1) * (5 + ((row * 3 + k) % 4) * 2);
        // Staggered up and down, so the bank's flat cloud bottoms never line up into a hard edge
        const jitter = (((row * 5 + k * 7) % 3) - 1) * 9;
        spots.push({ left: fx * L.width - w / 2, top: y - w / 4 + jitter, w, drift, opacity: bank ? 1 : 0.6, shade: !bank || row === 0 });
      });
      y -= bank ? 30 : 70;
    }
    return spots.reverse();
  }

  /**
   * The castle's mountain far away, poking out of the fog above the last stop:
   * the goal, never how far it is. A whole <svg> `L.width` wide, drawn from the
   * world's top. Its foot stays inside the fog's cloud bank, well above the last
   * stop: the fog is drawn over the stops. Empty when there's no room for it.
   */
  function farMountain(L, id) {
    const foot = L.hidden.y - 24, peak = Math.max(120, foot - 190), k = (foot - peak) / 190;
    if (k < 0.4) return '';
    const mx = L.width * 0.74, height = Math.ceil(foot + 4);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${height}" viewBox="0 0 ${L.width} ${height}"><defs>`
      + `<linearGradient id="${id}Mtn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.mountain}"/><stop offset=".75" stop-color="${C.mountain}" stop-opacity=".6"/><stop offset="1" stop-color="${C.mist}" stop-opacity="0"/></linearGradient></defs>`
      // Drawn with its peak at (0, 0) and its foot 190 below, then placed and scaled to fit
      + `<g transform="translate(${f(mx)} ${f(peak)}) scale(${k.toFixed(3)})" opacity=".9">`
      + `<path d="M-120 190C-70 90-40 30-12 6Q0-4 12 6C44 34 80 100 130 190Z" fill="url(#${id}Mtn)"/>`
      + `<path d="M0 0L12 6C44 34 80 100 130 190H20C30 120 10 60 0 0Z" fill="${C.mountainD}" opacity=".6"/>`
      + `<g opacity=".85">${castle(0, 8, 0.42)}</g></g></svg>`;
  }

  global.HangedWorld = { COLORS: C, STEP, NODE, ROAD_W, ROAD_DASH, CLOUD_W, layout, curve, bezier, art, slice, cloudSpots, farMountain, cloud, crown };
})(typeof window !== 'undefined' ? window : globalThis);
