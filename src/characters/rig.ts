/*
 * The app draws the characters with the SAME code as the design mockup:
 * design/characters/rig.js (shared rig + the 10 skins) and hanging.js (the
 * 10-stage hanging animation). Both are plain scripts that attach
 * `HangedRig` / `HangedAnim` to the global object and return SVG strings,
 * which react-native-svg's <SvgXml> renders. Change a character there and
 * the mockup and the app both pick it up. Do not fork a copy into src/.
 *
 * Import order matters: hanging.js reads HangedRig while it loads.
 */
import '../../design/characters/rig.js';
import '../../design/characters/hanging.js';

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

/** One animation frame, as returned by HangedAnim.frame. */
export interface Frame {
  expr: Expression;
  coil: 'ground' | 'held' | 'none';
  rope: 'none' | 'thrown' | 'noose' | 'worn';
  pivot: [number, number];
  tx: number;
  ty: number;
  rot: number;
  swing: number;
  stoolX: number;
  stoolRot: number;
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

interface HangedAnimApi {
  STAGES: Stage[];
  DURATION: number;
  frame(from: number, to: number, p: number, t: number, loops?: boolean): Frame;
  scene(c: Character, f: Frame): string;
}

const g = globalThis as unknown as { HangedRig: HangedRigApi; HangedAnim: HangedAnimApi };

export const HangedRig = g.HangedRig;
export const HangedAnim = g.HangedAnim;

export const CHARACTERS = HangedRig.CHARACTERS;

export const characterById = (id: string): Character =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS.find((c) => c.id === 'mochi')!;

/** Head-and-shoulders crop, used as the avatar until the player uploads a photo. */
export const faceXml = (c: Character, expr: Expression = 'happy') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 4 140 140">${HangedRig.render(c, { bare: true, expr })}</svg>`;

/** The whole character on its own (the rig's VIEWBOX), e.g. cheering on the streak takeover. */
export const bodyXml = (c: Character, opts?: RenderOptions) =>
  HangedRig.render(c, opts).replace(' class="hanged-char"', '');
