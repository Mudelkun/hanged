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
  RECENT_WORDS_MEMORY,
  STARTING_TOKENS,
  WORDS_PER_TOKEN,
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
  /** Progress toward the next token, 0..WORDS_PER_TOKEN-1. */
  wordsTowardToken: number;
  tokens: number;
  recentWordIds: string[];
  round: Round | null;
  /** Set on the winning guess that earned a token, cleared by the next round. */
  lastTokenEarned: boolean;
}

export const initialState = (): GameState => ({
  version: 1,
  playerName: null,
  characterId: 'mochi',
  language: DEFAULT_LANGUAGE,
  wordsGuessed: 0,
  wordsTowardToken: 0,
  tokens: STARTING_TOKENS,
  recentWordIds: [],
  round: null,
  lastTokenEarned: false,
});

export type GameAction =
  | { type: 'hydrate'; state: GameState }
  | { type: 'newRound'; word: WordEntry; roundId: string; rng?: () => number }
  | { type: 'guess'; letter: string }
  | { type: 'unlockDescription' };

export const canUnlockDescription = (s: GameState) =>
  !!s.round && !s.round.descriptionUnlocked && roundStatus(s.round) === 'playing' && s.tokens >= DESCRIPTION_COST;

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'hydrate': {
      // A save from an older, slower token rate can hold more progress than
      // one token needs: pay out whole tokens and keep the remainder.
      let s = action.state;
      const paid = Math.floor(s.wordsTowardToken / WORDS_PER_TOKEN);
      if (paid) s = { ...s, tokens: s.tokens + paid, wordsTowardToken: s.wordsTowardToken % WORDS_PER_TOKEN };
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
      return { ...state, round, recentWordIds, lastTokenEarned: false };
    }

    case 'guess': {
      if (!state.round) return state;
      const round = guess(state.round, action.letter);
      if (round === state.round) return state;
      if (roundStatus(round) !== 'won') return { ...state, round };
      const toward = state.wordsTowardToken + 1;
      const earned = toward >= WORDS_PER_TOKEN;
      return {
        ...state,
        round,
        wordsGuessed: state.wordsGuessed + 1,
        wordsTowardToken: earned ? 0 : toward,
        tokens: state.tokens + (earned ? 1 : 0),
        lastTokenEarned: earned,
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
