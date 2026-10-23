/*
 * A Versus word is a solo round (engine.ts): the same clues, guesses and
 * judging. This file deals one and turns it into what its player's device
 * may see (PuzzleView: the shown letters, never the hidden ones) and what
 * everyone else may see (counts).
 */
import { createRound, type Round, uniqueLetters, usedLetters, wrongCount, wrongLetters } from '../engine.ts';
import { guessLetter, guessWord } from '../languages.ts';
import type { PuzzleView } from '../versus-contract.ts';
import type { VersusWord } from './words.ts';

/** No per-word limit (Balloon Battle: the player's balloons are the limit). */
export const UNLIMITED = 1_000;

/**
 * The round for word `index` of a match. Everyone at the same index gets the
 * very same round (same clue letters): the match deals it once and shares it.
 */
export const dealRound = (w: VersusWord, index: number, toFind: number, maxWrong: number, rng: () => number): Round =>
  createRound(
    { id: String(index), wordId: w.id, word: w.word, language: w.language, description: w.description, subject: w.subject ?? undefined, level: 0, toFind, maxWrong },
    rng,
  );

export function puzzleView(r: Round, index: number, status: PuzzleView['status']): PuzzleView {
  const used = usedLetters(r);
  const answer = guessWord(r.word, r.language);
  return {
    index,
    language: r.language,
    tiles: [...r.word].map((c) => (used.has(guessLetter(c, r.language)) ? c : '')),
    clues: r.clueLetters,
    hits: r.guessed.filter((c) => answer.includes(c)),
    misses: wrongLetters(r),
    wrong: wrongCount(r),
    maxWrong: r.maxWrong,
    description: r.description,
    ...(r.subject && { subject: r.subject }),
    status,
  };
}

/** Letters found / letters to find (the clues aside): progress others can see without the letters. */
export function progress(r: Round | null): { found: number; toFind: number } {
  if (!r) return { found: 0, toFind: 0 };
  const answer = guessWord(r.word, r.language);
  const toFind = uniqueLetters(answer).filter((c) => !r.clueLetters.includes(c)).length;
  return { found: r.guessed.filter((c) => answer.includes(c)).length, toFind };
}
