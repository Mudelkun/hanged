/* Shared by the Versus tests: a clock that only moves when told, seeded dice, a fixed word list. */
import type { Clock } from '../src/versus/match.ts';
import type { VersusWord, WordSource } from '../src/versus/words.ts';

export class FakeClock implements Clock {
  t = 1_000_000;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 0;

  now = () => this.t;

  later = (ms: number, fn: () => void) => {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, fn, id });
    return () => {
      this.timers = this.timers.filter((x) => x.id !== id);
    };
  };

  /** Moves time on, running every timer that falls due, in order. */
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = due.at;
      due.fn();
    }
    this.t = end;
  }
}

export const seeded = (seed = 42) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

const entry = (word: string, language = 'en'): VersusWord => ({
  id: `${language}-${word}`,
  word,
  language,
  description: `A clue for ${word.length} letters.`,
  subject: 'object',
});

export const WORDS = ['castle', 'garden', 'pencil', 'rocket', 'button', 'window', 'basket', 'candle', 'turtle', 'muffin', 'planet', 'violin'];

/** A word source over a fixed list; `find` knows a few more words, like the full pack. */
export function fakeWords(list = WORDS, extra = ['zebra', 'puzzle', 'banana']): WordSource {
  const pool = list.map((w) => entry(w));
  const known = new Map([...list, ...extra].map((w) => [w, entry(w)]));
  return {
    has: (language) => language === 'en',
    pool: (language) => (language === 'en' ? pool : []),
    sizes: () => ({ en: pool.length }),
    deal(language, count, rng, exclude) {
      if (language !== 'en') return [];
      const left = pool.filter((w) => !exclude?.has(w.id));
      const out: VersusWord[] = [];
      while (out.length < count && left.length) out.push(left.splice(Math.floor(rng() * left.length), 1)[0]);
      return out;
    },
    find: async (language, raw) => (language === 'en' ? (known.get(raw.toLowerCase()) ?? null) : null),
  };
}
