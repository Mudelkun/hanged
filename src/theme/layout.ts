/*
 * How the screens adapt to the device (Context/responsive.md): the one place
 * that turns the window and its safe area into sizes, so every screen agrees.
 *
 * - Phones use their whole width. Short ones tighten in two steps, from the
 *   height actually usable (the window minus the notch and the home
 *   indicator): `compact` (iPhone SE, mini, Surface Duo), then `tight`
 *   (320×568 class).
 * - A tablet shows the app in a centred column, sized from the height so it
 *   keeps a phone's proportions, with the paper running on at the sides. The
 *   game pieces (scene, tiles, keys) grow with `scale`; text keeps its size,
 *   as on iPad (points there are already bigger).
 */
import { useContext, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

/** Screens whose shortest side is at least this are tablets (iPad mini: 744). */
const TABLET_FROM = 600;
/** The tablet column: this share of the height (about a big phone's shape), within these bounds. */
const COLUMN_SHARE = 0.56;
const COLUMN_MIN = 520;
const COLUMN_MAX = 760;
/** Room left at the column's sides, at least. */
const COLUMN_MARGIN = 32;
/** The width the phone layout was drawn for (the mockup's phone). */
const DESIGN_WIDTH = 393;
/** How much bigger the game pieces may grow on a tablet. */
const SCALE_MAX = 1.6;

export interface Layout {
  width: number;
  height: number;
  /** The height usable for content: the window minus the safe area's top and bottom. */
  room: number;
  /** The content column's width: the whole width on a phone, a centred column on a tablet. */
  column: number;
  /** The side padding inside the column. */
  gutter: number;
  /** The column minus its side padding: the room for cards, tiles and keys. */
  available: number;
  /** A short phone (room < 740): smaller scene, keys and tab bar. */
  compact: boolean;
  /** A very short phone (room < 600, e.g. 320×568): tighter still, on top of compact. */
  tight: boolean;
  /** A narrow phone (< 360 wide): tighter gutters and labels. */
  narrow: boolean;
  tablet: boolean;
  /** The game pieces' size: 1 on phones, more on a tablet's wider column. */
  scale: number;
  /** Text on the game board (the clue, the result's lines): grows half as much as the pieces. */
  type: number;
}

export function layoutFor(width: number, height: number, insetTop = 0, insetBottom = 0): Layout {
  const room = height - insetTop - insetBottom;
  const tablet = Math.min(width, height) >= TABLET_FROM;
  const column = tablet
    ? Math.round(Math.min(width - 2 * COLUMN_MARGIN, COLUMN_MAX, Math.max(COLUMN_MIN, height * COLUMN_SHARE)))
    : width;
  const narrow = width < 360;
  const gutter = narrow ? 12 : tablet ? 20 : 16;
  const scale = tablet ? Math.min(SCALE_MAX, Math.max(1, column / DESIGN_WIDTH)) : 1;
  return {
    width,
    height,
    room,
    column,
    gutter,
    available: column - 2 * gutter,
    compact: !tablet && room < 740,
    tight: !tablet && room < 600,
    narrow,
    tablet,
    scale,
    type: 1 + (scale - 1) / 2,
  };
}

/**
 * The current screen's layout (re-read on rotation, split view or a resized window). Read from the
 * safe area's context, not useSafeAreaInsets: a piece drawn outside the provider (a test) gets none.
 */
export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const { top = 0, bottom = 0 } = useContext(SafeAreaInsetsContext) ?? {};
  return useMemo(() => layoutFor(width, height, top, bottom), [width, height, top, bottom]);
}
