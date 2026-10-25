/*
 * The only module that talks to the server (server/, API in
 * server/src/contract.ts). The game never waits for it: without
 * EXPO_PUBLIC_API_URL or without a connection every call just fails.
 */
import type { LeaderboardResponse, NameAvailableResponse, Period, RegisterResponse, SyncRequest, SyncResponse } from '../../server/src/contract';
import type { FriendsResponse, InviteAcceptResponse, InviteResponse, PlayerCard, ReportReason, RequestResponse, SearchResponse, VersusStatus } from '../../server/src/versus-contract';
import { INVITE_PATH } from '../../server/src/versus-contract';

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
/** Versus's live socket (src/net/live.ts): the same server, over ws(s). Empty without a server. */
export const LIVE_URL = BASE && `${BASE.replace(/^http/, 'ws')}/v1/live`;
/** A friend invite link (server/src/versus/links.ts); the app opens these itself once installed. Empty without a server. */
export const inviteLink = (code: string) => BASE && `${BASE}${INVITE_PATH}${code}`;
const TIMEOUT_MS = 10_000;

export type Account = RegisterResponse;

export class ApiError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function call<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; account?: Account; timeoutMs?: number } = {},
): Promise<T> {
  if (!BASE) throw new ApiError(0);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      method: init.method ?? 'GET',
      signal: ctrl.signal,
      headers: {
        ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(init.account && { Authorization: `Bearer ${init.account.id}:${init.account.secret}` }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) throw new ApiError(res.status);
    return (res.status === 204 ? undefined : await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  register: () => call<RegisterResponse>('/v1/players', { method: 'POST' }),
  sync: (account: Account, body: SyncRequest) => call<SyncResponse>('/v1/sync', { method: 'POST', body, account }),
  deletePlayer: (account: Account) => call<void>('/v1/players/me', { method: 'DELETE', account }),
  leaderboard: (period: Period, me?: string) =>
    call<LeaderboardResponse>(`/v1/leaderboard?period=${period}${me ? `&me=${me}` : ''}`),
  /** Short timeout: the player is waiting on Save, and offline the sync settles it later. */
  nameAvailable: (name: string, me?: string | null) =>
    call<NameAvailableResponse>(`/v1/names/available?name=${encodeURIComponent(name)}${me ? `&me=${me}` : ''}`, { timeoutMs: 3_000 }),

  // Versus: the switch, and the friends system (server/src/versus/routes.ts)
  versusStatus: () => call<VersusStatus>('/v1/versus/status', { timeoutMs: 5_000 }),
  friends: (account: Account) => call<FriendsResponse>('/v1/friends', { account }),
  search: (account: Account, q: string) => call<SearchResponse>(`/v1/players/search?q=${encodeURIComponent(q)}`, { account, timeoutMs: 5_000 }),
  requestFriend: (account: Account, playerId: string) =>
    call<RequestResponse>('/v1/friends/requests', { method: 'POST', body: { playerId }, account }),
  acceptFriend: (account: Account, id: string) => call<void>(`/v1/friends/requests/${id}/accept`, { method: 'POST', account }),
  /** Declines their request, or cancels mine. */
  dropRequest: (account: Account, id: string) => call<void>(`/v1/friends/requests/${id}`, { method: 'DELETE', account }),
  removeFriend: (account: Account, id: string) => call<void>(`/v1/friends/${id}`, { method: 'DELETE', account }),
  block: (account: Account, id: string) => call<void>(`/v1/blocks/${id}`, { method: 'PUT', account }),
  unblock: (account: Account, id: string) => call<void>(`/v1/blocks/${id}`, { method: 'DELETE', account }),
  report: (account: Account, id: string, reason: ReportReason) =>
    call<void>(`/v1/players/${id}/report`, { method: 'POST', body: { reason }, account }),
  myInvite: (account: Account) => call<InviteResponse>('/v1/invites', { method: 'POST', account }),
  inviter: (code: string) => call<PlayerCard>(`/v1/invites/${code}`, { timeoutMs: 5_000 }),
  acceptInvite: (account: Account, code: string) => call<InviteAcceptResponse>(`/v1/invites/${code}/accept`, { method: 'POST', account }),
};
