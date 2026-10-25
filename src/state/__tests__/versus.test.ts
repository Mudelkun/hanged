import type { MatchView, PuzzleView, ServerMessage } from '../../../server/src/versus-contract';
import { initialVersus, inRoom, serverNow, versusReducer, VersusState } from '../versus';

const hello = (over: Partial<Extract<ServerMessage, { t: 'hello' }>> = {}): ServerMessage => ({
  t: 'hello',
  me: 'me',
  now: 10_000,
  status: { enabled: true, message: null },
  stats: { rating: 1000, played: 0, won: 0 },
  inMatch: false,
  inLobby: false,
  ...over,
});

const puzzle = (over: Partial<PuzzleView> = {}): PuzzleView => ({
  index: 0,
  language: 'en',
  tiles: ['c', '', '', '', '', 'e'],
  clues: ['c', 'e'],
  hits: [],
  misses: [],
  wrong: 0,
  maxWrong: 6,
  description: 'A big stone home for a king.',
  status: 'playing',
  ...over,
});

const match = (over: Partial<MatchView> = {}): MatchView => ({
  id: 'm1',
  mode: 'rush',
  ranked: true,
  language: 'en',
  phase: 'play',
  endsAt: 130_000,
  round: 0,
  players: [
    { id: 'me', name: 'Ada', characterId: 'mochi', rating: 1000, link: 'on', score: 0, misses: 0, balloons: 6, found: 0, toFind: 4, out: false },
    { id: 'bo', name: 'Bo', characterId: 'bun', rating: 1000, link: 'on', score: 0, misses: 0, balloons: 6, found: 0, toFind: 4, out: false },
  ],
  you: puzzle(),
  ...over,
});

const run = (s: VersusState, ...msgs: ServerMessage[]) => msgs.reduce((x, msg) => versusReducer(x, { type: 'message', msg, at: 4_000 }), s);

test('hello learns the server clock, and a match the server no longer has is dropped with a notice', () => {
  const s = run(initialVersus, hello());
  expect(s.me).toBe('me');
  expect(serverNow(s, 5_000)).toBe(11_000);
  const playing = run(s, { t: 'match', match: match(), now: 10_000 });
  expect(inRoom(playing)).toBe(true);
  // The server restarted mid-match: the next hello says there's no match
  const after = run(playing, hello({ inMatch: false }));
  expect(after.match).toBeNull();
  expect(after.notice?.kind).toBe('matchLost');
  // A match still there is kept until its snapshot arrives
  expect(run(playing, hello({ inMatch: true })).match?.id).toBe('m1');
});

test('a letter waits until the server judges it; a finished word flashes', () => {
  let s = run(initialVersus, hello(), { t: 'match', match: match(), now: 10_000 });
  s = versusReducer(s, { type: 'guessSent', n: 5, letter: 'a' });
  s = versusReducer(s, { type: 'guessSent', n: 6, letter: 'z' });
  expect(s.pending.map((p) => p.letter)).toEqual(['a', 'z']);
  s = run(s, { t: 'puzzle', puzzle: puzzle({ hits: ['a'], tiles: ['c', 'a', '', '', '', 'e'] }), n: 5 });
  expect(s.pending.map((p) => p.letter)).toEqual(['z']);
  s = run(s, { t: 'puzzle', puzzle: puzzle({ index: 1 }), n: 6, done: { index: 0, word: 'castle', won: true } });
  expect(s.pending).toEqual([]);
  expect(s.flash).toEqual({ index: 0, word: 'castle', won: true, at: 4_000 });
  expect(s.match?.you?.index).toBe(1);
});

test('player updates replace one player; the end keeps the result and leaves the match', () => {
  let s = run(initialVersus, hello(), { t: 'match', match: match(), now: 10_000 });
  s = run(s, { t: 'player', player: { ...match().players[1], score: 3 } });
  expect(s.match?.players.map((p) => p.score)).toEqual([0, 3]);
  s = run(s, { t: 'end', result: { matchId: 'm1', mode: 'rush', ranked: true, reason: 'done', standings: [], words: [] } });
  expect(s.match).toBeNull();
  expect(s.result?.matchId).toBe('m1');
  expect(inRoom(s)).toBe(true);
  expect(inRoom(versusReducer(s, { type: 'dismissResult' }))).toBe(false);
});

test('invites come and go; turning Versus off clears queue, lobby and invites', () => {
  const invite = { lobbyId: 'l1', from: { id: 'bo', name: 'Bo', characterId: 'bun' }, mode: 'duel' as const, expiresAt: 70_000 };
  let s = run(initialVersus, hello(), { t: 'invite', invite }, { t: 'invite', invite });
  expect(s.invites).toHaveLength(1);
  expect(run(s, { t: 'inviteGone', lobbyId: 'l1' }).invites).toEqual([]);
  s = run(s, { t: 'queued', mode: 'rush', since: 9_000 });
  expect(s.queue?.mode).toBe('rush');
  s = run(s, { t: 'status', status: { enabled: false, message: 'Back soon' } });
  expect([s.queue, s.lobby, s.invites.length]).toEqual([null, null, 0]);
  expect(s.status?.message).toBe('Back soon');
});

test('a reconnect keeps the queue (the app queues again at once), unless Versus went off', () => {
  const queued = run(initialVersus, hello(), { t: 'queued', mode: 'battle', since: 9_000 });
  expect(run(queued, hello()).queue?.mode).toBe('battle');
  expect(run(queued, hello({ status: { enabled: false, message: null } })).queue).toBeNull();
});

test('the server ending the session stops reconnecting; Versus back on lifts it', () => {
  let s = run(initialVersus, hello(), { t: 'bye', reason: 'disabled' });
  expect(s.closed).toBe('disabled');
  s = versusReducer(s, { type: 'status', status: { enabled: true, message: null } });
  expect(s.closed).toBeNull();
  expect(run(initialVersus, { t: 'bye', reason: 'restart' }).closed).toBeNull();
});

test('a refused pick says why, and a new pick phase starts clean', () => {
  let s = run(initialVersus, hello(), { t: 'match', match: match({ mode: 'duel', phase: 'pick', you: null, cards: [], picked: false }), now: 10_000 });
  s = versusReducer(s, { type: 'pickSent' });
  expect(s.pick.sending).toBe(true);
  s = run(s, { t: 'picked', ok: false, n: 1, error: 'badWord' });
  expect(s.pick).toEqual({ sending: false, error: 'badWord' });
  s = run(s, { t: 'match', match: match({ mode: 'duel', phase: 'play' }), now: 10_000 });
  expect(s.pick).toEqual({ sending: false, error: null });
});

test("someone following my invite link shows who; a newer server's unknown message changes nothing", () => {
  const by = { id: 'bo', name: 'Bo', characterId: 'bun' };
  const s = run(initialVersus, hello(), { t: 'friendAdded', by });
  expect(s.friendNote).toEqual({ kind: 'friends', player: by, at: 4_000 });
  expect(versusReducer(s, { type: 'friendNote', note: null, at: 5_000 }).friendNote).toBeNull();
  expect(run(s, { t: 'somethingNew' } as unknown as ServerMessage)).toBe(s);
});
