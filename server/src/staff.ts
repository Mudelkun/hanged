/*
 * Staff accounts (Context/dev-accounts.md): finding a player and giving or
 * taking their role, for the admin page (admin.ts). The only code that writes
 * `players.role`. The device learns its role from its next sync.
 */
import type { Db, Sql } from './db.ts';
import { nameKey } from './names.ts';
import { type Role, roleCan } from './roles.ts';
import { likeEscape } from './versus/store.ts';

export interface StaffRow {
  id: string;
  name: string | null;
  role: Role | null;
  words: number;
  /** When the device last synced (ISO), null = never. */
  syncedAt: string | null;
}

const ROW = `id, name, role, words_guessed AS words, synced_at AS "syncedAt"`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOUND_MAX = 20;

/** Every account holding a role. */
export async function staffList(db: Sql): Promise<StaffRow[]> {
  const { rows } = await db.query<StaffRow>(`SELECT ${ROW} FROM players WHERE role IS NOT NULL ORDER BY name_key NULLS LAST, id`);
  return rows;
}

/** A player by id, or the players whose name starts with `q` (case, accents and punctuation aside). */
export async function findPlayers(db: Sql, q: string): Promise<StaffRow[]> {
  const query = q.trim();
  if (UUID.test(query)) return (await db.query<StaffRow>(`SELECT ${ROW} FROM players WHERE id = $1`, [query.toLowerCase()])).rows;
  const key = nameKey(query);
  if (!key) return [];
  const { rows } = await db.query<StaffRow>(
    `SELECT ${ROW} FROM players WHERE name_key LIKE $1 || '%' ORDER BY name_key = $2 DESC, name_key LIMIT $3`,
    [likeEscape(key), key, FOUND_MAX],
  );
  return rows;
}

/**
 * Gives `id` the role (null takes it away). An unranked role also drops the
 * player's weekly rows, so this week's board and ranks lose them at once (the
 * sync never writes new ones); their all-time row is filtered by the board
 * itself, so a role taken away puts them back with only what they earned
 * without it. false: no such player.
 */
export function setRole(db: Db, id: string, role: Role | null): Promise<boolean> {
  return db.tx(async (sql) => {
    const { rows } = await sql.query('UPDATE players SET role = $2 WHERE id = $1 RETURNING 1', [id, role]);
    if (!rows.length) return false;
    if (roleCan(role, 'unranked')) await sql.query('DELETE FROM player_weeks WHERE player_id = $1', [id]);
    return true;
  });
}
