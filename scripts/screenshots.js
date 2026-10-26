// Screenshots of every screen at every device size, for checking the layout by eye
// (Context/dev-setup.md, Screenshots of every screen).
//
// Needs: the local server (cd server && npm run dev, PORT=3010) and the Expo web server pointed at it
// (EXPO_PUBLIC_API_URL=http://localhost:3010 npx expo start --web --port 8090). Never point it at
// Railway: it creates players and plays Versus matches.
//
// Usage: node scripts/screenshots.js [--out screenshots] [--app http://localhost:8090]
//        [--api http://localhost:3010] [--devices ipad,se] [--screens play,result] [--lang de]
// Writes <out>/<device>/<NN-screen>.png, and <out>/index.html showing them side by side.
const { Buffer } = require('node:buffer');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)]);
  return acc;
}, []));
const APP = args.app ?? 'http://localhost:8090';
const API = args.api ?? 'http://localhost:3010';
const OUT = path.resolve(args.out ?? 'screenshots');
const LANG = args.lang ?? 'en';
const only = (list, value) => !list || list.split(',').some((part) => value.includes(part));

const APP_NAME = require(`../src/i18n/${LANG}.json`)['app.name'];
const GAME_KEY = 'hanged.game.v1';
const ACCOUNT_KEY = 'hanged.account.v1';
const VERSUS_KEY = 'hanged.versus.v1';

/**
 * Portrait sizes in points, with each device's safe area (status bar or notch, home indicator).
 * The smallest phones first, the biggest tablets last.
 */
const DEVICES = [
  { id: '01-smallest-320x568', label: 'Smallest phone, 320×568 (iPhone SE 1st gen, small Android)', w: 320, h: 568, top: 20, bottom: 0 },
  { id: '02-iphone-se-375x667', label: 'iPhone SE 2nd/3rd gen, 375×667', w: 375, h: 667, top: 20, bottom: 0 },
  { id: '03-galaxy-fold-cover-344x882', label: 'Galaxy Z Fold cover screen, 344×882', w: 344, h: 882, top: 28, bottom: 16 },
  { id: '04-android-360x800', label: 'Android phone, 360×800', w: 360, h: 800, top: 28, bottom: 16 },
  { id: '05-iphone-mini-375x812', label: 'iPhone 13 mini, 375×812', w: 375, h: 812, top: 50, bottom: 34 },
  { id: '06-iphone-16-393x852', label: 'iPhone 16, 393×852', w: 393, h: 852, top: 59, bottom: 34 },
  { id: '07-iphone-16-pro-max-440x956', label: 'iPhone 16 Pro Max, 440×956', w: 440, h: 956, top: 62, bottom: 34 },
  { id: '08-surface-duo-540x720', label: 'Surface Duo (one screen), 540×720', w: 540, h: 720, top: 24, bottom: 0 },
  { id: '09-ipad-mini-744x1133', label: 'iPad mini, 744×1133', w: 744, h: 1133, top: 24, bottom: 20 },
  { id: '10-ipad-air-820x1180', label: 'iPad Air 11", 820×1180', w: 820, h: 1180, top: 24, bottom: 20 },
  { id: '11-ipad-pro-13-1032x1376', label: 'iPad Pro 13", 1032×1376', w: 1032, h: 1376, top: 24, bottom: 20 },
].filter((d) => only(args.devices, d.id));

// ---- Chrome over the DevTools protocol ----

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const found = candidates.find((c) => c && fs.existsSync(c));
  if (!found) throw new Error('Chrome not found: set CHROME to its path');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchChrome() {
  const port = 9300 + Math.floor(Math.random() * 500);
  // An absolute profile dir: with a relative one, the debugging port never opens (dev-setup.md).
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hanged-shots-'));
  const proc = spawn(findChrome(), [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      return { proc, profile, ws: v.webSocketDebuggerUrl };
    } catch { await sleep(100); }
  }
  throw new Error('Chrome did not open its debugging port');
}

class Cdp {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.ws = new WebSocket(url);
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result);
      } else for (const l of this.listeners) l(msg);
    };
    this.open = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }
}

/** One tab in its own browser context (its own storage), sized like `device`. */
async function openPage(cdp, device) {
  const { browserContextId } = await cdp.send('Target.createBrowserContext');
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  const errors = [];
  cdp.listeners.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    // React's warnings (a text node in a View crashes iOS) and failed requests
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const where = (msg.params.stackTrace?.callFrames ?? []).slice(0, 12).map((f) => f.functionName).filter(Boolean).join(' < ');
      errors.push(`${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 600)}${where ? `\n      at ${where}` : ''}`);
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: device.w, height: device.h, deviceScaleFactor: device.dpr ?? 2, mobile: true,
    screenWidth: device.w, screenHeight: device.h,
  });
  // The notch and home indicator, as CSS env(safe-area-inset-*): react-native-safe-area-context reads them.
  await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: device.top, bottom: device.bottom, left: 0, right: 0 } })
    .catch(() => console.warn('This Chrome cannot emulate safe areas: insets will be 0'));
  // One known web-only warning stays out of the dev overlay's red toast (it would sit in the screenshots):
  // React Native's createAnimatedComponent sets collapsable={false} on react-native-svg's animated <path>
  // (the level-up road), which the DOM takes for an attribute. Production builds show no dev toast at all.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    // The overlay keeps what it reads as the "original" console.error and calls it back: past the first
    // call, go straight to the browser's, or the two would call each other forever.
    source: `(() => { const known = (args) => args.includes('collapsable') && String(args[0]).includes('non-boolean attribute');
      const browser = console.error.bind(console);
      let current = browser, depth = 0;
      const filtered = (...args) => {
        if (known(args)) return;
        if (depth) return browser(...args);
        depth++;
        try { return current(...args); } finally { depth--; }
      };
      Object.defineProperty(console, 'error', { configurable: true, get: () => filtered, set: (f) => { current = f; } }); })();`,
  });
  // env() only reports insets with viewport-fit=cover, as on an iPhone with the app full screen.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `new MutationObserver((_, o) => { const m = document.querySelector('meta[name=viewport]');
      if (m) { m.content = 'width=device-width, initial-scale=1, viewport-fit=cover'; o.disconnect(); } })
      .observe(document, { childList: true, subtree: true });`,
  });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expression, what, timeout = 20000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await evaluate(expression).catch(() => false)) return;
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${what}`);
  };
  /** The element whose aria-label is `label`, or whose own text is `text` (the deepest match; the last one unless `nth`). */
  const finder = ({ label, text, contains, nth }) => `(() => {
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    let els = ${label ? `[...document.querySelectorAll('[aria-label]')].filter((e) => e.getAttribute('aria-label') === ${JSON.stringify(label)})`
      : `[...document.querySelectorAll('div,span,button,a')].filter((e) => {
          const t = (e.innerText || '').trim();
          return ${contains ? `t.includes(${JSON.stringify(contains)})` : `t === ${JSON.stringify(text)}`}; })`};
    els = els.filter(visible);
    const deepest = els.filter((e) => !els.some((o) => o !== e && e.contains(o)));
    return deepest[${nth === undefined ? 'deepest.length - 1' : nth}] || null;
  })()`;
  const exists = (q) => evaluate(`!!${finder(q)}`);
  const tap = async (q, { wait = 300 } = {}) => {
    await waitFor(`!!${finder(q)}`, JSON.stringify(q));
    const box = await evaluate(`(() => { const e = ${finder(q)}; e.scrollIntoView({ block: 'center', inline: 'center' });
      const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: 'mouse' });
      if (type === 'mousePressed') await sleep(40);
    }
    await sleep(wait);
  };
  const typeText = (text) => send('Input.insertText', { text });
  const goto = async (route, ready) => {
    await send('Page.navigate', { url: APP + route });
    await waitFor(ready ?? 'document.readyState === "complete" && !!document.querySelector("#root > *")', `load ${route}`, 60000);
  };
  // The loading screen (LaunchScreen) covers the app on every load; a tap skips it.
  const LAUNCH = `[...document.querySelectorAll('[role=button][aria-label]')].find((e) => e.getAttribute('aria-label') === ${JSON.stringify(APP_NAME)})`;
  const skipLaunch = async () => {
    await waitFor(`!!${LAUNCH}`, 'loading screen', 30000).catch(() => {});
    for (let i = 0; i < 40 && await evaluate(`!!${LAUNCH}`); i++) {
      await tap({ label: APP_NAME }, { wait: 250 }).catch(() => {});
    }
    await waitFor(`!${LAUNCH}`, 'loading screen to close', 15000);
  };
  /** Load `route` with these saved values in storage, set before any app code runs. Past the loading screen unless `launch`. */
  const load = async (route, storage, ready, { launch = false } = {}) => {
    const source = Object.entries(storage).map(([k, v]) => v === null
      ? `localStorage.removeItem(${JSON.stringify(k)});`
      : `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(typeof v === 'string' ? v : JSON.stringify(v))});`).join('');
    const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `if (location.origin === ${JSON.stringify(new URL(APP).origin)}) { ${source} }` });
    await goto(route, launch ? undefined : ready);
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    if (!launch) await skipLaunch();
  };
  const storage = (key) => evaluate(`localStorage.getItem(${JSON.stringify(key)})`).then((v) => (v ? JSON.parse(v) : null));
  const shot = async (file) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  };
  const close = () => cdp.send('Target.disposeBrowserContext', { browserContextId });
  return { send, evaluate, waitFor, exists, tap, typeText, goto, load, skipLaunch, storage, shot, close, errors };
}

// ---- the local server: players for the board, accounts reused across devices ----

/** The server allows a few new players per address an hour: each seeded player comes from its own. */
async function api(route, { body, auth, ip, method } = {}) {
  const res = await fetch(API + route, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(auth && { authorization: `Bearer ${auth.id}:${auth.secret}` }), ...(ip && { 'x-forwarded-for': ip }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const WORDS = require('../data/words.json').filter((w) => w.language === LANG || (LANG !== 'en' && w.language === 'en'));
const wordIds = WORDS.filter((w) => w.word.length <= 6).map((w) => w.id);

async function seedBoard() {
  const board = await api('/v1/leaderboard?period=all');
  if ((board.rows ?? board.entries ?? []).length >= 12) return;
  const players = [
    ['Maximilian_Rex', 'rexy', 412, 18], ['SunnyOtter', 'mochi', 377, 17], ['Biscuit Queen', 'biscuit', 301, 15],
    ['Léa', 'lolo', 268, 14], ['ZoomZoom', 'ember', 240, 13], ['Kai', 'koa', 205, 12], ['Penelope99', 'pip', 188, 11],
    ['WordWizard', 'sage', 160, 10], ['Ana', 'bun', 133, 9], ['Rocco', 'rocco', 97, 8], ['MidnightMoth', 'vesper', 64, 6],
    ['Tom', 'coco', 31, 4], ['Ribbit Fan', 'ribbit', 12, 2],
  ];
  for (const [i, [name, characterId, wins, level]] of players.entries()) {
    const ip = `10.77.${i}.1`;
    const who = await api('/v1/players', { body: {}, ip });
    const at = Date.now() - 86400000;
    for (let seq = 1; seq <= wins; seq += 200) {
      const reports = [];
      for (let s = seq; s < Math.min(seq + 200, wins + 1); s++) {
        reports.push({ seq: s, wordId: wordIds[s % wordIds.length], level: Math.min(level, 1 + Math.floor(s / 10)), won: true, wrong: s % 4, tokens: 3, description: true, letters: false, at: at + s * 1000 });
      }
      await api('/v1/sync', { auth: who, ip, body: { player: { name, characterId, language: 'en', wordsGuessed: wins, level, tokens: wins * 2, }, reports } });
    }
  }
}

// ---- game states ----

const letters = (word) => [...new Set(word.toLowerCase())];
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');
const pickWord = (test) => WORDS.find(test) ?? WORDS[0];
// The worst cases for the layout: the longest word with a long description, and a short easy one.
const LONG = [...WORDS].filter((w) => w.word.length === 15).sort((a, b) => b.description.length - a.description.length)[0];
const TWELVE = [...WORDS].filter((w) => w.word.length === 12 && w.subject).sort((a, b) => b.description.length - a.description.length)[0];
const SHORT = pickWord((w) => w.word === 'cat');

/** A round of `entry` at `level`: `found` of its letters guessed (after the clues), `misses` wrong ones. */
function round(entry, { level, clues = 1, found = 0, misses = 0, disabled = 0, bought = [], id = 'shot-' + entry.word }) {
  const ls = letters(entry.word);
  const clueLetters = ls.slice(0, clues);
  const rest = ls.filter((l) => !clueLetters.includes(l) && !bought.includes(l));
  const wrong = ALPHA.filter((l) => !ls.includes(l));
  const guessed = [...rest.slice(0, found), ...wrong.slice(0, misses)];
  return {
    id, wordId: entry.id, word: entry.word, language: entry.language, description: entry.description,
    ...(level >= 9 && entry.subject && { subject: entry.subject }),
    level, maxWrong: 10, clueLetters, disabledLetters: wrong.slice(misses, misses + disabled), boughtLetters: bought, guessed,
  };
}
/** The letters still to find in a round. */
const missing = (r) => letters(r.word).filter((l) => ![...r.clueLetters, ...r.boughtLetters, ...r.guessed].includes(l));

function withRound(base, r, extra = {}) {
  return {
    ...base, round: r, tokens: 240, wordsGuessed: 187, streak: 0, lastTokensEarned: 0,
    levelProgress: { level: r.level, wins: 4, rounds: 6, losses: 0 }, bestLevel: Math.max(base.bestLevel ?? 1, r.level),
    unlockedCharacterIds: ['ember', 'ribbit', 'lolo'], characterId: 'mochi', reminders: false,
    daily: { days: 6, lastDay: today() }, ...extra,
  };
}
const today = () => new Date().toISOString().slice(0, 10);

// ---- the screens ----

/**
 * Each scenario reaches its screens and calls shot(name). `ctx.base` is a finished onboarding's
 * save (filled in by the first scenario), reused by the others with a different round or level.
 */
const SCENARIOS = [
  {
    id: 'onboarding',
    async run({ page, shot, ctx, account }) {
      await page.load('/', { [GAME_KEY]: null, [ACCOUNT_KEY]: account, [VERSUS_KEY]: '1' }, null, { launch: true });
      await sleep(1600);
      await shot('01-launch-screen');
      await page.skipLaunch();
      await sleep(600);
      await shot('02-onboarding-language');
      await page.tap({ text: 'Continue' }, { wait: 1800 });
      await shot('03-onboarding-buddy');
      await page.tap({ contains: 'go,' }, { wait: 1500 });
      await shot('04-onboarding-name');
      await page.tap({ label: 'I accept the Terms of use and the Privacy policy.' }, { wait: 400 });
      await page.tap({ text: 'Terms of use' }, { wait: 900 });
      await shot('05-onboarding-terms-sheet');
      await page.tap({ text: 'Got it' }, { wait: 700 });
      await page.tap({ contains: 'play!' }, { wait: 700 });
      await shot('06-onboarding-lift-off');
      await page.waitFor('document.body.innerText.includes("first word is ready")', 'welcome toast', 15000).catch(() => {});
      await sleep(300);
      await shot('07-play-welcome-toast');
      await sleep(2500);
      ctx.base = await page.storage(GAME_KEY);
    },
  },
  {
    id: 'play',
    async run({ page, shot, ctx, account }) {
      const at = (r, extra) => page.load('/', { [GAME_KEY]: withRound(ctx.base, r, extra), [ACCOUNT_KEY]: account, [VERSUS_KEY]: '1' }, 'document.querySelectorAll("[aria-label^=\\"Letter \\"]").length >= 20');
      await at(round(SHORT, { level: 1, clues: 1, found: 0, misses: 1, disabled: 6 }), { levelProgress: { level: 1, wins: 2, rounds: 3, losses: 0 } });
      await sleep(1600);
      await shot('08-play-level1-short-word');
      await at(round(LONG, { level: 12, clues: 3, found: 2, misses: 4 }));
      await sleep(1600);
      await shot('09-play-level12-15-letters');
      await at(round(TWELVE, { level: 9, clues: 2, found: 1, misses: 7 }));
      await sleep(1600);
      await shot('10-play-level9-letter-shop');
      // Long names in the header, the worst case for the name's room
      await at(round(SHORT, { level: 20, clues: 1, found: 0, misses: 9 }), { playerName: 'WWWWWWWWWWWWWWW', tokens: 12345, bestLevel: 20, levelProgress: { level: 20, wins: 33, rounds: 40, losses: 0 } });
      await sleep(1600);
      await shot('11-play-level20-long-name-9-misses');
      await page.tap({ label: 'Level 20. Show the level path' }, { wait: 2200 });
      await shot('12-level-map-top-level');
      await at(round(TWELVE, { level: 8, clues: 2, found: 2, misses: 2 }), { bestLevel: 8 });
      await sleep(1000);
      await page.tap({ label: 'Level 8. Show the level path' }, { wait: 2200 });
      await shot('13-level-map-level8');
    },
  },
  {
    id: 'result',
    async run({ page, shot, ctx, account }) {
      const at = (r, extra) => page.load('/', { [GAME_KEY]: withRound(ctx.base, r, extra), [ACCOUNT_KEY]: account, [VERSUS_KEY]: '1' }, 'document.body.innerText.includes("Next word")');
      // Restored finished rounds open on their result. The worst case: a 15-letter word, a level line, the daily line and the badge.
      const won = round(LONG, { level: 11, clues: 3, found: 99, misses: 3 });
      await at(won, { levelProgress: { level: 12, wins: 0, rounds: 0, losses: 0 }, lastTokensEarned: 7, streak: 4, dailyCountedBy: won.id });
      await sleep(1800);
      await shot('14-result-won-long-word');
      await at(round(SHORT, { level: 2, clues: 1, found: 0, misses: 10 }));
      await sleep(1800);
      await shot('15-result-lost');
    },
  },
  {
    id: 'live',
    async run({ page, shot, ctx, account }) {
      const ready = 'document.querySelectorAll("[aria-label^=\\"Letter \\"]").length >= 20';
      // A win that makes a streak of 3: the streak takeover
      let r = round(TWELVE, { level: 6, clues: 2, found: 99, misses: 2 });
      let last = r.guessed.filter((l) => r.word.includes(l)).pop();
      r.guessed = r.guessed.filter((l) => l !== last);
      await page.load('/', { [GAME_KEY]: withRound(ctx.base, r, { streak: 2 }), [ACCOUNT_KEY]: account, [VERSUS_KEY]: '1' }, ready);
      await sleep(900);
      // While the meter fills: a moment later the reward's chip flies out over the count
      await page.tap({ label: `Letter ${last.toUpperCase()}` }, { wait: 1750 });
      await shot('16-streak-takeover');
      // A win that completes the level: the level-up card over the result
      r = round(SHORT, { level: 3, clues: 1, found: 99, misses: 1, id: 'shot-levelup' });
      last = missing({ ...r, guessed: [] }).pop();
      r.guessed = r.guessed.filter((l) => l !== last);
      await page.load('/', { [GAME_KEY]: withRound(ctx.base, r, { levelProgress: { level: 3, wins: 9, rounds: 12, losses: 0 }, bestLevel: 3 }), [ACCOUNT_KEY]: account, [VERSUS_KEY]: '1' }, ready);
      await sleep(900);
      await page.tap({ label: `Letter ${last.toUpperCase()}` }, { wait: 1300 });
      await page.waitFor('document.body.innerText.includes("Level up!")', 'level card', 8000);
      await sleep(2300);
      await shot('17-level-up-card');
    },
  },
  {
    id: 'tabs',
    async run({ page, shot, ctx, account }) {
      const state = withRound(ctx.base, round(SHORT, { level: 6, clues: 1 }));
      const at = (route, ready) => page.load(route, { [GAME_KEY]: state, [ACCOUNT_KEY]: account, [VERSUS_KEY]: '1' }, ready);
      await at('/leaderboard', 'document.body.innerText.includes("All time")');
      await page.waitFor('document.body.innerText.includes("Maximilian")', 'board rows', 15000).catch(() => {});
      await sleep(1200);
      await shot('18-leaderboard');
      await page.tap({ text: 'All time' }, { wait: 1500 });
      await shot('19-leaderboard-all-time');
      await at('/characters', 'document.querySelectorAll("svg").length > 5');
      await sleep(1500);
      await shot('20-characters');
      await page.tap({ label: 'Next character' }, { wait: 900 }).catch(() => {});
      await page.tap({ label: 'Next character' }, { wait: 1200 }).catch(() => {});
      await shot('21-characters-locked');
      await at('/profile', 'document.body.innerText.includes("Delete account")');
      await sleep(1200);
      await shot('22-profile');
      await page.evaluate('document.querySelectorAll("div").forEach((d) => { if (d.scrollHeight > d.clientHeight + 20 && getComputedStyle(d).overflowY !== "visible") d.scrollTop = d.scrollHeight; })');
      await sleep(600);
      await shot('23-profile-scrolled');
      await page.tap({ text: 'Delete account' }, { wait: 900 });
      await shot('24-profile-delete-sheet');
      for (const [n, info] of [['25', 'rules'], ['26', 'privacy'], ['27', 'terms'], ['28', 'support'], ['29', 'credits']]) {
        await at(`/info/${info}`, 'document.body.innerText.length > 200');
        await sleep(900);
        await shot(`${n}-info-${info}`);
      }
    },
  },
  {
    id: 'versus',
    async run({ page, shot, ctx, account, opponent, cdp, device }) {
      const state = withRound(ctx.base, round(SHORT, { level: 6, clues: 1 }));
      const at = (route, ready) => page.load(route, { [GAME_KEY]: state, [ACCOUNT_KEY]: account, [VERSUS_KEY]: '1' }, ready);
      await at('/versus', 'document.body.innerText.includes("Quick match")');
      await sleep(1500);
      await shot('30-versus');
      await page.tap({ contains: 'code' }, { wait: 900 }).catch(() => {});
      await shot('31-versus-join-code-sheet');
      await at('/friends', 'document.body.innerText.length > 50');
      await sleep(1500);
      await shot('32-friends');
      await at('/versus', 'document.body.innerText.includes("Quick match")');
      await sleep(1000);
      await page.tap({ text: 'With friends', nth: 0 }, { wait: 2000 });
      await shot('33-versus-lobby');
      await page.tap({ label: 'Back' }, { wait: 1500 }).catch(() => {});
      // Quick match of Word Rush (the first mode) against a second player in its own tab: queue, then the match
      await at('/versus', 'document.body.innerText.includes("Quick match")');
      await sleep(800);
      await page.tap({ text: 'Quick match', nth: 0 }, { wait: 1500 });
      await shot('34-versus-queue');
      const rival = await openPage(cdp, { ...device, w: 393, h: 852, top: 59, bottom: 34 });
      try {
        await rival.load('/versus', { [GAME_KEY]: { ...state, playerName: 'Rivalina', characterId: 'bun' }, [ACCOUNT_KEY]: opponent, [VERSUS_KEY]: '1' }, 'document.body.innerText.includes("Quick match")');
        await sleep(800);
        await rival.tap({ text: 'Quick match', nth: 0 }, { wait: 500 });
        await page.waitFor('document.querySelectorAll("[aria-label^=\\"Letter \\"]").length >= 20', 'match', 20000);
        await sleep(600);
        await shot('35-versus-match-countdown');
        await sleep(4500);
        await shot('36-versus-match-play');
        for (const l of 'eaio') await page.tap({ label: `Letter ${l.toUpperCase()}` }, { wait: 250 }).catch(() => {});
        await sleep(900);
        await shot('37-versus-match-guessed');
      } finally { await rival.close(); }
      await page.waitFor('document.body.innerText.includes("Play again")', 'result', 60000).catch(() => {});
      await sleep(1500);
      await shot('38-versus-match-result');
      await page.tap({ text: 'Done' }, { wait: 800 }).catch(() => {});
    },
  },
].filter((s) => only(args.screens, s.id));

/**
 * The server keeps a player in their queue, lobby or match across page loads, and the app then opens
 * the room by itself: leave whatever an earlier (or failed) run left behind, for both accounts.
 */
async function clearVersus(cdp, base, accounts) {
  if (!base) return;
  for (const account of [accounts.player, accounts.rival]) {
    const page = await openPage(cdp, DEVICES[0] ?? { w: 393, h: 852, top: 0, bottom: 0 });
    try {
      await page.load('/versus', { [GAME_KEY]: base, [ACCOUNT_KEY]: account, [VERSUS_KEY]: '1' }, 'document.body.innerText.length > 20');
      await sleep(2500);
      for (let i = 0; i < 4 && await page.evaluate('location.pathname === "/match"'); i++) {
        if (await page.exists({ text: 'Done' })) await page.tap({ text: 'Done' }, { wait: 1200 });
        else if (await page.exists({ text: 'Cancel' })) await page.tap({ text: 'Cancel' }, { wait: 1200 });
        else if (await page.exists({ label: 'Leave the match' })) {
          await page.tap({ label: 'Leave the match' }, { wait: 800 });
          await page.tap({ text: 'Leave' }, { wait: 1500 }).catch(() => {});
        } else if (await page.exists({ label: 'Back' })) await page.tap({ label: 'Back' }, { wait: 1200 });
        else await sleep(1500);
      }
    } catch (e) {
      console.warn(`  ! could not clear Versus: ${e.message}`);
    } finally { await page.close().catch(() => {}); }
  }
}

// ---- index page ----

function writeIndex() {
  const dirs = fs.readdirSync(OUT).filter((d) => fs.statSync(path.join(OUT, d)).isDirectory()).sort();
  const names = [...new Set(dirs.flatMap((d) => fs.readdirSync(path.join(OUT, d)).filter((f) => f.endsWith('.png'))))].sort();
  const label = (d) => DEVICES.find((x) => x.id === d)?.label ?? d;
  const rows = names.map((n) => `<h2>${n.replace('.png', '')}</h2><div class="row">${dirs.map((d) => fs.existsSync(path.join(OUT, d, n))
    ? `<figure><img loading="lazy" src="${d}/${n}"><figcaption>${label(d)}</figcaption></figure>` : '').join('')}</div>`).join('');
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Hanged screenshots</title>
<style>body{font:14px system-ui;background:#f4efe8;margin:20px}h2{margin:28px 0 8px}.row{display:flex;gap:16px;align-items:flex-start;overflow-x:auto}
figure{margin:0}img{height:560px;border-radius:12px;box-shadow:0 2px 8px #0002}figcaption{max-width:260px;font-size:12px;color:#666}</style>
<h1>Hanged: every screen at every size</h1>${rows}`);
}

// ---- run ----

async function main() {
  const health = await fetch(API + '/health').then((r) => r.ok, () => false);
  if (!health) throw new Error(`No server at ${API}: start it with PORT=3010 npm run dev in server/`);
  if (/railway|https:/.test(API)) throw new Error('Screenshots play matches and create players: use a local server');
  await seedBoard();
  // One player and one rival for every device: the server limits new players per address.
  const accountFile = path.join(OUT, '.accounts.json');
  let accounts = fs.existsSync(accountFile) ? JSON.parse(fs.readFileSync(accountFile, 'utf8')) : null;
  if (accounts) await api('/v1/leaderboard?period=all&me=' + accounts.player.id).catch(() => (accounts = null));
  if (!accounts) {
    accounts = { player: await api('/v1/players', { body: {}, ip: '10.88.0.1' }), rival: await api('/v1/players', { body: {}, ip: '10.88.0.2' }) };
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(accountFile, JSON.stringify(accounts));
  }

  const chrome = await launchChrome();
  const cdp = new Cdp(chrome.ws);
  await cdp.open;
  const failures = [];
  try {
    for (const device of DEVICES) {
      const dir = path.join(OUT, device.id);
      fs.mkdirSync(dir, { recursive: true });
      const ctx = {};
      const started = Date.now();
      const savedBase = path.join(OUT, '.base.json');
      await clearVersus(cdp, fs.existsSync(savedBase) && JSON.parse(fs.readFileSync(savedBase, 'utf8')), accounts);
      for (const scenario of SCENARIOS) {
        // The base save comes from onboarding: when it's skipped, use the last device's.
        if (!ctx.base && scenario.id !== 'onboarding') {
          const saved = path.join(OUT, '.base.json');
          if (fs.existsSync(saved)) ctx.base = JSON.parse(fs.readFileSync(saved, 'utf8'));
        }
        const page = await openPage(cdp, device);
        const shot = (name) => page.shot(path.join(dir, `${name}.png`));
        try {
          await scenario.run({ page, shot, ctx, cdp, device, account: accounts.player, opponent: accounts.rival });
          if (scenario.id === 'onboarding' && ctx.base) fs.writeFileSync(path.join(OUT, '.base.json'), JSON.stringify(ctx.base));
        } catch (e) {
          failures.push(`${device.id} ${scenario.id}: ${e.message}`);
          console.error(`  ✗ ${device.id} ${scenario.id}: ${e.message}`);
          await shot(`zz-failed-${scenario.id}`).catch(() => {});
        } finally {
          if (page.errors.length) console.warn(`  ! ${device.id} ${scenario.id} page errors:\n    ${[...new Set(page.errors)].slice(0, 3).join('\n    ')}`);
          await page.close().catch(() => {});
        }
      }
      console.log(`✓ ${device.id} (${Math.round((Date.now() - started) / 1000)} s)`);
    }
  } finally {
    chrome.proc.kill();
    writeIndex();
  }
  console.log(`Screenshots in ${OUT}${failures.length ? `, ${failures.length} failed` : ''}. Open index.html to compare devices.`);
  if (failures.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
