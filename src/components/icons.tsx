/*
 * Icons, copied from the SVG strings in design/ui-mockup.html so the app
 * matches the mockup exactly. Each one is a 24×24 (or stated) viewBox drawn
 * at any size.
 */
import { memo } from 'react';
import { SvgXml } from 'react-native-svg';

const svg = (viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;

// "Token" is a placeholder: a star coin, never a heart (hearts suggest lives).
export const coinXml = svg(
  '0 0 24 24',
  '<circle cx="12" cy="12.6" r="10.4" fill="#f0b43a"/><circle cx="12" cy="11.4" r="10.4" fill="#ffd667"/><circle cx="12" cy="11.4" r="7.4" fill="#ffe593"/><path d="M12 6.4l1.6 3.3 3.6.5-2.6 2.5.6 3.6L12 14.6l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff" stroke="#f0b43a" stroke-width="1" stroke-linejoin="round"/>',
);
export const lockXml = (c = '#c9b5a4') =>
  svg(
    '0 0 24 24',
    `<rect x="4.5" y="10" width="15" height="11" rx="4" fill="${c}"/><path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="${c}" stroke-width="2.8"/>`,
  );
export const sparkXml = (c = '#ffc93c') =>
  svg(
    '0 0 24 24',
    `<path d="M12 1.5c.9 5.6 4.9 9.6 10.5 10.5-5.6.9-9.6 4.9-10.5 10.5-.9-5.6-4.9-9.6-10.5-10.5C7.1 11.1 11.1 7.1 12 1.5z" fill="${c}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`,
  );
export const starXml = (c = '#38b283') =>
  svg(
    '0 0 24 24',
    `<path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`,
  );
export const chevXml = (dir: 'l' | 'r', c = '#4b3a35') =>
  svg(
    '0 0 24 24',
    `<path d="${dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
export const checkXml = svg(
  '0 0 24 24',
  '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
);
export const bulbXml = svg(
  '0 0 24 24',
  '<path d="M12 2.5a7 7 0 0 0-4.2 12.6c.8.6 1.2 1.4 1.2 2.4h6c0-1 .4-1.8 1.2-2.4A7 7 0 0 0 12 2.5z" fill="#ffd667" stroke="#f0b43a" stroke-width="1.6"/><rect x="9" y="18.5" width="6" height="3" rx="1.5" fill="#f0b43a"/><path d="M9.5 9.5a3 3 0 0 1 2.5-2.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
);
// Not in the mockup: the hint pill's "show" and "next" buttons.
export const eyeXml = (c = '#fff') =>
  svg(
    '0 0 24 24',
    `<path d="M1.8 12S5.5 5.2 12 5.2 22.2 12 22.2 12 18.5 18.8 12 18.8 1.8 12 1.8 12z" fill="${c}"/><circle cx="12" cy="12" r="3.9" fill="#6cc4ff"/><circle cx="13.2" cy="10.8" r="1.2" fill="#fff"/>`,
  );
export const nextXml = (c = '#fff') =>
  svg(
    '0 0 24 24',
    `<path d="M9 5.5l6.5 6.5L9 18.5" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
const CLOUD = '<circle cx="28" cy="32" r="15"/><circle cx="48" cy="22" r="19"/><circle cx="70" cy="29" r="15"/><rect x="14" y="30" width="72" height="17" rx="8.5"/>';
export const cloudXml = (fill = '#fff') => svg('0 0 100 50', `<g fill="${fill}">${CLOUD}</g>`);
// Not in the mockup: the level path's fog, a cloud on its own flat raised shadow.
export const fogCloudXml = (shadow: string) =>
  svg('0 0 100 54', `<g fill="${shadow}" transform="translate(0 4)">${CLOUD}</g><g fill="#fff">${CLOUD}</g>`);
// Not in the mockup: the close button of a full-screen sheet (the level path).
export const closeXml = (c = '#4b3a35') =>
  svg('0 0 24 24', `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/>`);

export const tabIconXml = {
  play: (c: string) =>
    svg(
      '0 0 30 26',
      `<path d="M8 5h14a7 7 0 0 1 6.6 9.3l-1.4 4.2a3.6 3.6 0 0 1-6 1.4L18.3 17h-6.6l-2.9 2.9a3.6 3.6 0 0 1-6-1.4L1.4 14.3A7 7 0 0 1 8 5z" fill="${c}"/><path d="M9 9v5M6.5 11.5h5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="20" cy="10" r="1.7" fill="#fff"/><circle cx="23" cy="13" r="1.7" fill="#fff"/>`,
    ),
  versus: (c: string) =>
    svg(
      '0 0 30 26',
      `<circle cx="20.5" cy="11" r="8" fill="${c}" opacity=".5"/><circle cx="10" cy="13" r="8.5" fill="${c}"/><circle cx="7.4" cy="12" r="1.3" fill="#fff"/><circle cx="12.6" cy="12" r="1.3" fill="#fff"/><path d="M7.6 15.4q2.4 2.2 4.8 0" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    ),
  leaderboard: (c: string) =>
    svg(
      '0 0 28 26',
      `<path d="M7 2h14v7a7 7 0 0 1-14 0z" fill="${c}"/><path d="M7 4H2.5a4.5 4.5 0 0 0 5.2 6.2M21 4h4.5a4.5 4.5 0 0 1-5.2 6.2" fill="none" stroke="${c}" stroke-width="2.4"/><rect x="12" y="15" width="4" height="5" fill="${c}"/><rect x="7.5" y="20" width="13" height="4.5" rx="1.6" fill="${c}"/>`,
    ),
  characters: (c: string) =>
    svg(
      '0 0 28 26',
      `<path d="M4 4.5l6.2 3.6a10 10 0 0 1 7.6 0L24 4.5l-.6 7.7A10 9.4 0 1 1 4.6 12.2z" fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10.2" cy="14.5" r="1.5" fill="#fff"/><circle cx="17.8" cy="14.5" r="1.5" fill="#fff"/><path d="M12 18q2 1.6 4 0" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    ),
};

export const Icon = memo(function Icon({ xml, size, height }: { xml: string; size: number; height?: number }) {
  return <SvgXml xml={xml} width={size} height={height ?? size} />;
});
