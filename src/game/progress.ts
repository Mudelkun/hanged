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
  MAX_STREAK_REWARD,
  RECENT_WORDS_MEMORY,
  STARTING_TOKENS,
} from './config';
import { createRound, guess, Round, roundStatus, unlockDescription } from './engine';
import { levelFor } from './levels';
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
  recentWordIds: [],
  round: null,
  lastTokensEarned: 0,
});

export type GameAction =
  | { type: 'hydrate'; state: GameState }
  | { type: 'newRound'; word: WordEntry; roundId: string; rng?: () => number }
  | { type: 'guess'; letter: string }
  | { type: 'unlockDescription' };

/** Tokens paid by the win that brings the streak to `streak`: 1, 2, 3… up to MAX_STREAK_REWARD. */
export const tokenReward = (streak: number) => Math.min(streak, MAX_STREAK_REWARD);

type LegacySave = GameState & { wordsTowardToken?: number; lastTokenEarned?: boolean };

export const canUnlockDescription = (s: GameState) =>
  !!s.round && !s.round.descriptionUnlocked && roundStatus(s.round) === 'playing' && s.tokens >= DESCRIPTION_COST;

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'hydrate': {
      let s = action.state;
      // A save from the old "N words per token" rate: its progress was worth a
      // token per word at the last rate (1), so pay it out and drop the old fields.
      if ('wordsTowardToken' in s || 'lastTokenEarned' in s) {
        const { wordsTowardToken = 0, lastTokenEarned, ...rest } = s as LegacySave;
        s = { ...rest, tokens: rest.tokens + wordsTowardToken, lastTokensEarned: lastTokenEarned ? 1 : 0 };
      }
      // A round saved before hint words existed gets them from the word database.
      if (s.round && !s.round.hints) s = { ...s, round: { ...s.round, hints: wordById(s.round.wordId)?.hints ?? [] } };
      // A round saved before disabled keys existed keeps its full keyboard.
      if (s.round && !s.round.disabledLetters) s = { ...s, round: { ...s.round, disabledLetters: [] } };
      return s;
    }

    case 'newRound': {
      const level = levelFor(state.wordsGuessed);
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
      if (status === 'lost') return { ...state, round, streak: 0 };
      if (status !== 'won') return { ...state, round };
      const streak = state.streak + 1;
      const earned = tokenReward(streak);
      return {
        ...state,
        round,
        wordsGuessed: state.wordsGuessed + 1,
        streak,
        tokens: state.tokens + earned,
        lastTokensEarned: earned,
      };
    }

    case 'unlockDescription': {
      if (!canUnlockDescription(state)) return state;
      return { ...state, round: unlockDescription(state.round!), tokens: state.tokens - DESCRIPTION_COST };
    }
  }
}

/** Picks the next solo word for this player. */
export const nextWord = (s: GameState, rng?: () => number) =>
  pickWord(levelFor(s.wordsGuessed), s.language, s.recentWordIds, rng);
