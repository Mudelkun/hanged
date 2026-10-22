/*
 * The only module that talks to the server (server/, API in
 * server/src/contract.ts). The game never waits for it: without
 * EXPO_PUBLIC_API_URL or without a connection every call just fails.
 */
import type { LeaderboardResponse, Period, RegisterResponse, SyncRequest, SyncResponse } from '../../server/src/contract';

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
const TIMEOUT_MS = 10_000;

export type Account = RegisterResponse;

export class ApiError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function call<T>(path: string, init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; account?: Account } = {}): Promise<T> {
  if (!BASE) throw new ApiError(0);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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
};
