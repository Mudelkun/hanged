/*
 * The admin page: Versus's on/off switch and how it's doing. Served by the
 * server itself at /admin, so there's nothing else to host. It exists only
 * when ADMIN_TOKEN is set (24+ characters): the page asks for the token and
 * sends it as a Bearer header; the API compares it in constant time, and
 * tries are rate limited.
 *   GET /admin               the page
 *   GET /admin/api/versus    switch, live counts, last 7 days, most reported players
 *   PUT /admin/api/versus    { enabled, message, endMatches } → the same
 * VERSUS_DISABLED=1 forces Versus off whatever the switch says (the page shows it).
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { Db } from './db.ts';
import type { VersusStatus } from './versus-contract.ts';
import type { Hub } from './versus/hub.ts';
import { adminTotals, writeSwitch } from './versus/store.ts';

const digest = (s: string) => createHash('sha256').update(s).digest();

export function adminRoutes(app: FastifyInstance, db: Db, hub: Hub, opts: { token?: string; forcedOff: boolean }) {
  const { token, forcedOff } = opts;
  if (!token || token.length < 24) return;
  const expected = digest(`Bearer ${token}`);
  const allowed = (req: FastifyRequest) => timingSafeEqual(digest(req.headers.authorization ?? ''), expected);
  const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  const state = async () => ({ status: hub.status, forcedOff, counts: hub.counts(), ...(await adminTotals(db)) });

  app.get('/admin', limit, async (_req, reply) =>
    reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('x-frame-options', 'DENY')
      .header('content-security-policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'")
      .send(PAGE),
  );

  app.get('/admin/api/versus', limit, async (req, reply) => (allowed(req) ? state() : reply.code(401).send({ error: 'token' })));

  app.put<{ Body: { enabled: boolean; message: string | null; endMatches?: boolean } }>(
    '/admin/api/versus',
    {
      ...limit,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['enabled', 'message'],
          properties: {
            enabled: { type: 'boolean' },
            message: { type: ['string', 'null'], maxLength: 200 },
            endMatches: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!allowed(req)) return reply.code(401).send({ error: 'token' });
      const message = req.body.message?.trim() || null;
      const status: VersusStatus = { enabled: req.body.enabled, message };
      await writeSwitch(db, status);
      if (!forcedOff) hub.setStatus(status, !status.enabled && !!req.body.endMatches);
      return state();
    },
  );
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hanged admin</title>
<style>
  :root { --paper:#fffaf1; --ink:#4b3a35; --muted:#a8948a; --line:#f3e6d6; --coral:#ff7b6b; --coralD:#e85c4d; --mint:#5fd3a5; --mintD:#2a9a6e; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.45 system-ui, -apple-system, Segoe UI, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 15px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 28px 0 8px; }
  .card { background: #fff; border: 2px solid var(--line); border-radius: 18px; padding: 16px; }
  .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .big { font-size: 22px; font-weight: 700; }
  .on { color: var(--mintD); } .off { color: var(--coralD); }
  button { font: inherit; font-weight: 700; border: 0; border-radius: 14px; padding: 12px 18px; cursor: pointer; color: #fff; background: var(--coral); }
  button.go { background: var(--mint); }
  button:disabled { opacity: .5; cursor: default; }
  input[type=text], input[type=password] { font: inherit; width: 100%; padding: 10px 12px; border: 2px solid var(--line); border-radius: 12px; background: #fff; color: var(--ink); }
  label { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
  .stat { background: #fff; border: 2px solid var(--line); border-radius: 14px; padding: 10px 12px; }
  .stat b { display: block; font-size: 24px; }
  .stat span { color: var(--muted); font-size: 13px; }
  .stat.empty { border-color: var(--coral); } .stat.empty b { color: var(--coralD); }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; }
  td, th { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); font-size: 14px; }
  th { color: var(--muted); font-weight: 600; }
  .note { color: var(--muted); font-size: 14px; }
  .warn { color: var(--coralD); font-weight: 600; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <h1>Hanged · Versus</h1>
  <p class="note">The switch for online multiplayer. Off stops matchmaking, lobbies and invites at once. The solo game is never affected.</p>

  <section id="login" class="card">
    <p>Admin token (ADMIN_TOKEN on the server):</p>
    <div class="row"><input id="token" type="password" autocomplete="current-password"><button id="enter">Open</button></div>
    <p id="loginError" class="warn" hidden>That token didn't work.</p>
  </section>

  <section id="panel" hidden>
    <h2>Switch</h2>
    <div class="card">
      <div class="row"><span class="big">Versus is <span id="state">…</span></span></div>
      <p id="forced" class="warn" hidden>VERSUS_DISABLED is set on the server: Versus stays off whatever the switch says.</p>
      <label for="message">Message players see while it's off (optional, one language):</label>
      <input id="message" type="text" maxlength="200" placeholder="Back soon! We're making Versus even better.">
      <label><input id="endMatches" type="checkbox"> Also stop running matches now (they count for nothing)</label>
      <div class="row" style="margin-top:14px"><button id="toggle">…</button><button id="save" class="go">Save message</button></div>
    </div>

    <h2>Right now</h2>
    <div class="stats" id="counts"></div>

    <h2>Last 7 days</h2>
    <table><thead><tr><th>Day</th><th>Mode</th><th>Matches</th><th>Players</th><th>Forfeits</th></tr></thead><tbody id="days"></tbody></table>

    <h2>Most reported players</h2>
    <table><thead><tr><th>Name</th><th>Id</th><th>Reports</th></tr></thead><tbody id="reported"></tbody></table>
  </section>
</main>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  let token = sessionStorage.getItem('adminToken') || '';
  let current = null;

  async function api(method, body) {
    const res = await fetch('/admin/api/versus', {
      method,
      headers: { authorization: 'Bearer ' + token, ...(body && { 'content-type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    if (res.status === 401) throw new Error('token');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function cell(row, text) { const td = document.createElement('td'); td.textContent = String(text); row.appendChild(td); }
  function rows(tbody, items, cols) {
    tbody.replaceChildren(...items.map((item) => { const tr = document.createElement('tr'); cols.forEach((c) => cell(tr, item[c] ?? '—')); return tr; }));
  }

  function render(s) {
    current = s;
    const on = s.status.enabled && !s.forcedOff;
    $('state').textContent = on ? 'ON' : 'OFF';
    $('state').className = on ? 'on' : 'off';
    $('toggle').textContent = s.status.enabled ? 'Turn Versus off' : 'Turn Versus on';
    $('toggle').className = s.status.enabled ? '' : 'go';
    $('forced').hidden = !s.forcedOff;
    if (document.activeElement !== $('message')) $('message').value = s.status.message || '';
    const c = s.counts;
    const stats = [['Online', c.online], ['In matches', c.inMatches], ['Matches', c.matches], ['Queued', c.queued], ['Lobbies', c.lobbies]];
    const words = ['en', 'fr', 'es', 'de'].map((l) => ['Words · ' + l, (c.words || {})[l] || 0]);
    $('counts').replaceChildren(...stats.concat(words).map(([label, n]) => { const d = document.createElement('div'); d.className = 'stat' + (String(label).startsWith('Words') && !n ? ' empty' : ''); const b = document.createElement('b'); b.textContent = n; const sp = document.createElement('span'); sp.textContent = label; d.append(b, sp); return d; }));
    rows($('days'), s.days, ['day', 'mode', 'matches', 'players', 'forfeits']);
    rows($('reported'), s.reported, ['name', 'id', 'reports']);
  }

  async function load() {
    try {
      render(await api('GET'));
      $('login').hidden = true; $('panel').hidden = false; $('loginError').hidden = true;
    } catch (e) {
      $('login').hidden = false; $('panel').hidden = true; $('loginError').hidden = !token;
    }
  }

  async function put(enabled) {
    if (!enabled && !confirm('Turn Versus off for everyone?' + ($('endMatches').checked ? ' Running matches will stop.' : ''))) return;
    $('toggle').disabled = $('save').disabled = true;
    try { render(await api('PUT', { enabled, message: $('message').value, endMatches: $('endMatches').checked })); }
    catch (e) { alert('Not saved: ' + e.message); }
    finally { $('toggle').disabled = $('save').disabled = false; }
  }

  $('enter').onclick = () => { token = $('token').value.trim(); sessionStorage.setItem('adminToken', token); load(); };
  $('token').onkeydown = (e) => { if (e.key === 'Enter') $('enter').click(); };
  $('toggle').onclick = () => current && put(!current.status.enabled);
  $('save').onclick = () => current && put(current.status.enabled);
  load();
  setInterval(() => { if (!$('panel').hidden) api('GET').then(render).catch(() => {}); }, 5000);
})();
</script>
</body>
</html>
`;
