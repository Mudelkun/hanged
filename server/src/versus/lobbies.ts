/*
 * Lobbies: a room where friends gather before a match. The host picks the
 * mode, the others say they're ready, the host starts. A code (6 letters,
 * LOBBY_CODE_ALPHABET) lets anyone join, invited or not. After a match the
 * lobby is back with everyone still in it: rematch. Pure data: the hub
 * sends the messages.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { LOBBY_CODE_ALPHABET, type LobbyMember, type LobbyView, MODES, type ModeId, VERSUS_LIMITS } from '../versus-contract.ts';

export interface Lobby extends LobbyView {
  /** Pending "leave" timers of members whose connection dropped (VERSUS_LIMITS.lobbyGraceMs). */
  grace: Map<string, () => void>;
}

export type LobbyError = 'noLobby' | 'full' | 'notHost' | 'notReady' | 'blocked';

export class Lobbies {
  private readonly byId = new Map<string, Lobby>();
  private readonly byCode = new Map<string, Lobby>();
  private readonly of = new Map<string, Lobby>();

  get size() {
    return this.byId.size;
  }

  /** The lobby a player is in. */
  find(playerId: string): Lobby | undefined {
    return this.of.get(playerId);
  }

  get(lobbyId: string): Lobby | undefined {
    return this.byId.get(lobbyId);
  }

  byCodeOf(code: string): Lobby | undefined {
    return this.byCode.get(code.toUpperCase());
  }

  all(): IterableIterator<Lobby> {
    return this.byId.values();
  }

  create(host: Omit<LobbyMember, 'ready'>, mode: ModeId, language: string): Lobby {
    const lobby: Lobby = {
      id: randomUUID(),
      code: this.newCode(),
      hostId: host.id,
      mode,
      language,
      members: [{ ...host, ready: true }],
      playing: false,
      grace: new Map(),
    };
    this.byId.set(lobby.id, lobby);
    this.byCode.set(lobby.code, lobby);
    this.of.set(host.id, lobby);
    return lobby;
  }

  /** `blocked(a, b)`: a block either way keeps a player out of a lobby with that player. */
  join(lobby: Lobby | undefined, member: Omit<LobbyMember, 'ready'>, blocked: (a: string, b: string) => boolean): Lobby | LobbyError {
    if (!lobby) return 'noLobby';
    if (lobby.members.some((m) => m.id === member.id)) return lobby;
    if (lobby.playing || lobby.members.length >= MODES[lobby.mode].maxPlayers) return 'full';
    if (lobby.members.some((m) => blocked(m.id, member.id))) return 'blocked';
    lobby.members.push({ ...member, ready: false });
    this.of.set(member.id, lobby);
    return lobby;
  }

  /** Takes a player out. The next member hosts when the host leaves; an empty lobby closes (returns closed: true). */
  leave(playerId: string): { lobby: Lobby; closed: boolean } | null {
    const lobby = this.of.get(playerId);
    if (!lobby) return null;
    this.of.delete(playerId);
    lobby.grace.get(playerId)?.();
    lobby.grace.delete(playerId);
    lobby.members = lobby.members.filter((m) => m.id !== playerId);
    if (!lobby.members.length) {
      this.close(lobby);
      return { lobby, closed: true };
    }
    if (lobby.hostId === playerId) {
      lobby.hostId = lobby.members[0].id;
      lobby.members[0].ready = true;
    }
    return { lobby, closed: false };
  }

  close(lobby: Lobby) {
    for (const cancel of lobby.grace.values()) cancel();
    for (const m of lobby.members) if (this.of.get(m.id) === lobby) this.of.delete(m.id);
    this.byId.delete(lobby.id);
    this.byCode.delete(lobby.code);
  }

  setMode(lobby: Lobby, by: string, mode: ModeId): LobbyError | null {
    if (lobby.hostId !== by) return 'notHost';
    if (lobby.members.length > MODES[mode].maxPlayers) return 'full';
    lobby.mode = mode;
    // A new mode is a new game: everyone says ready again
    for (const m of lobby.members) m.ready = m.id === lobby.hostId;
    return null;
  }

  setReady(lobby: Lobby, playerId: string, ready: boolean) {
    const m = lobby.members.find((x) => x.id === playerId);
    if (m && m.id !== lobby.hostId) m.ready = ready;
  }

  /** Whether the host can start now. */
  canStart(lobby: Lobby, by: string): LobbyError | null {
    if (lobby.hostId !== by) return 'notHost';
    if (lobby.playing) return 'full';
    if (lobby.members.length < MODES[lobby.mode].minPlayers || lobby.members.some((m) => !m.ready)) return 'notReady';
    return null;
  }

  /** Back from a match: ready again from scratch. */
  rematch(lobby: Lobby) {
    lobby.playing = false;
    for (const m of lobby.members) m.ready = m.id === lobby.hostId;
  }

  view(lobby: Lobby): LobbyView {
    const { grace: _, ...view } = lobby;
    return { ...view, members: view.members.map((m) => ({ ...m })) };
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < VERSUS_LIMITS.codeLength; i++) code += LOBBY_CODE_ALPHABET[randomInt(LOBBY_CODE_ALPHABET.length)];
      if (!this.byCode.has(code)) return code;
    }
  }
}
