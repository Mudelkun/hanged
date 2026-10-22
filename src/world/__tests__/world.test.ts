/*
 * The level path's world (design/world/world.js) at every level, on every phone
 * width the map and the level-up card use: every band must be drawable by
 * react-native-svg's parser (what the phone runs), with no broken numbers, and
 * the castle only on the top level.
 */
import { parse } from 'react-native-svg';

import { LEVELS } from '../../game/levels';
import { HangedWorld, worldBands } from '../world';

// Map widths (iPhone SE to Pro Max) and level-up card windows (card width − 32)
const WIDTHS = [320, 375, 393, 430, 288, 343, 328];
// The map's room over the last stop (the middle between sign and card), and the card's (half the window, plus the top's lift)
const ROOM = [[438, 400], [300, 260], [110, 128], [140, 237]];

describe('the level path world', () => {
  it.each(WIDTHS)('draws every level at %i pt wide, in bands the phone can parse', (width) => {
    for (const [below, above] of ROOM) {
      for (let shown = 1; shown <= LEVELS.length; shown++) {
        const layout = HangedWorld.layout(width, below, above, shown, LEVELS.length);
        const art = HangedWorld.art(layout, 'w');
        for (const piece of art.pieces) {
          expect(piece.y0).toBeLessThanOrEqual(piece.y1);
          expect(piece.svg).not.toMatch(/NaN|undefined|Infinity|null/);
        }
        for (let top = 0; top < layout.height; top += 512) {
          const xml = HangedWorld.slice(layout, art, 'w', top, Math.min(512, layout.height - top));
          expect(parse(xml)).not.toBeNull();
        }
      }
    }
  });

  it('puts the castle on the top level only, and the fog everywhere below it', () => {
    const castle = (shown: number) => {
      const layout = HangedWorld.layout(393, 438, 400, shown, LEVELS.length);
      return { more: layout.more, drawn: HangedWorld.art(layout, 'w').pieces.some((p) => p.svg.includes('#fff4ee')) };
    };
    expect(castle(LEVELS.length)).toEqual({ more: false, drawn: true });
    expect(castle(LEVELS.length - 1)).toEqual({ more: true, drawn: false });
    expect(castle(1)).toEqual({ more: true, drawn: false });
  });

  it('keeps the far mountain and the fog clouds drawable, the mountain above the last stop', () => {
    const layout = HangedWorld.layout(375, 438, 400, 8, LEVELS.length);
    const mountain = HangedWorld.farMountain(layout, 'f');
    expect(parse(mountain)).not.toBeNull();
    // Its picture ends above the last stop (and the character on it): the fog is drawn over them
    const height = Number(/height="(\d+)"/.exec(mountain)![1]);
    expect(height).toBeLessThan(layout.stops[layout.stops.length - 1].y - 80);
    // No room in a small window: no mountain
    expect(HangedWorld.farMountain(HangedWorld.layout(328, 140, 158, 5, LEVELS.length), 'f')).toBe('');
    const spots = HangedWorld.cloudSpots(layout);
    expect(spots.length).toBeGreaterThan(4);
    for (const s of spots) expect(Number.isFinite(s.left + s.top + s.w + s.drift)).toBe(true);
  });

  it('parses a layout once and reuses it', () => {
    const layout = HangedWorld.layout(393, 438, 400, 12, LEVELS.length);
    const first = worldBands(layout, 'cache');
    expect(worldBands(HangedWorld.layout(393, 438, 400, 12, LEVELS.length), 'cache')).toBe(first);
    expect(first.every((b) => b.ast !== null)).toBe(true);
  });
});
