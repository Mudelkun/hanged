/*
 * The app draws the characters with the SAME code as the design previews:
 * design/characters/rig.js (shared rig + the 10 skins) and balloons.js (the
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
export type Angles = Partial<Record<'head' | 'armL' | 'armR' | 'legL' | 'legR' | 'tail', number>>;

export interface Character {
  id: string;
  name: string;
  species: string;
}

export interface RenderOptions {
  pose?: 'idle' | 'cheer' | 'panic' | 'dangle';
  expr?: Expression;
  angles?: Angles;
  bare?: boolean;
}

/** One animation frame, as returned by BalloonAnim.frame. Only the fields the app reads are typed. */
export interface Frame {
  expr: Expression;
  tx: number;
  ty: number;
  a: Required<Angles>;
}

export interface Stage {
  label: string;
  dur?: number;
}

interface HangedRigApi {
  render(c: Character, opts?: RenderOptions): string;
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

/** Head-and-shoulders crop, used as the avatar until the player uploads a photo. */
export const faceXml = (c: Character, expr: Expression = 'happy') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 4 140 140">${HangedRig.render(c, { bare: true, expr })}</svg>`;

/** The whole character on its own (the rig's VIEWBOX), e.g. cheering on the streak takeover. */
export const bodyXml = (c: Character, opts?: RenderOptions) =>
  HangedRig.render(c, opts).replace(' class="hanged-char"', '');
