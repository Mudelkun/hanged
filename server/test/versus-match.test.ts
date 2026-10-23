import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MODES, type MatchResult, type MatchView, type ServerMessage, VERSUS_LIMITS } from '../src/versus-contract.ts';
import { createMatch, type Match, type Seat } from '../src/versus/match.ts';
import { FILL_WAIT_MS, Matchmaker } from '../src/versus/matchmaker.ts';
import { places, ratingDeltas } from '../src/versus/rating.ts';
import { FakeClock, fakeWords, seeded, WORDS } from './versus-helpers.ts';

const seat = (id: string, rating = 1000): Seat => ({ id, name: id.toUpperCase(), characterId: 'mochi', rating });
const MISSES = 'bdfghijkmnopqruvwxyz';

function setup(mode: 'rush' | 'battle' | 'duel', ids: string[], opts: { words?: string[]; ranked?: boolean } = {}) {
  const clock = new FakeClock();
  const inbox = new Map<string, ServerMessage[]>(ids.map((id) => [id, []]));
  const left: string[] = [];
  let result: MatchResult | null = null;
  const match: Match = createMatch(
    {
      clock,
      rng: seeded(),
      words: fakeWords(opts.words),
      send: (id, msg) => inbox.get(id)!.push(msg),
      left: (_m, id) => left.push(id),
      ended: (_m, r) => {
        result = r;
      },
    },
    mode,
    ids.map((id) => seat(id)),
    opts.ranked ?? false,
    'en',
  );
  match.start();
  const last = <T extends ServerMessage['t']>(id: string, t: T) =>
    inbox.get(id)!.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t).at(-1);
  const counters = new Map(ids.map((id) => [id, 0]));
  const n = (id: string) => {
    counters.set(id, counters.get(id)! + 1);
    return counters.get(id)!;
  };
  /** Guesses each letter of `word` (a clue or a repeat changes nothing). */
  const solve = (id: string, word: string) => {
    for (const c of new Set(word)) match.guess(id, n(id), c);
  };
  /** `times` wrong guesses (a letter that turns out to be in the word doesn't count). */
  const miss = (id: string, times: number) => {
    for (const c of MISSES) {
      const you = match.view(id).you;
      if (!times || !you) break;
      if (you.misses.includes(c) || you.hits.includes(c) || you.clues.includes(c)) continue;
      const total = () => match.view(id).players.find((p) => p.id === id)!.misses;
      const before = total();
      match.guess(id, n(id), c);
      if (total() > before) times--;
    }
  };
  return { clock, inbox, match, last, n, solve, miss, left, result: () => result as MatchResult | null };
}

describe('Word Rush', () => {
  it('deals everyone the same word with the same clues, and never sends a hidden letter', () => {
    const { clock, last, match } = setup('rush', ['a', 'b'], { words: ['castle'] });
    assert.equal(match.phase, 'countdown');
    clock.advance(VERSUS_LIMITS.countdownMs);
    assert.equal(match.phase, 'play');
    const a = last('a', 'match')!.match as MatchView;
    const b = last('b', 'match')!.match as MatchView;
    assert.deepEqual(a.you!.tiles, b.you!.tiles);
    assert.deepEqual(a.you!.clues, b.you!.clues);
    assert.ok(a.you!.tiles.includes(''), 'some letters stay hidden');
    assert.ok(!JSON.stringify(a).includes('castle'), 'the word never reaches the device');
    assert.equal(a.endsAt, clock.now() + MODES.rush.durationMs);
  });

  it('judges a message once, even when it arrives twice', () => {
    const { clock, match } = setup('rush', ['a', 'b'], { words: ['castle'] });
    clock.advance(VERSUS_LIMITS.countdownMs);
    match.guess('a', 1, 'x');
    match.guess('a', 1, 'z');
    assert.equal(match.view('a').you!.wrong, 1);
    assert.deepEqual(match.view('a').you!.misses, ['x']);
  });

  it('scores a word and deals the next; when the clock runs out the most words win, then fewer misses', () => {
    const { clock, match, last, solve, miss, result } = setup('rush', ['a', 'b', 'c'], { words: ['castle'] });
    clock.advance(VERSUS_LIMITS.countdownMs);
    solve('a', 'castle');
    const done = last('a', 'puzzle')!;
    assert.deepEqual(done.done, { index: 0, word: 'castle', won: true });
    assert.equal(done.puzzle!.index, 1);
    miss('b', 1);
    solve('b', 'castle');
    clock.advance(MODES.rush.durationMs);
    const r = result()!;
    assert.equal(r.reason, 'done');
    assert.deepEqual(r.standings.map((s) => [s.id, s.place, s.score, s.misses]), [['a', 1, 1, 0], ['b', 2, 1, 1], ['c', 3, 0, 0]]);
    assert.deepEqual(r.words.map((w) => w.word), ['castle', 'castle']);
  });

  it('breaks a tie of words and misses by who got there first', () => {
    const { clock, solve, result } = setup('rush', ['a', 'b'], { words: ['castle'] });
    clock.advance(VERSUS_LIMITS.countdownMs);
    solve('b', 'castle');
    clock.advance(1_000);
    solve('a', 'castle');
    clock.advance(MODES.rush.durationMs);
    assert.deepEqual(result()!.standings.map((s) => [s.id, s.place]), [['b', 1], ['a', 2]]);
  });

  it('moves on without a point after a lost or skipped word', () => {
    const { clock, match, last, miss, n } = setup('rush', ['a', 'b'], { words: ['castle'] });
    clock.advance(VERSUS_LIMITS.countdownMs);
    miss('a', MODES.rush.maxWrong);
    assert.deepEqual(last('a', 'puzzle')!.done, { index: 0, word: 'castle', won: false });
    match.skip('a', n('a'));
    assert.equal(match.view('a').you!.index, 2);
    assert.equal(match.view('a').players[0].score, 0);
  });

  it('ends when the others leave, the leaver placed last', () => {
    const { clock, match, solve, left, result } = setup('rush', ['a', 'b'], { words: ['castle'] });
    clock.advance(VERSUS_LIMITS.countdownMs);
    solve('a', 'castle');
    match.forfeit('a');
    assert.deepEqual(left, ['a']);
    const r = result()!;
    assert.equal(r.reason, 'forfeit');
    assert.deepEqual(r.standings.map((s) => [s.id, s.place, s.left]), [['b', 1, false], ['a', 2, true]]);
  });

  it('waits for a dropped player, and counts them out when they stay away too long', () => {
    const { clock, match, inbox, result } = setup('rush', ['a', 'b', 'c'], { words: ['castle'] });
    clock.advance(VERSUS_LIMITS.countdownMs);
    match.away('a');
    assert.equal(match.view('b').players[0].link, 'away');
    clock.advance(VERSUS_LIMITS.awayForfeitMs - 1);
    inbox.get('a')!.length = 0;
    match.back('a');
    assert.equal(match.view('b').players[0].link, 'on');
    assert.equal(inbox.get('a')!.find((m) => m.t === 'match')?.t, 'match', 'a snapshot on return');
    match.away('b');
    clock.advance(VERSUS_LIMITS.awayForfeitMs);
    assert.equal(match.view('a').players[1].link, 'left');
    assert.equal(result(), null, 'two still playing');
  });
});

describe('Balloon Battle', () => {
  it('pops your balloon on a miss, two of the leader on a word without a miss, and the last one floating wins', () => {
    const { clock, match, last, solve, miss, result } = setup('battle', ['a', 'b', 'c'], { words: ['castle'] });
    clock.advance(VERSUS_LIMITS.countdownMs);
    const balloons = (id: string) => match.view(id).players.find((p) => p.id === id)!.balloons;
    assert.equal(balloons('a'), MODES.battle.balloons);
    miss('b', 1);
    assert.equal(balloons('b'), 9);
    solve('a', 'castle');
    const hit = last('a', 'hit')!;
    assert.equal(hit.from, 'a');
    assert.equal(hit.to, 'c', 'the leader is the target');
    assert.equal(hit.count, MODES.battle.flawlessHits);
    assert.equal(balloons('c'), 8);
    miss('b', 9);
    clock.advance(1_000);
    assert.equal(match.view('b').players[1].out, true);
    assert.equal(match.view('b').you, null);
    assert.equal(result(), null);
    miss('c', 8);
    const r = result()!;
    assert.deepEqual(r.standings.map((s) => [s.id, s.place]), [['a', 1], ['c', 2], ['b', 3]]);
  });

  it('a skip costs a balloon', () => {
    const { clock, match, n } = setup('battle', ['a', 'b'], { words: ['castle'] });
    clock.advance(VERSUS_LIMITS.countdownMs);
    match.skip('a', n('a'));
    assert.equal(match.view('a').players[0].balloons, MODES.battle.balloons - MODES.battle.skipCost);
    assert.equal(match.view('a').you!.index, 1);
  });
});

describe('Word Duel', () => {
  async function picked(d: ReturnType<typeof setup>) {
    d.clock.advance(VERSUS_LIMITS.countdownMs);
    const cards = d.match.view('a').cards!;
    assert.equal(cards.length, MODES.duel.cards);
    d.match.pick('a', d.n('a'), 0);
    assert.equal(d.match.phase, 'pick', 'waits for both');
    d.match.pick('b', d.n('b'), undefined, 'ZEBRA');
    await new Promise((r) => setImmediate(r));
    assert.equal(d.match.phase, 'play');
    return cards[0].word;
  }

  it('gives each the word the other picked; a solved word beats an unsolved one', async () => {
    const d = setup('duel', ['a', 'b']);
    const forB = await picked(d);
    assert.equal(d.match.view('a').you!.tiles.length, 'zebra'.length);
    assert.equal(d.match.view('b').you!.tiles.length, forB.length);
    d.solve('a', 'zebra');
    assert.equal(d.match.phase, 'play', 'b is still guessing');
    d.miss('b', MODES.duel.maxWrong);
    assert.equal(d.match.phase, 'reveal');
    const last = d.match.view('a').last!;
    assert.equal(last.winnerId, 'a');
    assert.deepEqual(last.results.map((r) => [r.id, r.word, r.solved]), [['a', 'zebra', true], ['b', forB, false]]);
  });

  it('refuses a typed word that is not in the dictionary', async () => {
    const d = setup('duel', ['a', 'b']);
    d.clock.advance(VERSUS_LIMITS.countdownMs);
    d.match.pick('a', d.n('a'), undefined, 'qwzzx');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(d.last('a', 'picked'), { t: 'picked', ok: false, n: 1, error: 'badWord' });
    assert.equal(d.match.phase, 'pick');
  });

  it('picks a card for whoever runs out of time', () => {
    const d = setup('duel', ['a', 'b']);
    d.clock.advance(VERSUS_LIMITS.countdownMs);
    d.clock.advance(MODES.duel.pickMs);
    assert.equal(d.match.phase, 'play');
  });

  it('ends after two rounds won (best of 3), the faster solver winning a tie', async () => {
    const d = setup('duel', ['a', 'b'], { ranked: true });
    for (let round = 1; round <= 2; round++) {
      if (round === 1) {
        const forB = await picked(d);
        d.solve('a', 'zebra');
        d.clock.advance(500);
        d.solve('b', forB);
      } else {
        d.clock.advance(MODES.duel.revealMs);
        assert.equal(d.match.phase, 'pick');
        assert.equal(d.match.view('a').round, 2);
        const forB = d.match.view('a').cards![0].word;
        const forA = d.match.view('b').cards![0].word;
        d.match.pick('a', d.n('a'), 0);
        d.match.pick('b', d.n('b'), 0);
        d.solve('a', forA);
        d.miss('b', 1);
        d.solve('b', forB);
      }
      assert.equal(d.match.view('a').last!.winnerId, 'a');
    }
    d.clock.advance(MODES.duel.revealMs);
    const r = d.result()!;
    assert.equal(r.reason, 'done');
    assert.deepEqual(r.standings.map((s) => [s.id, s.place, s.score]), [['a', 1, 2], ['b', 2, 0]]);
    assert.equal(r.words.length, 4);
    assert.ok(r.standings[0].ratingDelta! > 0 && r.standings[1].ratingDelta! < 0, 'ranked: ratings move');
  });
});

describe('rating', () => {
  it('moves the winner up as much as the loser down, and less for an expected win', () => {
    const even = ratingDeltas([{ id: 'a', rating: 1000, place: 1 }, { id: 'b', rating: 1000, place: 2 }]);
    assert.equal(even.get('a'), 16);
    assert.equal(even.get('b'), -16);
    const favourite = ratingDeltas([{ id: 'a', rating: 1400, place: 1 }, { id: 'b', rating: 1000, place: 2 }]);
    assert.ok(favourite.get('a')! < 16);
    const draw = ratingDeltas([{ id: 'a', rating: 1000, place: 1 }, { id: 'b', rating: 1000, place: 1 }]);
    assert.equal(draw.get('a'), 0);
  });

  it('shares places between equals', () => {
    assert.deepEqual(places([5, 3, 3, 1], (a, b) => a === b), [1, 2, 2, 4]);
  });
});

describe('matchmaker', () => {
  it('pairs close ratings at once, and far ones only after waiting', () => {
    const mm = new Matchmaker(() => false);
    mm.join('duel', 'en', { id: 'a', rating: 1000, since: 0 });
    mm.join('duel', 'en', { id: 'b', rating: 1900, since: 0 });
    assert.deepEqual(mm.tick(0), []);
    mm.join('duel', 'en', { id: 'c', rating: 1050, since: 0 });
    assert.deepEqual(mm.tick(0), [{ mode: 'duel', language: 'en', ids: ['a', 'c'] }]);
    mm.join('duel', 'en', { id: 'd', rating: 1000, since: 0 });
    assert.deepEqual(mm.tick(10_000), []);
    assert.deepEqual(mm.tick(45_000)[0].ids.sort(), ['b', 'd']);
    assert.equal(mm.size, 0);
  });

  it('fills a table of four at once, or starts with fewer after the fill wait', () => {
    const mm = new Matchmaker(() => false);
    for (const id of ['a', 'b']) mm.join('rush', 'en', { id, rating: 1000, since: 0 });
    assert.deepEqual(mm.tick(1_000), []);
    assert.deepEqual(mm.tick(FILL_WAIT_MS)[0].ids.sort(), ['a', 'b']);
    for (const id of ['c', 'd', 'e', 'f']) mm.join('rush', 'en', { id, rating: 1000, since: 0 });
    assert.equal(mm.tick(0)[0].ids.length, 4);
  });

  it('keeps languages and modes apart, and never matches players who blocked each other', () => {
    const mm = new Matchmaker((x, y) => [x, y].sort().join() === 'a,b');
    mm.join('duel', 'en', { id: 'a', rating: 1000, since: 0 });
    mm.join('duel', 'en', { id: 'b', rating: 1000, since: 0 });
    mm.join('duel', 'fr', { id: 'c', rating: 1000, since: 0 });
    mm.join('rush', 'en', { id: 'd', rating: 1000, since: 0 });
    assert.deepEqual(mm.tick(60_000), []);
  });
});

it('the test word list is enough for a long rush', () => {
  assert.ok(WORDS.length >= 10);
});
