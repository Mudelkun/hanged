/*
 * Versus's live socket (server/src/versus/hub.ts). It opens only while it's
 * wanted (src/state/VersusContext.tsx decides), signs in with the account,
 * and comes back by itself with a growing, jittered delay after a drop, so a
 * server restart isn't met by every phone at the same instant. A `bye` the
 * server means (signed in elsewhere, Versus off, app too old) stops it until
 * it's asked again. One message can be `remember`ed and is sent again after
 * every sign-in: the matchmaking queue, which the server drops with a socket.
 */
import type { ByeReason, ClientMessage, ServerMessage } from '../../server/src/versus-contract';
import { VERSUS_PROTOCOL } from '../../server/src/versus-contract';
import { Account, LIVE_URL } from './api';

export type LiveConn = 'connecting' | 'online' | 'offline';

/** These end the session for good: reconnecting would only get the same answer. */
const FINAL: readonly ByeReason[] = ['elsewhere', 'disabled', 'version', 'auth', 'abuse'];

const delay = (attempt: number) => Math.min(15_000, 500 * 2 ** attempt) * (0.5 + Math.random());

export function createLive(handlers: {
  account: () => Promise<Account | null>;
  onMessage: (msg: ServerMessage) => void;
  onConn: (conn: LiveConn) => void;
}) {
  let ws: WebSocket | null = null;
  let wanted = false;
  let online = false;
  let stopped = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let sticky: ClientMessage | null = null;

  const later = () => {
    if (retry || !wanted || stopped) return;
    retry = setTimeout(() => {
      retry = null;
      void open();
    }, delay(attempt++));
  };

  async function open() {
    if (!wanted || stopped || ws || !LIVE_URL) return;
    handlers.onConn('connecting');
    const account = await handlers.account().catch(() => null);
    if (!wanted || ws) return;
    if (!account) {
      handlers.onConn('offline');
      return later();
    }
    const socket = new WebSocket(LIVE_URL);
    ws = socket;
    socket.onopen = () => socket.send(JSON.stringify({ t: 'auth', id: account.id, secret: account.secret, v: VERSUS_PROTOCOL } satisfies ClientMessage));
    socket.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.t === 'hello') {
        online = true;
        attempt = 0;
        handlers.onConn('online');
        if (sticky && msg.status.enabled && !msg.inMatch) socket.send(JSON.stringify(sticky));
      }
      if (msg.t === 'bye' && FINAL.includes(msg.reason)) stopped = true;
      handlers.onMessage(msg);
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      online = false;
      handlers.onConn('offline');
      later();
    };
    socket.onerror = () => {};
  }

  return {
    /** Connects while wanted; closes when not (the server keeps a match waiting a while). */
    want(next: boolean) {
      wanted = next;
      if (next) {
        void open();
        return;
      }
      if (retry) clearTimeout(retry);
      retry = null;
      attempt = 0;
      const socket = ws;
      ws = null;
      online = false;
      socket?.close();
    },
    /** Lifts a final `bye` (e.g. Versus is back on) and connects now if wanted. */
    resume() {
      stopped = false;
      attempt = 0;
      if (retry) clearTimeout(retry);
      retry = null;
      void open();
    },
    /** Sent again after each sign-in, until forgotten (null). */
    remember(msg: ClientMessage | null) {
      sticky = msg;
    },
    /** false when not signed in: the caller shows "reconnecting". */
    send(msg: ClientMessage): boolean {
      if (!ws || !online || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
  };
}
