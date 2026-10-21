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
