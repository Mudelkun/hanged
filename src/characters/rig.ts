/*
 * The app draws the characters with the SAME code as the design previews:
 * design/characters/rig.js (shared rig + the 15 skins and their personas) and balloons.js (the
 * 10-stage balloon animation). Both are plain scripts that attach
 * `HangedRig` / `BalloonAnim` to the global object and return SVG strings,
 * which react-native-svg's <SvgXml> renders. Change a character there and
 * the previews and the app both pick it up. Do not fork a copy into src/.
 *
 * Import order matters: balloons.js reads HangedRig while it loads.
 */
import '../../design/characters/rig.js';
import '../../design/characters/balloons.js';

export type Expression = 'happy' | 'joy' | 'nervous' | 'worried' | 'scared' | 'ko';
/** The personas' attitude faces (Characters page only). */
export type Mood = 'cool' | 'smug' | 'side' | 'wink' | 'fierce' | 'calm' | 'sleepy' | 'blep' | 'whoa';
export type Angles = Partial<Record<'head' | 'armL' | 'armR' | 'legL' | 'legR' | 'tail' | 'elbowL' | 'elbowR', number>>;

export interface Character {
  id: string;
  name: string;
  species: string;
}

export interface RenderOptions {
  pose?: 'idle' | 'cheer' | 'panic' | 'dangle';
  expr?: Expression | Mood;
  angles?: Angles;
  bare?: boolean;
  /** Degrees the whole figure tilts around its feet. */
  lean?: number;
  layers?: Partial<Record<'armL' | 'armR', 'under' | 'back' | 'front'>>;
  under?: string;
  held?: string;
  over?: string;
}

/** One animation frame, as returned by BalloonAnim.frame. Only the fields the app reads are typed. */
export interface Frame {
  expr: Expression;
  tx: number;
  ty: number;
  rot: number;
  a: Required<Angles>;
}

export interface Stage {
  label: string;
  dur?: number;
}

interface HangedRigApi {
  render(c: Character, opts?: RenderOptions): string;
  /** The character's persona (signature pose, face and props) as render options. */
  signature(c: Character): RenderOptions;
  /** The profile picture: the persona on its backdrop, clipped to a circle filling the viewBox. */
  avatar(c: Character): string;
  /** The avatar's ring colour. */
  avatarRing(c: Character): string;
  CHARACTERS: Character[];
  POSES: Record<string, Required<Angles>>;
}

interface BalloonAnimApi {
  STAGES: Stage[];
  DURATION: number;
  /** The app's window on the scene ({ camera: true } draws into this viewBox). */
  CAMERA: { x: number; w: number; h: number };
  /** gone: balloons gone before and after the step (out of 10). */
  frame(from: number, to: number, p: number, t: number, loops?: boolean, gone?: [number, number]): Frame;
  scene(c: Character, f: Frame, opts?: { sky?: boolean; clouds?: boolean; camera?: boolean }): string;
}

const g = globalThis as unknown as { HangedRig: HangedRigApi; BalloonAnim: BalloonAnimApi };

export const HangedRig = g.HangedRig;
export const BalloonAnim = g.BalloonAnim;

export const CHARACTERS = HangedRig.CHARACTERS;

export const characterById = (id: string): Character =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS.find((c) => c.id === 'mochi')!;

/** Head-and-shoulders crop with a chosen face (e.g. the Profile page's worried one). */
export const faceXml = (c: Character, expr: Expression = 'happy') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 4 140 140">${HangedRig.render(c, { bare: true, expr })}</svg>`;

/** The whole character on its own (the rig's VIEWBOX), e.g. cheering on the streak takeover. */
export const bodyXml = (c: Character, opts?: RenderOptions) =>
  HangedRig.render(c, opts).replace(' class="hanged-char"', '');

/**
 * The character's profile picture: its persona (face, pose, prop) on a backdrop that fits its
 * personality. Every avatar in the app shows this. Cached: it never changes for a character, and a
 * leaderboard draws the same few many times.
 */
const avatars = new Map<string, string>();
export function avatarXml(c: Character) {
  let xml = avatars.get(c.id);
  if (!xml) avatars.set(c.id, (xml = HangedRig.avatar(c)));
  return xml;
}
export const avatarRing = (c: Character) => HangedRig.avatarRing(c);

/** The whole character in its persona's signature pose (Characters page). */
export const signatureXml = (c: Character) => bodyXml(c, HangedRig.signature(c));

/** Remount SVG only when its structure changes, avoiding stale native SVG attributes on iOS. */
export function structureKey(xml: string) {
  const shape = xml.replace(/="[^"]*"/g, '');
  let h = 5381;
  for (let i = 0; i < shape.length; i++) h = ((h << 5) + h + shape.charCodeAt(i)) | 0;
  return h;
}
