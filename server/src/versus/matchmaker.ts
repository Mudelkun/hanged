/*
 * Matchmaking: players waiting for a random opponent, one queue per mode and
 * language (everyone in a match plays the same words). It pairs players of
 * close rating, and the window widens the longer someone waits, so nobody
 * waits forever. A mode for 2-4 players waits FILL_WAIT_MS for a full table,
 * then starts with whoever fits. Players who blocked each other are never
 * matched. Pure: `tick` returns the groups and the hub starts them.
 *
 * Each tick scans every queue once. A waiter looks only at its rating
 * neighbours (sorted array, two pointers), and never past MAX_WINDOW, so a
 * tick costs about O(n log n) per queue.
 */
import { MODES, type ModeId } from '../versus-contract.ts';

export interface Waiting {
  id: string;
  rating: number;
  since: number;
}

export interface Group {
  mode: ModeId;
  language: string;
  ids: string[];
}

/** PLACEHOLDER tuning. Rating gap accepted at first, how fast it widens, and its cap. */
const BASE_WINDOW = 100;
const WIDEN_PER_SECOND = 20;
const MAX_WINDOW = 1_000;
/** A 2-4 player mode waits this long for a full table before starting with fewer. */
export const FILL_WAIT_MS = 8_000;

const keyOf = (mode: ModeId, language: string) => `${mode}:${language}`;

export class Matchmaker {
  private readonly queues = new Map<string, { mode: ModeId; language: string; waiting: Waiting[] }>();
  private readonly where = new Map<string, string>();
  private readonly blocked: (a: string, b: string) => boolean;

  constructor(blocked: (a: string, b: string) => boolean) {
    this.blocked = blocked;
  }

  get size() {
    return this.where.size;
  }

  has(id: string) {
    return this.where.has(id);
  }

  ids(): string[] {
    return [...this.where.keys()];
  }

  join(mode: ModeId, language: string, w: Waiting) {
    this.leave(w.id);
    const key = keyOf(mode, language);
    const queue = this.queues.get(key) ?? { mode, language, waiting: [] };
    queue.waiting.push(w);
    this.queues.set(key, queue);
    this.where.set(w.id, key);
  }

  leave(id: string): boolean {
    const key = this.where.get(id);
    if (!key) return false;
    this.where.delete(id);
    const queue = this.queues.get(key)!;
    queue.waiting = queue.waiting.filter((w) => w.id !== id);
    if (!queue.waiting.length) this.queues.delete(key);
    return true;
  }

  clear(): string[] {
    const ids = this.ids();
    this.queues.clear();
    this.where.clear();
    return ids;
  }

  /** Groups ready to play now, taken out of their queues. */
  tick(now: number): Group[] {
    const groups: Group[] = [];
    for (const { mode, language, waiting } of [...this.queues.values()]) {
      const { minPlayers, maxPlayers } = MODES[mode];
      const window = (w: Waiting) => Math.min(MAX_WINDOW, BASE_WINDOW + (WIDEN_PER_SECOND * (now - w.since)) / 1000);
      const byRating = [...waiting].sort((a, b) => a.rating - b.rating);
      const at = new Map(byRating.map((w, i) => [w.id, i]));
      const taken = new Set<string>();
      // The longest waiting choose first
      for (const p of [...waiting].sort((a, b) => a.since - b.since)) {
        if (taken.has(p.id)) continue;
        const group = [p];
        let l = at.get(p.id)! - 1;
        let r = at.get(p.id)! + 1;
        const skip = () => {
          while (l >= 0 && taken.has(byRating[l].id)) l--;
          while (r < byRating.length && taken.has(byRating[r].id)) r++;
        };
        while (group.length < maxPlayers) {
          skip();
          const left = l >= 0 ? byRating[l] : null;
          const right = r < byRating.length ? byRating[r] : null;
          if (!left && !right) break;
          const gap = (q: Waiting | null) => (q ? Math.abs(q.rating - p.rating) : Infinity);
          const useLeft = gap(left) <= gap(right);
          const q = (useLeft ? left : right)!;
          if (useLeft) l--;
          else r++;
          // Further neighbours are only further away
          if (gap(q) > MAX_WINDOW) break;
          const fits = gap(q) <= Math.max(window(p), window(q));
          if (fits && !group.some((g) => this.blocked(g.id, q.id))) group.push(q);
        }
        const oldest = Math.min(...group.map((g) => g.since));
        if (group.length === maxPlayers || (group.length >= minPlayers && now - oldest >= FILL_WAIT_MS)) {
          for (const g of group) taken.add(g.id);
          groups.push({ mode, language, ids: group.map((g) => g.id) });
        }
      }
      for (const id of taken) this.leave(id);
    }
    return groups;
  }
}
