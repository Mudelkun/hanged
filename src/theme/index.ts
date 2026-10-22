/*
 * "Sunny meadow" palette and type, copied from design/ui-mockup.html (:root).
 * Cream paper, sky scenes, coral = actions, mint = correct letter,
 * butter = clue letters and tokens, grey faded letter = wrong guess.
 */
export const colors = {
  paper: '#fffaf1',
  paperDot: '#f5e8d6',
  ink: '#4b3a35',
  muted: '#a8948a',
  line: '#f3e6d6',
  shadow: '#ecd9c3',

  coral: '#ff7b6b',
  coralD: '#e85c4d',
  coralL: '#ffe5df',

  mint: '#5fd3a5',
  mintD: '#38b283',
  mintL: '#dcf7ea',
  mintT: '#2a9a6e',

  butter: '#ffd667',
  butterD: '#f0b43a',
  butterL: '#fff3cc',
  butterT: '#9a6a00',

  sky: '#6cc4ff',
  skyD: '#3ea6ec',
  skyL: '#e0f3ff',
  skyT: '#2a86c8',

  track: '#f1e5d6',
  keyUsed: '#f2e8dc',
  xMark: '#cdb9a7',
  tabIdle: '#d6c5b7',
  tabLabel: '#c4b0a0',
  stampRed: '#e0303a',
  stampGreen: '#2fa877',
};

export const fonts = {
  display500: 'Fredoka_500Medium',
  display600: 'Fredoka_600SemiBold',
  display700: 'Fredoka_700Bold',
  body600: 'Nunito_600SemiBold',
  body700: 'Nunito_700Bold',
  body800: 'Nunito_800ExtraBold',
  body900: 'Nunito_900Black',
};

/** Pastel backdrop per character, for avatar circles and cards. */
export const characterTint: Record<string, string> = {
  bun: '#ffeef4',
  mochi: '#ffeedd',
  coco: '#f6e7da',
  ember: '#ffe6d8',
  bao: '#eef0f5',
  ribbit: '#e6f6d9',
  lolo: '#ffe5ef',
  rexy: '#dcf5ea',
  biscuit: '#fff1dc',
  button: '#ffe6e3',
};

/**
 * One colour per level (owner's call), calm to hot as the words get harder:
 * the header's level pill, the level path and the result's level line.
 * `main` fills a reached stop, `dark` is its raised shadow and text on `light`.
 */
export const levelColors = [
  { main: '#4fcf9c', dark: '#2a9a6e', light: '#dcf7ea' }, // 1 mint
  { main: '#5bb8f5', dark: '#2a86c8', light: '#e0f3ff' }, // 2 sky
  { main: '#a98bf5', dark: '#7656dc', light: '#efe9ff' }, // 3 lilac
  { main: '#f5b82e', dark: '#b97f00', light: '#fff3cc' }, // 4 gold
  { main: '#ff9a45', dark: '#d9701a', light: '#fff0dc' }, // 5 tangerine
  { main: '#ff7b6b', dark: '#e05040', light: '#ffe5df' }, // 6 coral
  { main: '#e45a92', dark: '#bb3369', light: '#ffe3ee' }, // 7 berry
  { main: '#6a5ae0', dark: '#4636b8', light: '#ebe8ff' }, // 8 indigo
] as const;

/** A level's colours. If levels are added past the list, it wraps around. */
export const levelColor = (level: number) => levelColors[(Math.max(1, level) - 1) % levelColors.length];

/**
 * One look per stretch of the streak meter (progress.streakMeter), warming up
 * as the streak grows: mint on a sky up to the first bonus, then a gold
 * sunburst, a berry candy sky, and a starry indigo night once the bonus is maxed.
 * `bg` is the takeover's sky, top to bottom; `ray` is the sunburst's opacity; `hint` is small text on the sky.
 */
export const streakColors = [
  { main: '#4fcf9c', dark: '#2a9a6e', light: '#dcf7ea', bg: ['#8fd6ff', '#d6f5e3'], ray: 0.28, hint: '#2a86c8' }, // mint
  { main: '#ffa630', dark: '#d9701a', light: '#fff0dc', bg: ['#ffbf5c', '#fff1c9'], ray: 0.3, hint: '#b0600f' }, // gold
  { main: '#f2557f', dark: '#c42f5a', light: '#ffe3ee', bg: ['#f78bc9', '#c7a6ff'], ray: 0.26, hint: '#fff' }, // berry
  { main: '#7b5cff', dark: '#4b33c9', light: '#ece6ff', bg: ['#2f2a7a', '#8a6be6'], ray: 0.12, hint: '#fff' }, // indigo, maxed
] as const;

/** A meter stretch's look. Every stretch past the list (the maxed laps) keeps the last one. */
export const streakColor = (tier: number) => streakColors[Math.min(Math.max(0, tier), streakColors.length - 1)];

/**
 * The level path's world (LevelPath): a sky that deepens as the road climbs, a
 * grassy hill with cliff edges, floating islands with waterfalls, stone pedestals
 * under the stops, a rope bridge into the fog. A little richer than the balloon
 * scene's pastels, so the map reads as a place to climb.
 */
export const worldColors = {
  skyTop: '#5cb8f2',
  skyBottom: '#d6f0ff',
  grass: '#9edb7d',
  grassL: '#b9e89c',
  grassD: '#7cc45f',
  bush: '#5fba68',
  bushL: '#86d58c',
  cliff: '#e3a774',
  cliffD: '#c4845a',
  water: '#8fd8ff',
  stone: '#b8afa3',
  stoneL: '#dcd5ca',
  wood: '#d9a066',
  woodD: '#9c6638',
  mist: '#eef8ff',
  cloudShade: '#cfe6f6',
  sign: '#f2cf98',
  signD: '#c99558',
};

/** Confetti: every streak colour, plus butter and sky. */
export const confettiColors = [...streakColors.map((c) => c.main), colors.butter, colors.sky];
