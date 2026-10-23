/*
 * The Versus rating: Elo, moved only by matchmade (ranked) matches, so
 * friends can't trade wins to climb. A match of 3 or 4 is every pair of
 * players as a game, with K shared over the opponents, so a big match moves a
 * rating about as much as a duel.
 */

/** How far one match can move a rating. PLACEHOLDER. */
export const K = 32;
export const START_RATING = 1000;

/** Rating change per player id. A lower place is better; equal places are a draw. */
export function ratingDeltas(players: readonly { id: string; rating: number; place: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const share = K / Math.max(1, players.length - 1);
  for (const a of players) {
    let delta = 0;
    for (const b of players) {
      if (a === b) continue;
      const expected = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
      const actual = a.place < b.place ? 1 : a.place === b.place ? 0.5 : 0;
      delta += share * (actual - expected);
    }
    out.set(a.id, Math.round(delta));
  }
  return out;
}

/**
 * Places from an order, best first: players `same` calls equal share a place
 * (1, 2, 2, 4).
 */
export function places<T>(ordered: readonly T[], same: (a: T, b: T) => boolean): number[] {
  return ordered.map((p, i, all) => {
    let first = i;
    while (first > 0 && same(all[first - 1], p)) first--;
    return first + 1;
  });
}
