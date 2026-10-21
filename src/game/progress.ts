/*
 * The player's saved state and the one reducer that changes it. Pure: the
 * React provider (src/state/GameContext.tsx) only adds storage.
 *
 * Scoring happens here, in the same step as the winning guess, so a won
 * round is counted exactly once. A round already over ignores further guesses.
 */
import {
  DEFAULT_LANGUAGE,
  DESCRIPTION_COST,
  LETTER_BUY_COST,
  LETTER_BUY_COUNT,
  RECENT_WORDS_MEMORY,
  STARTING_TOKENS,
  STREAK_BONUS_AT,
} from './config';
import { buyLetters, canBuyLetters, createRound, guess, Round, roundStatus, unlockDescription } from './engine';
import { afterRound, levelByNumber, levelFromScore, LevelProgress, START_LEVEL } from './levels';
import { pickWord, wordById, WordEntry } from './words';

export interface GameState {
  version: 1;
  /** null until the Profile page lets the player pick one; the UI shows a default. */
  playerName: string | null;
  characterId: string;
  language: string;
  /** Leaderboard score: words guessed. Spending tokens never lowers it. */
  wordsGuessed: number;
  tokens: number;
  /** Words guessed in a row. A lost round resets it to 0. */
  streak: number;
  /** The level and the counts that move it up or down (levels.afterRound). */
  levelProgress: LevelProgress;
  recentWordIds: string[];
  round: Round | null;
  /** Tokens paid by the winning guess (0 otherwise), cleared by the next round. */
  lastTokensEarned: number;
}

export const initialState = (): GameState => ({
  version: 1,
  playerName: null,
  characterId: 'mochi',
  language: DEFAULT_LANGUAGE,
  wordsGuessed: 0,
  tokens: STARTING_TOKENS,
  streak: 0,
  levelProgress: START_LEVEL,
  recentWordIds: [],
  round: null,
  lastTokensEarned: 0,
});

export type GameAction =
  | { type: 'hydrate'; state: GameState }
  | { type: 'newRound'; word: WordEntry; roundId: string; rng?: () => number }
  | { type: 'guess'; letter: string }
  | { type: 'unlockDescription' }
  | { type: 'buyLetters'; rng?: () => number };

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

type LegacySave = GameState & { wordsTowardToken?: number; lastTokenEarned?: boolean };

/** Every save field missing from an older save gets its value from initialState(). */
const withDefaults = (saved: GameState): GameState => {
  const fresh = initialState();
  return (Object.keys(fresh) as (keyof GameState)[]).every((k) => k in saved) ? saved : { ...fresh, ...saved };
};

export const canUnlockDescription = (s: GameState) =>
  !!s.round && !s.round.descriptionUnlocked && roundStatus(s.round) === 'playing' && s.tokens >= DESCRIPTION_COST;

/** The round's level sells letters and the round can still take them (affordable or not). */
export const lettersForSale = (s: GameState) =>
  !!s.round && levelByNumber(s.round.level).sellsLetters && canBuyLetters(s.round, LETTER_BUY_COUNT);

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'hydrate': {
      let s = action.state;
      // A save from before levels could drop: its level came from the score.
      if (!s.levelProgress) s = { ...s, levelProgress: levelFromScore(s.wordsGuessed ?? 0) };
      s = withDefaults(s);
      // A save from the old "N words per token" rate: its progress was worth a
      // token per word at the last rate (1), so pay it out and drop the old fields.
      if ('wordsTowardToken' in s || 'lastTokenEarned' in s) {
        const { wordsTowardToken = 0, lastTokenEarned, ...rest } = s as LegacySave;
        s = { ...rest, tokens: rest.tokens + wordsTowardToken, lastTokensEarned: lastTokenEarned ? 1 : 0 };
      }
      // A round saved before hint words existed gets them from the word database.
      if (s.round && !s.round.hints) s = { ...s, round: { ...s.round, hints: wordById(s.round.wordId)?.hints ?? [] } };
      // A round saved before disabled keys or bought letters existed: full keyboard, nothing bought.
      if (s.round) {
        const { disabledLetters = [], boughtLetters = [] } = s.round;
        s = { ...s, round: { ...s.round, disabledLetters, boughtLetters } };
      }
      return s;
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
          hints: action.word.hints,
          level: level.level,
          clueRatio: level.clueRatio,
          disabledRatio: level.disabledRatio,
          maxWrong: level.maxWrong,
        },
        action.rng,
      );
      const recentWordIds = [action.word.id, ...state.recentWordIds.filter((id) => id !== action.word.id)].slice(
        0,
        RECENT_WORDS_MEMORY,
      );
      return { ...state, round, recentWordIds, lastTokensEarned: 0 };
    }

    case 'guess': {
      if (!state.round) return state;
      const round = guess(state.round, action.letter);
      if (round === state.round) return state;
      const status = roundStatus(round);
      if (status === 'playing') return { ...state, round };
      const levelProgress = afterRound(state.levelProgress, status === 'won');
      if (status === 'lost') return { ...state, round, streak: 0, levelProgress };
      const streak = state.streak + 1;
      // The round's own level pays, not the level this win may move the player up to.
      const earned = tokenReward(round.level, streak);
      return {
        ...state,
        round,
        wordsGuessed: state.wordsGuessed + 1,
        streak,
        levelProgress,
        tokens: state.tokens + earned,
        lastTokensEarned: earned,
      };
    }

    case 'unlockDescription': {
      if (!canUnlockDescription(state)) return state;
      return { ...state, round: unlockDescription(state.round!), tokens: state.tokens - DESCRIPTION_COST };
    }

    case 'buyLetters': {
      // Buying leaves a letter hidden, so it never wins the round: scoring stays in `guess`.
      if (!lettersForSale(state) || state.tokens < LETTER_BUY_COST) return state;
      const round = buyLetters(state.round!, LETTER_BUY_COUNT, action.rng);
      return { ...state, round, tokens: state.tokens - LETTER_BUY_COST };
    }
  }
}

/** Picks the next solo word for this player. */
export const nextWord = (s: GameState, rng?: () => number) =>
  pickWord(levelByNumber(s.levelProgress.level), s.language, s.recentWordIds, rng);
