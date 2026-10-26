/*
 * A Versus match while it's played: the server is the referee. It lives in
 * memory (a match lasts minutes; only its outcome is written), deals the
 * words, judges each guess with the solo engine, keeps the clocks and decides
 * the result. Devices only send letters.
 *
 * Fairness:
 *  - a device never gets a word it has to guess, only the letters it found;
 *  - everyone at word N of a match plays the very same round (same clues);
 *  - every phase has a server deadline, so a match never waits on a device;
 *  - each message carries the client's counter `n`: one sent twice (a retry
 *    after a reconnect) is judged once.
 *
 * Disconnections: a player who drops is `away` (the clock keeps running) and
 * is back with a full snapshot when they reconnect. Away for
 * VERSUS_LIMITS.awayForfeitMs, or leaving on purpose, is a forfeit: they're
 * placed last, and the match ends when one player is left.
 *
 * The three modes are subclasses: RushMatch, BattleMatch (both race through
 * one shared list of words: RaceMatch) and DuelMatch.
 */
import { randomUUID } from 'node:crypto';

import { guess, type Round, roundStatus, wrongCount } from '../engine.ts';
import {
  type DuelRound,
  type ErrorCode,
  type Link,
  type MatchEnd,
  type MatchPhase,
  type MatchPlayer,
  type MatchResult,
  type MatchView,
  MODES,
  type ModeId,
  type PlayerCard,
  type PuzzleView,
  type ServerMessage,
  type Standing,
  VERSUS_LIMITS,
  type WordCard,
  type WordDone,
} from '../versus-contract.ts';
import { dealRound, progress, puzzleView, UNLIMITED } from './puzzle.ts';
import { places, ratingDeltas } from './rating.ts';
import type { VersusWord, WordSource } from './words.ts';

export interface Seat extends PlayerCard {
  rating: number;
  /** Played by the server (bots.ts). Never sent: a device sees a bot as any other player. */
  bot?: boolean;
}

export interface Clock {
  now(): number;
  /** Runs `fn` in `ms`; returns what cancels it. */
  later(ms: number, fn: () => void): () => void;
}

export interface MatchHost {
  clock: Clock;
  rng: () => number;
  words: WordSource;
  /** To one player's socket, if they're connected. */
  send(playerId: string, msg: ServerMessage): void;
  /** The player left (on purpose or away too long): they're free for something else. */
  left(match: Match, playerId: string): void;
  /** The match is over (or cancelled): count it, tell everyone, forget it. */
  ended(match: Match, result: MatchResult): void;
}

interface PlayerState {
  seat: Seat;
  link: Link;
  /** rush, battle: words guessed. duel: rounds won. */
  score: number;
  /** Words guessed. */
  solved: number;
  misses: number;
  /** The word being played and its index; null when there's none (duel pick phase, landed, left). */
  round: Round | null;
  index: number;
  /** When the score last went up: the earlier of two equal scores got there first. */
  scoredAt: number;
  leftAt: number;
  /** battle: landed. duel: done with this round's word. */
  out: boolean;
  outAt: number;
  /** The highest client counter judged. */
  lastN: number;
  cancelAway: (() => void) | null;
  balloons: number;
  doneAt: number;
  totalMs: number;
}

export abstract class Match {
  readonly id = randomUUID();
  phase: MatchPhase = 'countdown';
  endsAt: number | null = null;
  readonly mode: ModeId;
  readonly ranked: boolean;
  readonly language: string;
  protected readonly host: MatchHost;
  protected readonly players: PlayerState[];
  private cancelPhase: (() => void) | null = null;

  constructor(host: MatchHost, mode: ModeId, seats: readonly Seat[], ranked: boolean, language: string) {
    this.host = host;
    this.mode = mode;
    this.ranked = ranked;
    this.language = language;
    this.players = seats.map((seat) => ({
      seat, link: 'on', score: 0, solved: 0, misses: 0, round: null, index: 0, scoredAt: 0, leftAt: 0,
      out: false, outAt: 0, lastN: 0, cancelAway: null, balloons: 0, doneAt: 0, totalMs: 0,
    }));
  }

  get playerIds(): string[] {
    return this.players.map((p) => p.seat.id);
  }

  get botIds(): string[] {
    return this.players.filter((p) => p.seat.bot).map((p) => p.seat.id);
  }

  start() {
    this.enter('countdown', VERSUS_LIMITS.countdownMs, () => this.begin());
  }

  // ---- what the hub calls ----

  guess(id: string, n: number, letter: string) {
    this.act(id, n, (p) => {
      if (this.phase !== 'play' || !p.round || p.out || roundStatus(p.round) !== 'playing') return this.sendPuzzle(p, n);
      const before = p.round;
      const next = guess(before, letter);
      // Already tried, a clue, not a letter: nothing changes, but the device gets its answer
      if (next === before) return this.sendPuzzle(p, n);
      p.round = next;
      const missed = wrongCount(next) > wrongCount(before);
      if (missed) p.misses++;
      this.afterGuess(p, missed, n);
    });
  }

  skip(id: string, n: number) {
    this.act(id, n, (p) => {
      if (this.phase === 'play' && p.round && !p.out) this.onSkip(p, n);
    });
  }

  pick(id: string, n: number, card?: number, word?: string) {
    this.act(id, n, (p) => this.onPick(p, n, card, word));
  }

  /** Their connection dropped: the match goes on; away too long is a forfeit. */
  away(id: string) {
    const p = this.player(id);
    if (!p || p.link !== 'on' || this.phase === 'over') return;
    p.link = 'away';
    p.cancelAway = this.host.clock.later(VERSUS_LIMITS.awayForfeitMs, () => this.forfeit(id));
    this.touch(p);
  }

  /** Reconnected: back in, with the whole match. */
  back(id: string) {
    const p = this.player(id);
    if (!p || p.link === 'left' || this.phase === 'over') return;
    if (p.link === 'away') {
      p.link = 'on';
      p.cancelAway?.();
      p.cancelAway = null;
      this.touch(p);
    }
    this.snapshot(p);
  }

  /** Left on purpose (or away too long): placed last. With only bots left, nobody is there to play for: it ends. */
  forfeit(id: string) {
    const p = this.player(id);
    if (!p || p.link === 'left' || this.phase === 'over') return;
    p.link = 'left';
    p.leftAt = this.now();
    p.cancelAway?.();
    p.cancelAway = null;
    this.host.left(this, id);
    this.touch(p);
    const active = this.active();
    if (active.length <= 1 || active.every((x) => x.seat.bot)) this.finish('forfeit');
    else this.afterLeave(p);
  }

  /** The server stops it (update, kill switch): nothing counts. */
  cancel() {
    this.finish('cancelled');
  }

  view(id: string): MatchView {
    const p = this.player(id);
    return {
      id: this.id,
      mode: this.mode,
      ranked: this.ranked,
      language: this.language,
      phase: this.phase,
      endsAt: this.endsAt,
      round: this.roundNumber(),
      players: this.players.map((x) => this.public(x)),
      you: p ? this.puzzleOf(p) : null,
      ...(p && this.extra(p)),
    };
  }

  // ---- for the modes ----

  protected abstract begin(): void;
  protected abstract afterGuess(p: PlayerState, missed: boolean, n: number): void;
  /** Best first: a lower key is better, compared item by item. Left players are placed after, by the modes' keys. */
  protected abstract rankKey(p: PlayerState): number[];
  protected abstract wordCards(): WordCard[];
  protected onSkip(_p: PlayerState, _n: number) {}
  protected onPick(p: PlayerState, n: number, _card?: number, _word?: string) {
    this.send(p, { t: 'picked', ok: false, n, error: 'bad' });
  }
  /** Someone left and at least two are still playing. */
  protected afterLeave(_p: PlayerState) {}
  protected balloonsOf(p: PlayerState) {
    return p.round ? Math.max(0, p.round.maxWrong - wrongCount(p.round)) : 0;
  }
  protected roundNumber() {
    return 0;
  }
  protected extra(_p: PlayerState): Partial<MatchView> {
    return {};
  }

  protected now() {
    return this.host.clock.now();
  }

  protected player(id: string) {
    return this.players.find((p) => p.seat.id === id);
  }

  /** Still in the match (not left). */
  protected active() {
    return this.players.filter((p) => p.link !== 'left');
  }

  protected send(p: PlayerState, msg: ServerMessage) {
    if (p.link !== 'left') this.host.send(p.seat.id, msg);
  }

  protected broadcast(msg: ServerMessage) {
    for (const p of this.players) this.send(p, msg);
  }

  /** p's counts changed: everyone sees them. */
  protected touch(p: PlayerState) {
    this.broadcast({ t: 'player', player: this.public(p) });
  }

  protected puzzleOf(p: PlayerState): PuzzleView | null {
    return p.round && puzzleView(p.round, p.index, roundStatus(p.round));
  }

  protected sendPuzzle(p: PlayerState, n?: number, done?: WordDone) {
    this.send(p, { t: 'puzzle', puzzle: this.puzzleOf(p), ...(n !== undefined && { n }), ...(done && { done }) });
  }

  protected snapshot(p: PlayerState) {
    this.send(p, { t: 'match', match: this.view(p.seat.id), now: this.now() });
  }

  /** A new phase, everyone told; `next` runs at its deadline. */
  protected enter(phase: MatchPhase, ms: number | null, next?: () => void) {
    this.cancelPhase?.();
    this.cancelPhase = null;
    this.phase = phase;
    this.endsAt = ms === null ? null : this.now() + ms;
    if (ms !== null && next) this.cancelPhase = this.host.clock.later(ms, next);
    for (const p of this.players) this.snapshot(p);
  }

  protected finish(reason: MatchEnd) {
    if (this.phase === 'over') return;
    this.cancelPhase?.();
    this.cancelPhase = null;
    for (const p of this.players) {
      p.cancelAway?.();
      p.cancelAway = null;
    }
    this.phase = 'over';
    this.endsAt = null;

    const key = (p: PlayerState) => (p.link === 'left' ? [Infinity, -p.leftAt] : this.rankKey(p));
    const ordered = [...this.players].sort((a, b) => compareKeys(key(a), key(b)));
    const at = places(ordered, (a, b) => a.link !== 'left' && b.link !== 'left' && compareKeys(key(a), key(b)) === 0);
    const counted = this.ranked && reason !== 'cancelled';
    const deltas = counted ? ratingDeltas(ordered.map((p, i) => ({ id: p.seat.id, rating: p.seat.rating, place: at[i] }))) : null;
    const standings: Standing[] = ordered.map((p, i) => ({
      id: p.seat.id,
      name: p.seat.name,
      characterId: p.seat.characterId,
      place: at[i],
      score: p.score,
      misses: p.misses,
      words: p.solved,
      left: p.link === 'left',
      ...(deltas && { rating: p.seat.rating + deltas.get(p.seat.id)!, ratingDelta: deltas.get(p.seat.id)! }),
    }));
    this.host.ended(this, { matchId: this.id, mode: this.mode, ranked: this.ranked, reason, standings, words: this.wordCards() });
  }

  private act(id: string, n: number, fn: (p: PlayerState) => void) {
    const p = this.player(id);
    if (!p || p.link === 'left' || this.phase === 'over' || n <= p.lastN) return;
    p.lastN = n;
    fn(p);
  }

  private public(p: PlayerState): MatchPlayer {
    return {
      id: p.seat.id,
      name: p.seat.name,
      characterId: p.seat.characterId,
      rating: p.seat.rating,
      link: p.link,
      score: p.score,
      misses: p.misses,
      balloons: this.balloonsOf(p),
      ...progress(p.round),
      out: p.out,
    };
  }
}

function compareKeys(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const card = (w: { word: string; description: string }): WordCard => ({ word: w.word, description: w.description });

/** Words dealt at a time to a race: more are dealt when someone gets near the end. */
const DEAL_CHUNK = 20;

/** Rush and Battle: everyone races through the same list of words, each at their own pace. */
abstract class RaceMatch extends Match {
  private readonly dealt: VersusWord[] = [];
  private readonly rounds: Round[] = [];
  protected abstract readonly maxWrong: number;
  protected abstract readonly toFind: number;
  protected abstract readonly durationMs: number;

  /** Word `i` of the match, the same round for everyone. */
  protected roundAt(i: number): Round | null {
    while (i >= this.rounds.length) {
      const { words, rng } = this.host;
      let more = words.deal(this.language, DEAL_CHUNK, rng, new Set(this.dealt.map((w) => w.id)));
      // A pool smaller than a match (only in tests or a half-seeded table): words come back
      if (!more.length) more = words.deal(this.language, DEAL_CHUNK, rng);
      if (!more.length) return null;
      for (const w of more) {
        this.dealt.push(w);
        this.rounds.push(dealRound(w, this.rounds.length, this.toFind, this.maxWrong, rng));
      }
    }
    return this.rounds[i];
  }

  protected begin() {
    for (const p of this.active()) {
      p.index = 0;
      p.round = this.roundAt(0);
    }
    this.enter('play', this.durationMs, () => this.finish('done'));
  }

  /** On to the next word; `won` says how this one went. */
  protected next(p: PlayerState, won: boolean, n?: number) {
    const done: WordDone = { index: p.index, word: p.round!.word, won };
    p.index++;
    p.round = this.roundAt(p.index);
    this.sendPuzzle(p, n, done);
    this.touch(p);
  }

  protected scored(p: PlayerState) {
    p.score++;
    p.solved++;
    p.scoredAt = this.now();
  }

  protected wordCards() {
    const reached = Math.max(0, ...this.players.map((p) => p.index));
    return this.dealt.slice(0, reached + 1).map(card);
  }
}

/** Word Rush: the most words guessed before the clock runs out. */
export class RushMatch extends RaceMatch {
  protected readonly maxWrong = MODES.rush.maxWrong;
  protected readonly toFind = MODES.rush.toFind;
  protected readonly durationMs = MODES.rush.durationMs;

  protected afterGuess(p: PlayerState, _missed: boolean, n: number) {
    const status = roundStatus(p.round!);
    if (status === 'won') this.scored(p);
    if (status === 'playing') {
      this.sendPuzzle(p, n);
      this.touch(p);
    } else this.next(p, status === 'won', n);
  }

  /** A skipped word is lost: on to the next. */
  protected onSkip(p: PlayerState, n: number) {
    this.next(p, false, n);
  }

  /** Most words; ties: fewer misses, then whoever got there first. */
  protected rankKey(p: PlayerState) {
    return [0, -p.score, p.misses, p.score ? p.scoredAt : 0];
  }
}

/** Balloon Battle: misses pop your balloons, words pop the leader's; the last one floating wins. */
export class BattleMatch extends RaceMatch {
  protected readonly maxWrong = UNLIMITED;
  protected readonly toFind = MODES.battle.toFind;
  protected readonly durationMs = MODES.battle.durationMs;

  protected begin() {
    for (const p of this.active()) p.balloons = MODES.battle.balloons;
    super.begin();
  }

  protected balloonsOf(p: PlayerState) {
    return p.balloons;
  }

  protected afterGuess(p: PlayerState, missed: boolean, n: number) {
    if (missed && --p.balloons <= 0) return this.land(p, n);
    if (roundStatus(p.round!) !== 'won') {
      this.sendPuzzle(p, n);
      return this.touch(p);
    }
    const flawless = wrongCount(p.round!) === 0;
    this.scored(p);
    this.next(p, true, n);
    this.strike(p, flawless ? MODES.battle.flawlessHits : 1);
  }

  /** A skip costs balloons. */
  protected onSkip(p: PlayerState, n: number) {
    p.balloons -= MODES.battle.skipCost;
    if (p.balloons <= 0) this.land(p, n);
    else this.next(p, false, n);
  }

  /**
   * The word pops `count` balloons of the opponent with the most (the leader),
   * so whoever is ahead is everyone's target and a match stays close. Equal
   * leaders: one at random.
   */
  private strike(from: PlayerState, count: number) {
    const alive = this.active().filter((p) => p !== from && !p.out);
    if (!alive.length) return;
    const most = Math.max(...alive.map((p) => p.balloons));
    const leaders = alive.filter((p) => p.balloons === most);
    const target = leaders[Math.floor(this.host.rng() * leaders.length)];
    const popped = Math.min(count, target.balloons);
    target.balloons -= popped;
    this.broadcast({ t: 'hit', from: from.seat.id, to: target.seat.id, count: popped });
    if (target.balloons <= 0) this.land(target);
    else this.touch(target);
  }

  /** No balloons left: they land (out), and the match may be over. */
  private land(p: PlayerState, n?: number) {
    const done: WordDone | undefined = p.round ? { index: p.index, word: p.round.word, won: false } : undefined;
    p.balloons = 0;
    p.out = true;
    p.outAt = this.now();
    p.round = null;
    this.sendPuzzle(p, n, done);
    this.touch(p);
    this.checkEnd();
  }

  protected afterLeave() {
    this.checkEnd();
  }

  private checkEnd() {
    if (this.active().filter((p) => !p.out).length <= 1) this.finish('done');
  }

  /** Still floating first (more balloons, more words, fewer misses), then the last to land. */
  protected rankKey(p: PlayerState) {
    return p.out ? [1, -p.outAt] : [0, -p.balloons, -p.score, p.misses];
  }
}

/** Word Duel: each round both pick a word for the other, then both guess at once. */
export class DuelMatch extends Match {
  private round = 0;
  private readonly cards = new Map<string, VersusWord[]>();
  private readonly picks = new Map<string, VersusWord>();
  private readonly used = new Set<string>();
  private readonly history: DuelRound[] = [];
  private readonly played: VersusWord[] = [];
  private playStart = 0;

  protected roundNumber() {
    return this.round;
  }

  protected begin() {
    this.startPick();
  }

  private startPick() {
    this.round++;
    this.picks.clear();
    for (const p of this.active()) {
      p.round = null;
      p.out = false;
      this.cards.set(p.seat.id, this.host.words.deal(this.language, MODES.duel.cards, this.host.rng, this.used));
    }
    this.enter('pick', MODES.duel.pickMs, () => this.autoPick());
  }

  protected onPick(p: PlayerState, n: number, index?: number, typed?: string) {
    const refuse = (error: ErrorCode) => this.send(p, { t: 'picked', ok: false, n, error });
    if (this.phase !== 'pick' || this.picks.has(p.seat.id)) return refuse('bad');
    if (typed === undefined) {
      const w = index === undefined ? undefined : this.cards.get(p.seat.id)?.[index];
      if (!w || this.used.has(w.id)) return refuse(w ? 'usedWord' : 'bad');
      return this.choose(p, w, n);
    }
    const round = this.round;
    this.host.words.find(this.language, typed).then(
      (w) => {
        // The phase may have moved on while the word was looked up
        if (this.phase !== 'pick' || this.round !== round || this.picks.has(p.seat.id)) return;
        if (!w) refuse('badWord');
        else if (this.used.has(w.id)) refuse('usedWord');
        else this.choose(p, w, n);
      },
      () => refuse('bad'),
    );
  }

  private choose(p: PlayerState, w: VersusWord, n?: number) {
    this.picks.set(p.seat.id, w);
    this.used.add(w.id);
    if (n !== undefined) this.send(p, { t: 'picked', ok: true, n });
    if (this.active().every((x) => this.picks.has(x.seat.id))) this.startPlay();
    else this.snapshot(p);
  }

  /** The pick deadline: whoever hasn't picked gets one of their cards. */
  private autoPick() {
    for (const p of this.active()) {
      if (this.picks.has(p.seat.id)) continue;
      const w = this.cards.get(p.seat.id)?.find((c) => !this.used.has(c.id));
      if (!w) return this.cancel();
      this.picks.set(p.seat.id, w);
      this.used.add(w.id);
    }
    this.startPlay();
  }

  private startPlay() {
    const [a, b] = this.active();
    for (const [p, setter] of [[a, b], [b, a]] as const) {
      const w = this.picks.get(setter.seat.id)!;
      this.played.push(w);
      p.index = this.round - 1;
      p.round = dealRound(w, p.index, MODES.duel.toFind, MODES.duel.maxWrong, this.host.rng);
      p.out = false;
      p.doneAt = 0;
    }
    this.playStart = this.now();
    this.enter('play', MODES.duel.guessMs, () => this.endRound());
  }

  protected afterGuess(p: PlayerState, _missed: boolean, n: number) {
    const status = roundStatus(p.round!);
    if (status === 'playing') {
      this.sendPuzzle(p, n);
      return this.touch(p);
    }
    if (status === 'won') p.solved++;
    p.out = true;
    p.doneAt = this.now();
    this.sendPuzzle(p, n, { index: p.index, word: p.round!.word, won: status === 'won' });
    this.touch(p);
    if (this.active().every((x) => x.out)) this.endRound();
  }

  private endRound() {
    const now = this.now();
    const results = this.active().map((p) => ({
      p,
      id: p.seat.id,
      word: p.round!.word,
      solved: roundStatus(p.round!) === 'won',
      misses: wrongCount(p.round!),
      found: progress(p.round).found,
      ms: (p.doneAt || now) - this.playStart,
    }));
    // Solved beats not solved; then fewer misses (solved) or more letters found (not solved); then faster
    const key = (r: (typeof results)[number]) => (r.solved ? [0, r.misses, r.ms] : [1, -r.found, 0]);
    const [first, second] = [...results].sort((x, y) => compareKeys(key(x), key(y)));
    const winner = second && compareKeys(key(first), key(second)) === 0 ? null : first.p;
    if (winner) {
      winner.score++;
      winner.scoredAt = now;
    }
    for (const r of results) r.p.totalMs += r.ms;
    this.history.push({
      round: this.round,
      results: results.map(({ id, word, solved, misses, ms }) => ({ id, word, solved, misses, ms })),
      winnerId: winner?.seat.id ?? null,
    });
    const decided = this.active().some((p) => p.score >= MODES.duel.winsNeeded) || this.round >= MODES.duel.rounds;
    this.enter('reveal', MODES.duel.revealMs, () => (decided ? this.finish('done') : this.startPick()));
  }

  protected extra(p: PlayerState): Partial<MatchView> {
    const last = this.history.at(-1);
    return {
      ...(this.phase === 'pick' && { cards: (this.cards.get(p.seat.id) ?? []).map(card), picked: this.picks.has(p.seat.id) }),
      ...(last && { last }),
    };
  }

  /** More rounds won; ties: fewer misses, then less time. */
  protected rankKey(p: PlayerState) {
    return [0, -p.score, p.misses, p.totalMs];
  }

  protected wordCards() {
    return this.played.map(card);
  }
}

export function createMatch(host: MatchHost, mode: ModeId, seats: readonly Seat[], ranked: boolean, language: string): Match {
  const Kind = { rush: RushMatch, battle: BattleMatch, duel: DuelMatch }[mode];
  return new Kind(host, mode, seats, ranked, language);
}
