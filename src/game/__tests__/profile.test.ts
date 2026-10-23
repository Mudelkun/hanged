import { checkName, keptName, NAME_MAX, RANDOM_NAMES, randomName } from '../names';
import { gameReducer, initialState } from '../progress';

describe('random names', () => {
  it('every name it can give passes the name rules', () => {
    for (const name of RANDOM_NAMES) expect(checkName(name)).toEqual({ ok: true, name });
  });

  it('has plenty of names, each once', () => {
    expect(RANDOM_NAMES.length).toBeGreaterThan(300);
    expect(new Set(RANDOM_NAMES).size).toBe(RANDOM_NAMES.length);
  });

  it('picks from the list', () => {
    expect(randomName(() => 0)).toBe(RANDOM_NAMES[0]);
    expect(randomName(() => 0.9999)).toBe(RANDOM_NAMES.at(-1));
  });
});

describe('a saved name the rules no longer take', () => {
  it('keeps a good name as it is', () => {
    expect(keptName('Roda')).toBe('Roda');
    expect(keptName(null)).toBeNull();
  });

  it('keeps the first word of a name that grew too long', () => {
    expect(keptName('Roda The Goat')).toBe('Roda The Goat');
    expect(keptName('Roda The Goat Forever')).toBe('Roda');
  });

  it('drops it when no word can stay', () => {
    expect(keptName('Supercalifragilistic')).toBeNull();
    expect(keptName('!!!!!!!!!!!! Bob')).toBeNull();
  });

  it('hydrate applies it', () => {
    const saved = { ...initialState(), playerName: 'Roda The Goat Forever' };
    expect(gameReducer(initialState(), { type: 'hydrate', state: saved }).playerName).toBe('Roda');
  });
});

describe('rename', () => {
  const s = { ...initialState(), playerName: 'Sunny Otter' };

  it('saves a good name, tidied', () => {
    expect(gameReducer(s, { type: 'rename', name: '  Roda  ' }).playerName).toBe('Roda');
  });

  it('ignores a name the rules refuse', () => {
    for (const name of ['', 'R', 'x'.repeat(NAME_MAX + 1), '😀😀', 'BigDick'])
      expect(gameReducer(s, { type: 'rename', name })).toBe(s);
  });

  it('keeps the same state for the same name', () => {
    expect(gameReducer(s, { type: 'rename', name: 'Sunny Otter' })).toBe(s);
  });
});

describe('a name someone else already had (names are unique)', () => {
  const s = { ...initialState(), playerName: 'Roda' };

  it('takes the variant the server gave, and remembers the one asked for', () => {
    const taken = gameReducer(s, { type: 'nameTaken', sent: 'Roda', name: 'Roda2' });
    expect([taken.playerName, taken.takenName]).toEqual(['Roda2', 'Roda']);
    // Picking a name of their own clears the note
    expect(gameReducer(taken, { type: 'rename', name: 'Bea' }).takenName).toBeNull();
  });

  it('ignores it once the player has renamed since that sync', () => {
    expect(gameReducer(s, { type: 'nameTaken', sent: 'Sunny Otter', name: 'Sunny Otter2' })).toBe(s);
  });

  it('ignores a name the rules refuse', () => {
    expect(gameReducer(s, { type: 'nameTaken', sent: 'Roda', name: 'BigDick' })).toBe(s);
  });
});

describe('reset (account deleted)', () => {
  it('starts over as a new player', () => {
    const played = { ...initialState(), playerName: 'Roda', wordsGuessed: 40, tokens: 120, unlockedCharacterIds: ['ember'], characterId: 'ember', nextReportSeq: 41 };
    expect(gameReducer(played, { type: 'reset' })).toEqual(initialState());
  });
});
