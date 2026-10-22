import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkName, cleanName, NAME_MAX } from '../src/names.ts';

const problem = (name: string) => {
  const check = checkName(name);
  return check.ok ? null : check.problem;
};

describe('player names', () => {
  it('cleanName', () => {
    assert.equal(cleanName('   '), null);
    assert.equal(cleanName(null), null);
    assert.equal(cleanName(' Zoé\n '), 'Zoé');
    assert.equal(cleanName('Ro\u200bda   Pi'), 'Roda Pi');
  });

  it('takes ordinary names, in any language', () => {
    for (const name of ['Roda', 'Zoé', 'O’Brien', "D'Arcy", 'Mike_99', 'Anne-Marie', 'SunnyOtter', 'Sunny Owl', 'Jürgen', '小明', 'Dev'])
      assert.deepEqual(checkName(name), { ok: true, name });
  });

  it('checks the length after tidying', () => {
    assert.equal(problem(' a '), 'short');
    assert.equal(problem(''), 'short');
    assert.equal(problem('x'.repeat(NAME_MAX)), null);
    assert.equal(problem('x'.repeat(NAME_MAX + 1)), 'long');
  });

  it('wants letters, and no emoji or symbols', () => {
    for (const name of ['12345', '😀 Bob', 'Bob<x>', '___', 'a@b.com']) assert.equal(problem(name), 'characters', name);
  });

  it('blocks offensive words, however they are dressed up', () => {
    for (const name of ['fuuuuck', 'F.U.C.K', 'xXcuntXx', 'BigDick', 'big dick', 'a s s', 'Sh1t', 'N1gger', 'b00bs', 'NAZI', 'Héil', 'f u c k', 'Wh0re', 'b1tch', 'Hitler', 'KYS'])
      assert.equal(problem(name), 'blocked', name);
  });

  it('blocks names that pretend to speak for the game', () => {
    for (const name of ['Admin', 'admin123', 'Hanged', 'Moderator', 'OfficialJo', 'Support']) assert.equal(problem(name), 'blocked', name);
  });

  it("doesn't block harmless names that hide a bad word", () => {
    for (const name of ['Titan', 'Grape', 'Sussex', 'Hancock', 'Yoshito', 'Nazir', 'Nigeria', 'Swanky', 'Torpedo', 'Bob', 'As Good', 'Cassandra', 'Dickens', 'Scunthorpe', 'Analise', 'Classic', 'Therapist'])
      assert.equal(problem(name), null, name);
  });
});
