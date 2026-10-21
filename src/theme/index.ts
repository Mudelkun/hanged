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
