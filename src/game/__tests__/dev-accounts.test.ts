import { CHARACTER_PRICES, DEFAULT_CHARACTER, LETTER_BUY_COST } from '../config';
import { roundStatus } from '../engine';
import { LEVELS } from '../levels';
import {
  can,
  canAfford,
  canBuyCharacter,
  finishingGuesses,
  gameReducer,
  GameState,
  initialState,
  ownsCharacter,
} from '../progress';

const word = {
  id: 'en-castle', word: 'castle', language: 'en', description: 'A big stone home for a king.',
  sense: 'oewn-02983900-n', rarity: 10, concrete: true, difficulty: 1, subject: 'object',
};
const startRound = (s: GameState) => gameReducer(s, { type: 'newRound', word, roundId: 'r', rng: () => 0 });
const finish = (s: GameState, won: boolean) =>
  finishingGuesses(s, won).reduce((acc, letter) => gameReducer(acc, { type: 'guess', letter, at: 1 }), s);

const player = startRound({ ...initialState(), playerName: 'Roda', onboardingCompleted: true });
const dev = gameReducer(player, { type: 'role', role: 'admin' });
const paid = Object.keys(CHARACTER_PRICES).filter((id) => CHARACTER_PRICES[id] > 0);
const priciest = paid[paid.length - 1];

describe('a regular player', () => {
  it('has no developer power, whatever it asks for', () => {
    expect(player.role).toBeNull();
    expect(can(player, 'allCharacters')).toBe(false);
    expect(paid.some((id) => ownsCharacter(player, id))).toBe(false);
    expect(gameReducer(player, { type: 'jumpToLevel', level: 12, roundId: 'x' })).toBe(player);
    expect(finishingGuesses(player, true)).toEqual([]);
    expect(gameReducer(player, { type: 'rename', name: 'Admin' }).playerName).toBe('Roda');
    expect(canAfford({ ...player, tokens: 0 }, 1)).toBe(false);
  });

  it('a role the app does not know, from the server or a save, is no role', () => {
    expect(gameReducer(player, { type: 'role', role: 'owner' as never })).toBe(player);
    const saved = gameReducer(initialState(), { type: 'hydrate', state: { ...dev, role: 'owner' as never } });
    expect(saved.role).toBeNull();
    const { role, ...old } = dev;
    expect(gameReducer(initialState(), { type: 'hydrate', state: old as GameState }).role).toBeNull();
  });
});

describe('a developer account', () => {
  it('owns every character in the shop without a word written to the save', () => {
    for (const id of Object.keys(CHARACTER_PRICES)) expect(ownsCharacter(dev, id)).toBe(true);
    expect(ownsCharacter(dev, 'nobody')).toBe(false);
    expect(dev.unlockedCharacterIds).toEqual([]);
    expect(canBuyCharacter(dev, priciest)).toBe(false);
    expect(gameReducer(dev, { type: 'selectCharacter', id: priciest }).characterId).toBe(priciest);
  });

  it('spends for free: the balance never goes down', () => {
    const top = startRound({ ...dev, tokens: 0, levelProgress: { level: LEVELS.length, wins: 0, rounds: 0, losses: 0 } });
    expect(canAfford(top, LETTER_BUY_COST)).toBe(true);
    const bought = gameReducer(top, { type: 'buyLetters', rng: () => 0 });
    expect(bought.round!.boughtLetters.length).toBeGreaterThan(0);
    expect(bought.tokens).toBe(0);
  });

  it('jumps to any level with a new word there, dropping the round without a loss', () => {
    const won = finish({ ...dev, streak: 4 }, true);
    const playing = startRound(won);
    const s = gameReducer(playing, { type: 'jumpToLevel', level: 15, roundId: 'j', rng: () => 0.3 });
    expect(s.levelProgress).toEqual({ level: 15, wins: 0, rounds: 0, losses: 0 });
    expect(s.round!.level).toBe(15);
    expect(s.round!.id).toBe('j');
    expect(s.bestLevel).toBe(15);
    expect([s.streak, s.reports.length, s.wordsGuessed]).toEqual([playing.streak, playing.reports.length, playing.wordsGuessed]);
    // Down again: the best level stays, as after a drop
    const down = gameReducer(s, { type: 'jumpToLevel', level: 2, roundId: 'k' });
    expect([down.levelProgress.level, down.bestLevel]).toEqual([2, 15]);
    for (const level of [0, LEVELS.length + 1, 2.5]) expect(gameReducer(s, { type: 'jumpToLevel', level, roundId: 'z' })).toBe(s);
  });

  it('finishes a round won or lost through ordinary guesses, so it scores and reports like any', () => {
    const won = finish(dev, true);
    expect(roundStatus(won.round!)).toBe('won');
    expect([won.wordsGuessed, won.streak, won.reports.length]).toEqual([1, 1, 1]);
    expect(won.tokens).toBeGreaterThan(dev.tokens);
    // Level 1 takes letters off the keyboard: the loss uses only the ones still there
    const lost = finish(dev, false);
    expect(roundStatus(lost.round!)).toBe('lost');
    expect([lost.wordsGuessed, lost.streak, lost.reports[0].won]).toEqual([0, 0, false]);
    expect(finishingGuesses(won, true)).toEqual([]);
  });

  it('may take the name "Admin", however it is written', () => {
    expect(gameReducer(dev, { type: 'rename', name: 'aDMIN' }).playerName).toBe('aDMIN');
    expect(gameReducer(dev, { type: 'rename', name: 'AdminRoda' }).playerName).toBe('Roda');
  });

  it('keeps everything through a restart', () => {
    const named = gameReducer(gameReducer(dev, { type: 'rename', name: 'Admin' }), { type: 'selectCharacter', id: priciest });
    const back = gameReducer(initialState(), { type: 'hydrate', state: JSON.parse(JSON.stringify(named)) });
    expect([back.role, back.playerName, back.characterId, back.unlockedCharacterIds]).toEqual(['admin', 'Admin', priciest, []]);
  });

  it('losing the role leaves nothing behind: its characters and name go, what was bought and earned stays', () => {
    const bought = gameReducer({ ...player, tokens: CHARACTER_PRICES[paid[0]] }, { type: 'buyCharacter', id: paid[0] });
    let s = gameReducer(bought, { type: 'role', role: 'admin' });
    s = gameReducer(gameReducer(s, { type: 'rename', name: 'Admin' }), { type: 'selectCharacter', id: priciest });
    const gone = gameReducer({ ...s, tokens: 7 }, { type: 'role', role: null });
    expect(gone.characterId).toBe(DEFAULT_CHARACTER);
    expect(gone.unlockedCharacterIds).toEqual([paid[0]]);
    expect(ownsCharacter(gone, priciest)).toBe(false);
    expect(gone.playerName).toBeNull();
    expect(gone.tokens).toBe(7);
    // A character it bought itself is still played with
    const own = gameReducer(gameReducer(s, { type: 'selectCharacter', id: paid[0] }), { type: 'role', role: null });
    expect(own.characterId).toBe(paid[0]);
  });
});
