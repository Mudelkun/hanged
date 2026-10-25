import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, beforeEach, describe, it } from 'node:test';

import WebSocket from 'ws';

import { buildApp } from '../src/app.ts';
import type { RegisterResponse } from '../src/contract.ts';
import { embedded, type Db } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { type FriendsResponse, type InviteAcceptResponse, type InviteResponse, MODES, type SearchResponse, type ServerMessage, VERSUS_LIMITS, VERSUS_PROTOCOL } from '../src/versus-contract.ts';
import { FILL_WAIT_MS } from '../src/versus/matchmaker.ts';
import { loadWords } from '../src/versus/words.ts';
import { readFile } from 'node:fs/promises';

import { fromBundle, seedWords, syncWords, toBundle, WORDS_BUNDLE } from '../src/words.ts';
import { FakeClock, fakeWords, seeded } from './versus-helpers.ts';

const ADMIN = 'a'.repeat(32);
let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
let clock: FakeClock;
let base: string;
const sockets: WebSocket[] = [];

before(async () => {
  db = await embedded();
  await migrate(db);
  clock = new FakeClock();
  app = await buildApp(db, {
    newPlayersPerHour: 1_000,
    words: fakeWords(['castle']),
    adminToken: ADMIN,
    versus: { clock, rng: seeded() },
    links: { appleAppId: 'TEAM123456.com.example.hanged', appStoreId: '123456789', androidPackage: 'com.example.hanged', androidCerts: ['AB:CD'] },
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as { port: number };
  base = `127.0.0.1:${port}`;
});
after(async () => {
  for (const ws of sockets) ws.terminate();
  await app.close();
  await db.close();
});
beforeEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  app.hub.setStatus({ enabled: true, message: null });
  await db.exec('TRUNCATE players, settings, versus_days CASCADE');
});

type Player = RegisterResponse & { name: string };

async function newPlayer(name: string): Promise<Player> {
  const p = (await app.inject({ method: 'POST', url: '/v1/players' })).json<RegisterResponse>();
  const player = { name, characterId: 'mochi', language: 'en', wordsGuessed: 0, level: 1, tokens: 0 };
  await app.inject({ method: 'POST', url: '/v1/sync', headers: { authorization: `Bearer ${p.id}:${p.secret}` }, payload: { player, reports: [] } });
  return { ...p, name };
}

const http = (p: Player, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${p.id}:${p.secret}` }, ...(payload && { payload }) });

/** A socket signed in as `p`, with a way to wait for the next message of a kind. */
async function live(p: Player, v = VERSUS_PROTOCOL) {
  const ws = new WebSocket(`ws://${base}/v1/live`);
  sockets.push(ws);
  const inbox: ServerMessage[] = [];
  const waiting: { t: string; ok: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data)) as ServerMessage;
    const w = waiting.findIndex((x) => x.t === msg.t && x.ok(msg));
    if (w >= 0) waiting.splice(w, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  await once(ws, 'open');
  let n = 0;
  const client = {
    ws,
    send: (msg: object) => ws.send(JSON.stringify(msg)),
    guess: (letter: string) => client.send({ t: 'guess', n: ++n, letter }),
    next<T extends ServerMessage['t']>(t: T, ok: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true) {
      const match = (m: ServerMessage): m is Extract<ServerMessage, { t: T }> => m.t === t && ok(m as Extract<ServerMessage, { t: T }>);
      const i = inbox.findIndex(match);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0] as Extract<ServerMessage, { t: T }>);
      return new Promise<Extract<ServerMessage, { t: T }>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${t} for ${p.name}`)), 3_000);
        waiting.push({ t, ok: ok as (m: ServerMessage) => boolean, resolve: (m) => (clearTimeout(timer), resolve(m as Extract<ServerMessage, { t: T }>)) });
      });
    },
  };
  client.send({ t: 'auth', id: p.id, secret: p.secret, v });
  return client;
}

describe('the live socket', () => {
  it('signs a player in, and turns away a wrong secret or an old app', async () => {
    const a = await newPlayer('Ada');
    const hello = await (await live(a)).next('hello');
    assert.equal(hello.me, a.id);
    assert.deepEqual(hello.stats, { rating: 1000, played: 0, won: 0 });
    assert.equal(hello.inMatch, false);
    assert.equal((await (await live({ ...a, secret: 'x'.repeat(43) })).next('bye')).reason, 'auth');
    assert.equal((await (await live(a, 0)).next('bye')).reason, 'version');
  });

  it('a second socket for the same player replaces the first', async () => {
    const a = await newPlayer('Ada');
    const first = await live(a);
    await first.next('hello');
    await (await live(a)).next('hello');
    assert.equal((await first.next('bye')).reason, 'elsewhere');
  });

  it('matches two queued players, plays it out, resumes a dropped player, and counts the result', async () => {
    const [a, b] = [await newPlayer('Ada'), await newPlayer('Bo')];
    const [la, lb] = [await live(a), await live(b)];
    await la.next('hello');
    await lb.next('hello');
    la.send({ t: 'queue', mode: 'rush', language: 'en' });
    lb.send({ t: 'queue', mode: 'rush', language: 'en' });
    await la.next('queued');
    await lb.next('queued');
    clock.advance(FILL_WAIT_MS);
    app.hub.tick();
    assert.equal((await la.next('match')).match.phase, 'countdown');
    assert.equal(app.hub.presence(a.id), 'playing');
    clock.advance(VERSUS_LIMITS.countdownMs);
    const play = await la.next('match', (m) => m.match.phase === 'play');
    assert.equal(play.match.ranked, true);

    for (const c of 'castle') la.guess(c);
    assert.deepEqual((await la.next('puzzle', (m) => !!m.done)).done, { index: 0, word: 'castle', won: true });
    // A guess sent twice (same n) is judged once
    la.send({ t: 'guess', n: 100, letter: 'z' });
    la.send({ t: 'guess', n: 100, letter: 'q' });
    await lb.next('player', (m) => m.player.id === a.id && m.player.misses === 1);

    // b drops and comes back: the match is waiting, with everything in place
    lb.ws.terminate();
    await la.next('player', (m) => m.player.id === b.id && m.player.link === 'away');
    const back = await live(b);
    const hello = await back.next('hello');
    assert.equal(hello.inMatch, true);
    const snapshot = await back.next('match');
    assert.equal(snapshot.match.players.find((p) => p.id === a.id)!.score, 1);

    clock.advance(MODES.rush.durationMs);
    const { result } = await la.next('end');
    assert.deepEqual(result.standings.map((s) => [s.id, s.place, s.score, s.misses]), [[a.id, 1, 1, 1], [b.id, 2, 0, 0]]);
    assert.equal(result.standings[0].ratingDelta, 16);
    const stats = await la.next('stats');
    assert.deepEqual(stats.stats, { rating: 1016, played: 1, won: 1 });
    const { rows } = await db.query('SELECT matches, players FROM versus_days');
    assert.deepEqual(rows, [{ matches: 1, players: 2 }]);
  });
});

describe('friends', () => {
  it('finds players by name, turns mutual requests into friends, shows presence, and removes', async () => {
    const [a, b, c] = [await newPlayer('Roda'), await newPlayer('Rodrigo'), await newPlayer('Zed')];
    const found = (await http(a, 'GET', '/v1/players/search?q=rod')).json<SearchResponse>();
    assert.deepEqual(found.players.map((p) => [p.name, p.relation]), [['Rodrigo', 'none']]);

    const lb = await live(b);
    await lb.next('hello');
    assert.equal((await http(a, 'POST', '/v1/friends/requests', { playerId: b.id })).json().status, 'sent');
    await lb.next('friends');
    assert.deepEqual((await http(b, 'GET', '/v1/friends')).json<FriendsResponse>().incoming.map((p) => p.name), ['Roda']);
    assert.equal((await http(b, 'POST', `/v1/friends/requests/${a.id}/accept`)).statusCode, 204);
    const list = (await http(a, 'GET', '/v1/friends')).json<FriendsResponse>();
    assert.deepEqual(list.friends.map((f) => [f.name, f.presence]), [['Rodrigo', 'online']]);
    assert.equal(list.incoming.length + list.outgoing.length, 0);

    // Asking someone who already asked you makes you friends at once
    await http(c, 'POST', '/v1/friends/requests', { playerId: a.id });
    assert.equal((await http(a, 'POST', '/v1/friends/requests', { playerId: c.id })).json().status, 'friends');

    assert.equal((await http(a, 'DELETE', `/v1/friends/${b.id}`)).statusCode, 204);
    assert.deepEqual((await http(b, 'GET', '/v1/friends')).json<FriendsResponse>().friends, []);
  });

  it('a block hides both players from each other and ends the friendship', async () => {
    const [a, b] = [await newPlayer('Roda'), await newPlayer('Rodrigo')];
    await http(a, 'POST', '/v1/friends/requests', { playerId: b.id });
    await http(b, 'POST', '/v1/friends/requests', { playerId: a.id });
    assert.equal((await http(a, 'PUT', `/v1/blocks/${b.id}`)).statusCode, 204);
    assert.deepEqual((await http(b, 'GET', '/v1/players/search?q=roda')).json<SearchResponse>().players, []);
    assert.equal((await http(b, 'POST', '/v1/friends/requests', { playerId: a.id })).json().status, 'sent', "a block isn't revealed");
    const mine = (await http(a, 'GET', '/v1/friends')).json<FriendsResponse>();
    assert.deepEqual([mine.friends.length, mine.incoming.length, mine.blocked.map((p) => p.name)], [0, 0, ['Rodrigo']]);
    assert.equal((await http(a, 'POST', `/v1/players/${b.id}/report`, { reason: 'name' })).statusCode, 204);
  });

  it('needs a signed-in player', async () => {
    assert.equal((await app.inject({ url: '/v1/friends' })).statusCode, 401);
  });
});

describe('friend invite links', () => {
  it('makes one lasting code per player; following it makes friends at once and tells the inviter', async () => {
    const [a, b] = [await newPlayer('Roda'), await newPlayer('Bo')];
    const { code } = (await http(a, 'POST', '/v1/invites')).json<InviteResponse>();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.equal((await http(a, 'POST', '/v1/invites')).json<InviteResponse>().code, code, 'every link shared keeps working');
    assert.equal((await app.inject({ url: `/v1/invites/${code}` })).json().name, 'Roda');

    const la = await live(a);
    await la.next('hello');
    const accepted = await http(b, 'POST', `/v1/invites/${code}/accept`);
    assert.deepEqual(accepted.json<InviteAcceptResponse>(), { status: 'friends', player: { id: a.id, name: 'Roda', characterId: 'mochi' } });
    assert.equal((await la.next('friendAdded')).by.name, 'Bo');
    await la.next('friends');
    assert.deepEqual((await http(b, 'GET', '/v1/friends')).json<FriendsResponse>().friends.map((f) => f.name), ['Roda']);
    // Following it again changes nothing
    assert.equal((await http(b, 'POST', `/v1/invites/${code}/accept`)).json().status, 'friends');
  });

  it("refuses your own link and unknown codes, doesn't reveal a block, and clears a pending request", async () => {
    const [a, b, c] = [await newPlayer('Roda'), await newPlayer('Bo'), await newPlayer('Cy')];
    const { code } = (await http(a, 'POST', '/v1/invites')).json<InviteResponse>();
    assert.equal((await http(a, 'POST', `/v1/invites/${code}/accept`)).statusCode, 400);
    assert.equal((await http(b, 'POST', '/v1/invites/ZZZZZZZZ/accept')).statusCode, 404);
    assert.equal((await http(b, 'POST', '/v1/invites/nope/accept')).statusCode, 400);
    assert.equal((await app.inject({ url: '/v1/invites/ZZZZZZZZ' })).statusCode, 404);

    await http(a, 'PUT', `/v1/blocks/${b.id}`);
    assert.equal((await http(b, 'POST', `/v1/invites/${code}/accept`)).json().status, 'sent', "a block isn't revealed");
    assert.deepEqual((await http(b, 'GET', '/v1/friends')).json<FriendsResponse>().friends, []);

    await http(c, 'POST', '/v1/friends/requests', { playerId: a.id });
    assert.equal((await http(c, 'POST', `/v1/invites/${code}/accept`)).json().status, 'friends');
    assert.deepEqual((await http(a, 'GET', '/v1/friends')).json<FriendsResponse>().incoming, []);
  });

  it('needs Versus on to accept, but the page and the lookup always work', async () => {
    const [a, b] = [await newPlayer('Roda'), await newPlayer('Bo')];
    const { code } = (await http(a, 'POST', '/v1/invites')).json<InviteResponse>();
    app.hub.setStatus({ enabled: false, message: null });
    assert.equal((await http(b, 'POST', `/v1/invites/${code}/accept`)).statusCode, 503);
    assert.equal((await app.inject({ url: `/v1/invites/${code}` })).statusCode, 200);
    assert.equal((await app.inject({ url: `/i/${code.toLowerCase()}` })).statusCode, 200);
  });

  it("serves the page with the inviter's name (escaped), the stores with the code, and the app link files", async () => {
    const a = await newPlayer('Bo');
    await db.query("UPDATE players SET name = 'Bo<b>' WHERE id = $1", [a.id]); // past the name filter, as if it missed something
    const { code } = (await http(a, 'POST', '/v1/invites')).json<InviteResponse>();
    const page = await app.inject({ url: `/i/${code}`, headers: { host: 'hanged.example' } });
    assert.equal(page.statusCode, 200);
    assert.match(page.headers['content-type'] as string, /text\/html/);
    assert.ok(!page.body.includes('Bo<b>') && page.body.includes('Bo&#60;b&#62; invited you!'));
    assert.ok(page.body.includes(`referrer=${encodeURIComponent(`invite=${code}`)}`), 'Play keeps the code for the first launch');
    assert.ok(page.body.includes('https://apps.apple.com/app/id123456789'));
    assert.ok(page.body.includes(`data-link="http://hanged.example/i/${code}"`), 'the link iOS copies');
    assert.equal((await app.inject({ url: '/i/ZZZZZZZZ' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/i/<script>' })).statusCode, 404);

    const aasa = (await app.inject({ url: '/.well-known/apple-app-site-association' })).json();
    assert.deepEqual(aasa.applinks.details[0].appIDs, ['TEAM123456.com.example.hanged']);
    assert.deepEqual(aasa.applinks.details[0].components, [{ '/': '/i/*' }]);
    const assets = (await app.inject({ url: '/.well-known/assetlinks.json' })).json();
    assert.equal(assets[0].target.package_name, 'com.example.hanged');
  });
});

describe('lobbies and invites', () => {
  it('invites a friend, who can decline or accept; the host starts; the lobby comes back for a rematch', async () => {
    const [a, b, c] = [await newPlayer('Ada'), await newPlayer('Bo'), await newPlayer('Cy')];
    await http(a, 'POST', '/v1/friends/requests', { playerId: b.id });
    await http(b, 'POST', `/v1/friends/requests/${a.id}/accept`);
    const [la, lb, lc] = [await live(a), await live(b), await live(c)];
    for (const l of [la, lb, lc]) await l.next('hello');

    la.send({ t: 'host', mode: 'duel', language: 'en' });
    const { lobby } = await la.next('lobby');
    assert.equal(lobby.code.length, VERSUS_LIMITS.codeLength);

    la.send({ t: 'invite', id: c.id });
    assert.equal((await la.next('error')).code, 'notFriend');
    la.send({ t: 'invite', id: b.id });
    const { invite } = await lb.next('invite');
    assert.equal(invite.from.name, 'Ada');
    lb.send({ t: 'answer', lobbyId: invite.lobbyId, accept: false });
    assert.equal((await la.next('declined')).by.id, b.id);

    la.send({ t: 'invite', id: b.id });
    lb.send({ t: 'answer', lobbyId: (await lb.next('invite')).invite.lobbyId, accept: true });
    await la.next('lobby', (m) => m.lobby.members.length === 2);
    // Full: a third can't join a duel by its code
    lc.send({ t: 'join', code: lobby.code.toLowerCase() });
    assert.equal((await lc.next('error')).code, 'full');

    la.send({ t: 'start' });
    assert.equal((await la.next('error')).code, 'notReady');
    lb.send({ t: 'ready', ready: true });
    await la.next('lobby', (m) => m.lobby.members.every((x) => x.ready));
    la.send({ t: 'start' });
    const { match } = await lb.next('match');
    assert.equal(match.ranked, false, 'friend matches never move ratings');

    lb.send({ t: 'forfeit' });
    const { result } = await la.next('end');
    assert.equal(result.standings[0].id, a.id);
    assert.equal((await lb.next('lobbyGone')).reason, 'left');
    const back = await la.next('lobby', (m) => !m.lobby.playing);
    assert.deepEqual(back.lobby.members.map((m) => m.id), [a.id]);
  });
});

describe('the switch', () => {
  it('turned off from the admin page, nothing new starts and idle sockets close; the page needs its token', async () => {
    const a = await newPlayer('Ada');
    const la = await live(a);
    await la.next('hello');
    assert.equal((await app.inject({ url: '/admin' })).statusCode, 200);
    assert.equal((await app.inject({ url: '/admin/api/versus', headers: { authorization: 'Bearer nope' } })).statusCode, 401);

    const off = await app.inject({
      method: 'PUT',
      url: '/admin/api/versus',
      headers: { authorization: `Bearer ${ADMIN}` },
      payload: { enabled: false, message: ' Back soon ' },
    });
    assert.deepEqual(off.json().status, { enabled: false, message: 'Back soon' });
    assert.deepEqual((await la.next('status')).status, { enabled: false, message: 'Back soon' });
    assert.equal((await la.next('bye')).reason, 'disabled');
    assert.deepEqual((await app.inject({ url: '/v1/versus/status' })).json(), { enabled: false, message: 'Back soon' });
    assert.equal((await http(a, 'GET', '/v1/friends')).statusCode, 503);
    const again = await live(a);
    assert.equal((await again.next('hello')).status.enabled, false);
    assert.equal((await again.next('bye')).reason, 'disabled');

    await app.inject({ method: 'PUT', url: '/admin/api/versus', headers: { authorization: `Bearer ${ADMIN}` }, payload: { enabled: true, message: null } });
    assert.equal((await http(a, 'GET', '/v1/friends')).statusCode, 200);
  });
});

describe('developer accounts', () => {
  it("a matchmade match with a developer moves nobody's rating, even when the role came while connected", async () => {
    const [a, b] = [await newPlayer('Ada'), await newPlayer('Bo')];
    const [la, lb] = [await live(a), await live(b)];
    await la.next('hello');
    await lb.next('hello');
    const grant = await app.inject({ method: 'PUT', url: `/admin/api/staff/${a.id}`, headers: { authorization: `Bearer ${ADMIN}` }, payload: { role: 'admin' } });
    assert.equal(grant.statusCode, 200);
    la.send({ t: 'queue', mode: 'rush', language: 'en' });
    lb.send({ t: 'queue', mode: 'rush', language: 'en' });
    await la.next('queued');
    await lb.next('queued');
    clock.advance(FILL_WAIT_MS);
    app.hub.tick();
    assert.equal((await lb.next('match')).match.ranked, false);
  });
});

describe('words', () => {
  it('ships an up-to-date copy of data/ (run npm run build:server-words at the repo root after changing the packs)', async () => {
    const packs = ['words.json', 'words/fr.json', 'words/es.json', 'words/de.json'];
    const entries = (await Promise.all(packs.map(async (f) => JSON.parse(await readFile(new URL(`../../data/${f}`, import.meta.url), 'utf8'))))).flat();
    const shipped = await readFile(WORDS_BUNDLE);
    assert.ok(toBundle(entries).equals(shipped), 'server/data/words.json.gz is out of date');
    assert.equal(fromBundle(shipped).length, entries.length);
  });

  it('seeds the table at start only when the list changed, and drops words taken out of it', async () => {
    await db.exec('TRUNCATE words');
    await db.query(`INSERT INTO words (id, word, language) VALUES ('en-zzgone', 'zzgone', 'en')`);
    const count = await syncWords(db);
    assert.ok(count && count > 30_000);
    assert.equal(await syncWords(db), null, 'unchanged: nothing to do');
    const { rows } = await db.query(`SELECT id FROM words WHERE id = 'en-zzgone'`);
    assert.deepEqual(rows, []);
    const { rows: described } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM words WHERE description IS NULL');
    assert.equal(described[0].n, 0);
  });

  it('deals everyday words from the seeded table and finds a typed word of the whole pack', async () => {
    await seedWords(db);
    const words = await loadWords(db);
    assert.ok(['en', 'fr', 'es', 'de'].every((l) => words.has(l) && words.sizes()[l] > 500));
    const dealt = words.deal('en', 5, seeded());
    assert.equal(new Set(dealt.map((w) => w.id)).size, 5);
    assert.ok(dealt.every((w) => w.description && w.word.length >= 5 && w.word.length <= 10));
    assert.equal((await words.find('en', 'CASTLE'))?.word, 'castle');
    assert.equal(await words.find('en', 'qwzzx'), null);
    assert.equal(await words.find('en', 'cat'), null, 'too short to pick');
  });
});
