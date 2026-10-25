/*
 * Staff roles and what each one allows (Context/dev-accounts.md). Shared like
 * contract.ts: the app reads it to turn its developer powers on, the server to
 * keep those accounts off the boards. No imports.
 *
 * A role is set only on the server, from the admin page (ADMIN_TOKEN), and
 * reaches the device in the sync response. Never from a name, never from
 * anything the device sends. A modified app can pretend to hold one, but only
 * on its own device, which it could already do by editing its save; nothing
 * on the server ever trusts it.
 */

export const PERMISSIONS = [
  /** Every character is owned, including ones added later (nothing is written to the save). */
  'allCharacters',
  /** Jump to any level, and deal a new word at it. */
  'anyLevel',
  /** Spending tokens is free: the balance never goes down. */
  'unlimitedTokens',
  /** The Developer group on Profile: finish a round won or lost. */
  'devTools',
  /** May take a reserved name ("Admin": names.ts RESERVED_NAMES). */
  'reservedNames',
  /**
   * Kept off the leaderboards, the word statistics and Versus ratings: the
   * server counts none of this account's rounds. Every role with a power that
   * changes play on the device must have it (a test checks).
   */
  'unranked',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Powers that change what happens in a solo round. A role with any of them is `unranked`. */
export const PLAY_POWERS: readonly Permission[] = ['allCharacters', 'anyLevel', 'unlimitedTokens', 'devTools'];

/** A new role is one line here (and the admin page lists it). */
export const ROLE_PERMISSIONS = {
  /** The owner's developer account: everything. */
  admin: PERMISSIONS,
} as const satisfies Record<string, readonly Permission[]>;

export type Role = keyof typeof ROLE_PERMISSIONS;
export const ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];

export const isRole = (value: unknown): value is Role => typeof value === 'string' && Object.hasOwn(ROLE_PERMISSIONS, value);

/** The role grants `permission`. null (a regular player) grants nothing. */
export const roleCan = (role: Role | null | undefined, permission: Permission): boolean =>
  isRole(role) && (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission);

/** Roles kept off the boards (the leaderboard's SQL filters them out). */
export const UNRANKED_ROLES: readonly Role[] = ROLES.filter((r) => roleCan(r, 'unranked'));
