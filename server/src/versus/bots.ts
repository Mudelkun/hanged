/*
 * Versus bots (owner's request, 2026-10-26): when no player fits someone in
 * matchmaking for a while, bots take the other seats (matchmaker.ts,
 * BOT_WAIT_MS), so a quick match always starts, whatever the hour.
 *
 * Same rules, no advantage: a bot is a seat of a real Match and plays through
 * the very calls a device makes (guess, skip, pick, with its own counter `n`).
 * It sees only what a device is sent (`match`, `puzzle`: the shown letters,
 * never the hidden ones), so the referee, the clocks and the dealing are the
 * same as for anyone, and it can't know more than its opponent's screen shows.
 *
 * How it plays: like a person who knows everyday words. It tries likely
 * letters (each bot with its own taste for vowels), and the more of the word
 * shows, the likelier it recognises it: then it plays a letter of the words
 * that fit what's shown (the dealing pool, matched against the tiles). Its
 * skill comes from its rating, which is the player's give or take, so a match
 * is close and bots grow stronger as the player climbs. Think times are drawn
 * per guess (reading each new word, quicker once it knows, the odd long
 * pause), and it slips now and then.
 *
 * Timers run on the match's clock, so tests drive bots like the rest.
 */
import { randomUUID } from 'node:crypto';

import { alphabetFor, guessLetter } from '../languages.ts';
import { nameKey, namesForLanguage, nameVariants } from '../names.ts';
import { LETTER_FREQUENCY } from '../rules.ts';
import { MODES, type ModeId, type PuzzleView, type ServerMessage, type WordCard } from '../versus-contract.ts';
import type { Clock, Match, Seat } from './match.ts';
import { START_RATING } from './rating.ts';
import type { VersusWord, WordSource } from './words.ts';

/** PLACEHOLDER tuning. Pairs are [weakest bot, strongest bot]. */
export const BOT_TUNING = {
  /** Skill (0 to 1) at the starting rating, and what each rating point adds. */
  skillAtStart: 0.5,
  skillPerPoint: 1 / 900,
  /** Bots of one rating still differ: the spread of their skill around it. */
  skillSpread: 0.08,
  minSkill: 0.05,
  maxSkill: 0.97,
  /** A player's first matches meet gentler bots. */
  newPlayerMatches: 5,
  newPlayerEase: 0.12,
  /** A bot's rating: the player's, give or take this (one standard deviation). */
  ratingSpread: 40,
  /** rush, battle: the odds of 1, 2 or 3 bots at the table. */
  tableWeights: [0.45, 0.35, 0.2],
  /** Median think times, ms: an ordinary guess, reading a new word, picking a duel card. */
  tempoMs: [2_600, 1_100],
  readMs: [3_400, 1_500],
  pickMs: [7_000, 3_000],
  /** A recognised word is typed this much faster. */
  knownTempo: 0.55,
  /** The quickest a bot ever answers; the odds and length of a long pause. */
  minThinkMs: 380,
  pauseChance: 0.05,
  pauseMs: [1_500, 5_000],
  /** A slip (an odd letter) per guess. */
  slip: [0.1, 0.02],
} as const;

type Range = readonly [number, number];
const between = ([a, b]: Range, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** A standard normal draw (Box-Muller). */
const gauss = (rng: () => number) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)];
function weighted(weights: readonly number[], rng: () => number): number {
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
  return weights.length - 1;
}

// ---- who a bot is ----

export interface BotStyle {
  /** 0 (a beginner) to 1 (a word expert): how soon it recognises a word, how well it picks letters. */
  skill: number;
  tempoMs: number;
  readMs: number;
  /** Taste for vowels: above 1 tries them first, below 1 hunts consonants. */
  vowels: number;
  slip: number;
  /** 0 to 1: how readily it gives up a word that's going badly. */
  quits: number;
}

export function botStyle(rating: number, playerPlayed: number, rng: () => number): BotStyle {
  const t = BOT_TUNING;
  const ease = playerPlayed < t.newPlayerMatches ? t.newPlayerEase : 0;
  const skill = clamp(t.skillAtStart + (rating - START_RATING) * t.skillPerPoint + gauss(rng) * t.skillSpread - ease, t.minSkill, t.maxSkill);
  return {
    skill,
    tempoMs: between(t.tempoMs, skill) * (0.8 + 0.45 * rng()),
    readMs: between(t.readMs, skill) * (0.75 + 0.5 * rng()),
    vowels: 0.6 + 1.2 * rng(),
    slip: between(t.slip, skill),
    quits: rng(),
  };
}

/** Every character of design/characters/rig.js (a test checks): the free ones show up most, as among players. */
export const BOT_CHARACTERS = {
  free: ['mochi', 'bun', 'coco'],
  paid: ['biscuit', 'pip', 'bao', 'koa', 'lolo', 'rocco', 'ember', 'sage', 'rexy', 'vesper', 'button', 'ribbit'],
} as const;

const FIRST_NAMES = [
  'Maya', 'Leo', 'Zoe', 'Sam', 'Noah', 'Lina', 'Theo', 'Ava', 'Kai', 'Mila', 'Eli', 'Nora', 'Finn', 'Ruby', 'Omar',
  'Iris', 'Jonas', 'Sofia', 'Hugo', 'Lea', 'Max', 'Aria', 'Ben', 'Chloe', 'Dani', 'Emma', 'Felix', 'Gabi', 'Ivy',
  'Jade', 'Kenji', 'Luca', 'Mia', 'Nico', 'Olive', 'Pablo', 'Rosa', 'Sasha', 'Tess', 'Yara', 'Ana', 'Malik', 'Priya',
  'Tomás', 'Inès', 'Lukas', 'Marta', 'Amir', 'Hana', 'Ravi', 'Jules', 'Elena', 'Oscar', 'Nina', 'Ezra', 'Lucie',
];
const NICKNAMES = ['WordNerd', 'PuzzleFox', 'LetterBee', 'QuizKid', 'Bookworm', 'NightOwl', 'Spelly', 'Wordsmith', 'VowelHunter', 'Lexi', 'Riddler', 'Scrabbler'];
const INITIALS = 'ABCDEFGHJKLMNPRSTVW';

/** A name like players have: the random one many keep (or its "2" variant), a first name in some form, a nickname. */
export function botName(language: string, rng: () => number): string {
  const r = rng();
  if (r < 0.35) {
    const name = pick(namesForLanguage(language), rng);
    return rng() < 0.3 ? nameVariants(name, 2, 9)[Math.floor(rng() * 8)] : name;
  }
  if (r < 0.47) return pick(NICKNAMES, rng) + (rng() < 0.5 ? String(1 + Math.floor(rng() * 99)) : '');
  const first = pick(FIRST_NAMES, rng);
  const form = rng();
  if (form < 0.4) return first;
  if (form < 0.6) return first.toLowerCase();
  if (form < 0.8) return first + String(Math.floor(rng() * 100)).padStart(2, '0');
  if (form < 0.9) return `${first}_${pick([...INITIALS], rng)}`;
  return first + pick([...INITIALS], rng);
}

export interface BotHost {
  clock: Clock;
  rng: () => number;
  words: WordSource;
}

/** The bots to seat with `player` in a quick match: one for a duel, one to three otherwise. */
export function botsFor(mode: ModeId, language: string, player: { name: string | null; rating: number; played: number }, host: BotHost): Bot[] {
  const { rng } = host;
  const t = BOT_TUNING;
  const count = Math.min(MODES[mode].maxPlayers - 1, 1 + weighted(t.tableWeights, rng));
  const names = new Set(player.name ? [nameKey(player.name)] : []);
  return Array.from({ length: count }, () => {
    let name = botName(language, rng);
    for (let tries = 0; names.has(nameKey(name)) && tries < 20; tries++) name = botName(language, rng);
    names.add(nameKey(name));
    const rating = Math.max(100, Math.round(player.rating + gauss(rng) * t.ratingSpread));
    const characterId = pick(rng() < 0.55 ? BOT_CHARACTERS.free : BOT_CHARACTERS.paid, rng);
    return new Bot({ id: randomUUID(), name, characterId, rating, bot: true }, botStyle(rating, player.played, rng), host);
  });
}

// ---- what it knows of a word ----

/** A word of the pool, as the keys that spell it. */
type Fit = readonly string[];
const byLength = new WeakMap<readonly VersusWord[], Map<number, Fit[]>>();

/** The pool's words of one length, indexed once per pool (it's replaced, never changed, on a reload). */
function wordsOfLength(pool: readonly VersusWord[], language: string, length: number): Fit[] {
  let index = byLength.get(pool);
  if (!index) {
    index = new Map();
    for (const w of pool) {
      const keys = [...w.word].map((c) => guessLetter(c, language));
      const list = index.get(keys.length) ?? [];
      list.push(keys);
      index.set(keys.length, list);
    }
    byLength.set(pool, index);
  }
  return index.get(length) ?? [];
}

const ranks = new Map<string, Map<string, number>>();
/** Letters by how often a language uses them: 0 is the commonest; a letter off the list counts as rarest. */
function frequencyRank(language: string): Map<string, number> {
  let rank = ranks.get(language);
  if (!rank) {
    rank = new Map([...(LETTER_FREQUENCY[language] ?? LETTER_FREQUENCY.en)].map((c, i) => [c, i]));
    ranks.set(language, rank);
  }
  return rank;
}

const VOWELS = new Set('aeiouy');

/** How hard a word is to guess: rare letters and few of them. A duel card a strong bot likes to give. */
function hardness(word: string, language: string) {
  const rank = frequencyRank(language);
  const keys = new Set([...word].map((c) => guessLetter(c, language)));
  let sum = 0;
  for (const c of keys) sum += rank.get(c) ?? rank.size;
  return sum / keys.size - 0.4 * keys.size;
}

// ---- a bot at the table ----

export class Bot {
  readonly seat: Seat;
  readonly style: BotStyle;
  private readonly host: BotHost;
  private match: Match | null = null;
  private n = 0;
  private cancel: (() => void) | null = null;
  /** The word being played, and the pool's words that still fit what it shows. */
  private index = -1;
  private fits: Fit[] = [];
  /** duel, pick phase: the cards dealt, the one sent, and those refused (the other player gave it first). */
  private cards: WordCard[] | null = null;
  private card = -1;
  private readonly refused = new Set<number>();

  constructor(seat: Seat, style: BotStyle, host: BotHost) {
    this.seat = seat;
    this.style = style;
    this.host = host;
  }

  /** Takes its seat: the match's messages to it come to `receive` from now on. */
  sit(match: Match) {
    this.match = match;
  }

  stop() {
    this.schedule(null);
    this.match = null;
  }

  /** What the match sends this seat, exactly what a device would get. */
  receive(msg: ServerMessage) {
    if (!this.match) return;
    switch (msg.t) {
      case 'match': {
        const { phase, picked, cards, you } = msg.match;
        this.cards = phase === 'pick' && !picked ? (cards ?? null) : null;
        if (!this.cards) return this.play(phase === 'play' ? you : null);
        this.refused.clear();
        return this.choose(true);
      }
      case 'puzzle':
        return this.play(msg.puzzle);
      case 'picked':
        if (msg.ok || !this.cards) return;
        this.refused.add(this.card);
        return this.choose(false);
    }
  }

  /** Runs `fn` in `ms` (the one thing it's about to do); null: nothing to do. */
  private schedule(ms: number | null, fn?: () => void) {
    this.cancel?.();
    this.cancel = null;
    if (ms === null || !fn) return;
    this.cancel = this.host.clock.later(ms, () => {
      this.cancel = null;
      if (this.match) fn();
    });
  }

  /** duel: gives one of its cards, a hard one if it's a cunning bot. The pick deadline covers one it never sends. */
  private choose(first: boolean) {
    const cards = this.cards!;
    const { rng } = this.host;
    const { skill } = this.style;
    const open = cards.map((_, i) => i).filter((i) => !this.refused.has(i));
    if (!open.length) return this.schedule(null);
    const language = this.match!.language;
    const i = rng() < skill ? open.reduce((a, b) => (hardness(cards[b].word, language) > hardness(cards[a].word, language) ? b : a)) : pick(open, rng);
    const ms = first ? between(BOT_TUNING.pickMs, skill) * (0.7 + 0.6 * rng()) : 900 + 1_500 * rng();
    this.schedule(ms, () => {
      this.card = i;
      this.match!.pick(this.seat.id, ++this.n, i);
    });
  }

  /** Its word changed (or it has none): the next guess, after a human pause. */
  private play(puzzle: PuzzleView | null) {
    this.schedule(null);
    if (!puzzle || puzzle.status !== 'playing') return;
    const language = this.match!.language;
    const fresh = puzzle.index !== this.index;
    if (fresh) {
      this.index = puzzle.index;
      this.fits = wordsOfLength(this.host.words.pool(language), language, puzzle.tiles.length);
    }
    const move = this.move(puzzle, language);
    if (!move) return;
    this.schedule(this.thinkMs(move.known, fresh), () => {
      const n = ++this.n;
      if (move.letter) this.match!.guess(this.seat.id, n, move.letter);
      else this.match!.skip(this.seat.id, n);
    });
  }

  /** A letter (null: skip the word), and whether it knows the word by now. */
  private move(puzzle: PuzzleView, language: string): { letter: string | null; known: boolean } | null {
    const { rng } = this.host;
    const { skill, slip } = this.style;
    const used = new Set([...puzzle.clues, ...puzzle.hits, ...puzzle.misses]);
    const open = alphabetFor(language).filter((c) => !used.has(c));
    if (!open.length) return null;
    const shown = puzzle.tiles.map((c) => c && guessLetter(c, language));
    // A hidden tile is a letter nobody tried yet: it would show otherwise
    this.fits = this.fits.filter((keys) => keys.every((c, i) => (shown[i] ? c === shown[i] : !used.has(c))));
    const seen = shown.filter(Boolean).length / shown.length;
    // The more of the word shows, the likelier they see it; a word only one or two words fit is plain to see
    const odds = skill * (0.3 + 0.7 * seen + (this.fits.length <= 2 ? 0.25 : 0));
    if (this.fits.length && rng() < Math.min(0.98, odds)) return { letter: this.likeliest(open, language), known: true };
    if (this.givesUp(puzzle)) return { letter: null, known: false };
    if (rng() < slip) return { letter: pick(open, rng), known: false };
    return { letter: this.hunch(open, language), known: false };
  }

  /** The letter most of the fitting words have. */
  private likeliest(open: string[], language: string): string {
    const counts = new Map<string, number>();
    for (const keys of this.fits) for (const c of new Set(keys)) counts.set(c, (counts.get(c) ?? 0) + 1);
    let best: string[] = [];
    let top = 0;
    for (const c of open) {
      const k = counts.get(c) ?? 0;
      if (k > top) [best, top] = [[c], k];
      else if (k && k === top) best.push(c);
    }
    return best.length ? pick(best, this.host.rng) : this.hunch(open, language);
  }

  /** A likely letter by the language's letter frequencies, as a person tries them: strong players stick to the commonest. */
  private hunch(open: string[], language: string): string {
    const rank = frequencyRank(language);
    const steep = 0.1 + 0.25 * this.style.skill;
    return open[weighted(open.map((c) => Math.exp(-steep * (rank.get(c) ?? rank.size)) * (VOWELS.has(c) ? this.style.vowels : 1)), this.host.rng)];
  }

  /** rush: skipping a word that's nearly lost saves time. battle: rarely (a skip costs a balloon). duel: never. */
  private givesUp(puzzle: PuzzleView): boolean {
    const { rng } = this.host;
    const { quits } = this.style;
    switch (this.match!.mode) {
      case 'rush':
        return puzzle.wrong >= puzzle.maxWrong - 2 && rng() < quits * 0.5;
      case 'battle':
        return puzzle.wrong >= 4 && rng() < quits * 0.2;
      default:
        return false;
    }
  }

  private thinkMs(known: boolean, fresh: boolean): number {
    const t = BOT_TUNING;
    const { rng } = this.host;
    let ms = this.style.tempoMs * (known ? t.knownTempo : 1) * Math.exp(gauss(rng) * 0.35);
    if (fresh) ms += this.style.readMs * Math.exp(gauss(rng) * 0.3);
    if (rng() < t.pauseChance) ms += between(t.pauseMs, rng());
    return Math.max(t.minThinkMs, Math.round(ms));
  }
}
