/*
 * The player's saved state and the one reducer that changes it. Pure: the
 * React provider (src/state/GameContext.tsx) only adds storage.
 *
 * Scoring happens here, in the same step as the winning guess, so a won
 * round is counted exactly once. A round already over ignores further guesses.
 * The same step queues the round's report for the server (src/net/sync.ts).
 */
import type { RoundReport } from '../../server/src/contract';
import {
  CHARACTER_PRICES,
  DEFAULT_CHARACTER,
  DEFAULT_LANGUAGE,
  LETTER_BUY_COST,
  LETTER_BUY_COUNT,
  STARTING_TOKENS,
  STREAK_BONUS_AT,
} from './config';
import { buyLetters, canBuyLetters, createRound, guess, Round, roundStatus, wrongCount } from './engine';
import { afterRound, levelByNumber, levelFromScore, LevelProgress, START_LEVEL } from './levels';
import { checkName, keptName } from './names';
import { pickWord, seenWord, wordById, WordEntry } from './words';

export interface GameState {
  version: 1;
  /**
   * Public (leaderboard). Always one that passes names.checkName. null only for
   * a moment: the provider gives a new player a random name (names.randomName).
   */
  playerName: string | null;
  /** The character the player plays with. Always one they own (ownsCharacter). */
  characterId: string;
  /** Characters bought with tokens. Free ones (price 0) are owned without being listed. */
  unlockedCharacterIds: string[];
  language: string;
  /** Local playback preferences. Voices follow sound effects. */
  soundEnabled: boolean;
  musicEnabled: boolean;
  /** Leaderboard score: words guessed. Spending tokens never lowers it. */
  wordsGuessed: number;
  tokens: number;
  /** Words guessed in a row. A lost round resets it to 0. */
  streak: number;
  /** The level and the counts that move it up or down (levels.afterRound). */
  levelProgress: LevelProgress;
  /** The highest level ever reached. The level path shows every stop up to it; the rest is in the fog. */
  bestLevel: number;
  /** Words dealt since their level last started over, oldest first (words.pickWord). */
  seenWordIds: string[];
  round: Round | null;
  /** Tokens paid by the winning guess (0 otherwise), cleared by the next round. */
  lastTokensEarned: number;
  /** Finished rounds the server hasn't confirmed yet, oldest first (at most REPORTS_KEPT). */
  reports: RoundReport[];
  /** The seq the next report gets: 1, 2, 3… never reused on this device. */
  nextReportSeq: number;
}

/** Reports kept while offline (~90 bytes each). Past it the oldest go: only statistics lose them. */
export const REPORTS_KEPT = 2000;

export const initialState = (): GameState => ({
  version: 1,
  playerName: null,
  characterId: DEFAULT_CHARACTER,
  unlockedCharacterIds: [],
  language: DEFAULT_LANGUAGE,
  soundEnabled: true,
  musicEnabled: true,
  wordsGuessed: 0,
  tokens: STARTING_TOKENS,
  streak: 0,
  levelProgress: START_LEVEL,
  bestLevel: START_LEVEL.level,
  seenWordIds: [],
  round: null,
  lastTokensEarned: 0,
  reports: [],
  nextReportSeq: 1,
});

export type GameAction =
  | { type: 'audioSetting'; setting: 'soundEnabled' | 'musicEnabled'; enabled: boolean }
  | { type: 'hydrate'; state: GameState }
  | { type: 'newRound'; word: WordEntry; roundId: string; rng?: () => number }
  /** `at`: now, in epoch ms (the reducer stays pure). */
  | { type: 'guess'; letter: string; at: number }
  | { type: 'buyLetters'; rng?: () => number }
  /** Pays for a locked character and plays with it. */
  | { type: 'buyCharacter'; id: string }
  /** Plays with a character the player owns. */
  | { type: 'selectCharacter'; id: string }
  /** The server counted every report up to this seq. */
  | { type: 'reportsSent'; upTo: number }
  /** A new name. Ignored unless names.checkName takes it. */
  | { type: 'rename'; name: string }
  /** The account was deleted: everything starts over, as on a new phone. */
  | { type: 'reset' };

/**
 * Tokens paid by a win at `level` that brings the streak to `streak`: the
 * level's pay, so harder words pay more, plus +1 per STREAK_BONUS_AT step reached.
 */
export const tokenReward = (level: number, streak: number) => levelByNumber(level).tokenReward + streakBonus(streak);

/** Bonus tokens a streak of `streak` adds to each win: +1 per STREAK_BONUS_AT step reached. */
export const streakBonus = (streak: number) => STREAK_BONUS_AT.filter((n) => streak >= n).length;

/** The streak meter: the stretch of wins between two bonus steps that `streak` is filling. */
export interface StreakMeter {
  /** 0 up to the first step, 1 up to the second…; STREAK_BONUS_AT.length once past the last (bonus maxed). */
  tier: number;
  from: number;
  to: number;
  /** The streak just reached `to`: a bonus step (or, maxed, a lap). */
  full: boolean;
  bonus: number;
}

/**
 * Where `streak` (≥ 1) sits on the meter. Past the last step the bonus stops
 * growing, but the meter keeps going in laps the size of the last stretch.
 */
export function streakMeter(streak: number): StreakMeter {
  const bonus = streakBonus(streak);
  const steps = [0, ...STREAK_BONUS_AT];
  const i = steps.findIndex((n, k) => k > 0 && streak <= n);
  if (i > 0) return { tier: i - 1, from: steps[i - 1], to: steps[i], full: streak === steps[i], bonus };
  const last = steps[steps.length - 1];
  const lap = last - steps[steps.length - 2];
  const from = last + Math.floor((streak - last - 1) / lap) * lap;
  return { tier: STREAK_BONUS_AT.length, from, to: from + lap, full: streak === from + lap, bonus };
}

type LegacySave = GameState & { wordsTowardToken?: number; lastTokenEarned?: boolean; recentWordIds?: string[] };

/** Every save field missing from an older save gets its value from initialState(). */
const withDefaults = (saved: GameState): GameState => {
  const fresh = initialState();
  return (Object.keys(fresh) as (keyof GameState)[]).every((k) => k in saved) ? saved : { ...fresh, ...saved };
};

/** The outbox once `round` (just finished) is queued. */
function queueReport(s: GameState, round: Round, won: boolean, at: number): Pick<GameState, 'reports' | 'nextReportSeq'> {
  const report: RoundReport = {
    seq: s.nextReportSeq,
    wordId: round.wordId,
    level: round.level,
    won,
    wrong: wrongCount(round),
    description: true, // Descriptions are visible from the start of every round.
    letters: round.boughtLetters.length > 0,
    at,
  };
  return { reports: [...s.reports, report].slice(-REPORTS_KEPT), nextReportSeq: s.nextReportSeq + 1 };
}

/** A character's price in tokens (0 = free), or null if it isn't in the shop. */
export const characterPrice = (id: string): number | null => CHARACTER_PRICES[id] ?? null;

export const ownsCharacter = (s: GameState, id: string) => characterPrice(id) === 0 || s.unlockedCharacterIds.includes(id);

export const canBuyCharacter = (s: GameState, id: string) => {
  const price = characterPrice(id);
  return price !== null && !ownsCharacter(s, id) && s.tokens >= price;
};

/** The round's level sells letters and the round can still take them (affordable or not). */
export const lettersForSale = (s: GameState) =>
  !!s.round && levelByNumber(s.round.level).sellsLetters && canBuyLetters(s.round, LETTER_BUY_COUNT);

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'audioSetting':
      return state[action.setting] === action.enabled ? state : { ...state, [action.setting]: action.enabled };
    case 'hydrate': {
      let s = action.state;
      // A save from before levels could drop: its level came from the score.
      if (!s.levelProgress) s = { ...s, levelProgress: levelFromScore(s.wordsGuessed ?? 0) };
      // A save from before the level path: the best it knows is where the player stands.
      if (!s.bestLevel) s = { ...s, bestLevel: s.levelProgress.level };
      // A save from the "last 40 words" memory (newest first): those words count as seen.
      if (!s.seenWordIds) {
        const { recentWordIds = [], ...rest } = s as LegacySave;
        s = { ...rest, seenWordIds: [...recentWordIds].reverse() };
      }
      s = withDefaults(s);
      if (typeof s.soundEnabled !== 'boolean' || typeof s.musicEnabled !== 'boolean')
        s = { ...s, soundEnabled: typeof s.soundEnabled === 'boolean' ? s.soundEnabled : true,
          musicEnabled: typeof s.musicEnabled === 'boolean' ? s.musicEnabled : true };
      // A save from the old "N words per token" rate: its progress was worth a
      // token per word at the last rate (1), so pay it out and drop the old fields.
      if ('wordsTowardToken' in s || 'lastTokenEarned' in s) {
        const { wordsTowardToken = 0, lastTokenEarned, ...rest } = s as LegacySave;
        s = { ...rest, tokens: rest.tokens + wordsTowardToken, lastTokensEarned: lastTokenEarned ? 1 : 0 };
      }
      // Descriptions are always visible; discard retired hint/reveal fields from old rounds.
      // Older rounds also default to a full keyboard and no bought letters.
      if (s.round) {
        const { hints, descriptionUnlocked, disabledLetters = [], boughtLetters = [], ...round } =
          s.round as Round & { hints?: string[]; descriptionUnlocked?: boolean };
        s = { ...s, round: { ...round, disabledLetters, boughtLetters } };
      }
      // A character that left the shop goes back to the default; one that stopped being free stays owned.
      if (characterPrice(s.characterId) === null) s = { ...s, characterId: DEFAULT_CHARACTER };
      else if (!ownsCharacter(s, s.characterId)) s = { ...s, unlockedCharacterIds: [...s.unlockedCharacterIds, s.characterId] };
      // A name the rules no longer take (longer than the limit): keep its first word, or drop it for a random one.
      const playerName = keptName(s.playerName);
      if (playerName !== s.playerName) s = { ...s, playerName };
      // Words removed from the database can never be dealt again: forget them.
      const seenWordIds = s.seenWordIds.filter((id) => wordById(id));
      return seenWordIds.length === s.seenWordIds.length ? s : { ...s, seenWordIds };
    }

    case 'newRound': {
      const level = levelByNumber(state.levelProgress.level);
      const round = createRound(
        {
          id: action.roundId,
          wordId: action.word.id,
          word: action.word.word,
          language: action.word.language,
          description: action.word.description,
          subject: level.showsSubject ? action.word.subject : undefined,
          level: level.level,
          toFind: level.toFind,
          disabledRatio: level.disabledRatio,
          maxWrong: level.maxWrong,
        },
        action.rng,
      );
      return { ...state, round, seenWordIds: seenWord(state.seenWordIds, action.word, level), lastTokensEarned: 0 };
    }

    case 'guess': {
      if (!state.round) return state;
      const round = guess(state.round, action.letter);
      if (round === state.round) return state;
      const status = roundStatus(round);
      if (status === 'playing') return { ...state, round };
      const won = status === 'won';
      const levelProgress = afterRound(state.levelProgress, won);
      const ended = {
        ...state,
        round,
        levelProgress,
        bestLevel: Math.max(state.bestLevel, levelProgress.level),
        ...queueReport(state, round, won, action.at),
      };
      if (!won) return { ...ended, streak: 0 };
      const streak = state.streak + 1;
      // The round's own level pays, not the level this win may move the player up to.
      const earned = tokenReward(round.level, streak);
      return {
        ...ended,
        wordsGuessed: state.wordsGuessed + 1,
        streak,
        tokens: state.tokens + earned,
        lastTokensEarned: earned,
      };
    }

    case 'buyLetters': {
      // Buying leaves a letter hidden, so it never wins the round: scoring stays in `guess`.
      if (!lettersForSale(state) || state.tokens < LETTER_BUY_COST) return state;
      const round = buyLetters(state.round!, LETTER_BUY_COUNT, action.rng);
      return { ...state, round, tokens: state.tokens - LETTER_BUY_COST };
    }

    case 'buyCharacter': {
      if (!canBuyCharacter(state, action.id)) return state;
      return {
        ...state,
        tokens: state.tokens - characterPrice(action.id)!,
        unlockedCharacterIds: [...state.unlockedCharacterIds, action.id],
        characterId: action.id,
      };
    }

    case 'selectCharacter': {
      if (action.id === state.characterId || !ownsCharacter(state, action.id)) return state;
      return { ...state, characterId: action.id };
    }

    case 'reportsSent': {
      const reports = state.reports.filter((r) => r.seq > action.upTo);
      return reports.length === state.reports.length ? state : { ...state, reports };
    }

    case 'rename': {
      const check = checkName(action.name);
      return check.ok && check.name !== state.playerName ? { ...state, playerName: check.name } : state;
    }

    case 'reset':
      return initialState();
  }
}

/** Picks the next solo word for this player. */
export const nextWord = (s: GameState, rng?: () => number) =>
  pickWord(levelByNumber(s.levelProgress.level), s.language, s.seenWordIds, rng);
