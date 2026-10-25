/*
 * Friend invite links on the web: https://<server>/i/<code>.
 *
 * With the app installed, the phone opens the app straight from the link
 * (iOS Universal Links, Android App Links: the two files below) and the app
 * offers to be friends. Without it, this page opens instead and sends the
 * player to their store:
 *   - Android: at once, with the code in the Play Store's install referrer,
 *     which the app reads on its first launch (nothing to tap).
 *   - iOS: on a tap of "Get Hanged", which also copies the link, so the app's
 *     first screen can paste it (Apple has no install referrer).
 * The app sends the code to POST /v1/invites/:code/accept once the new
 * player has an account (routes.ts). Context/versus.md, Invite links.
 *   GET /i/:code                                   the page
 *   GET /.well-known/apple-app-site-association    with APPLE_APP_ID
 *   GET /.well-known/assetlinks.json               with ANDROID_PACKAGE and ANDROID_CERT_SHA256
 */
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db.ts';
import { INVITE_PATH } from '../versus-contract.ts';
import { INVITE_CODE } from './routes.ts';
import { inviter } from './store.ts';

export interface LinkOptions {
  /** APPLE_APP_ID: "<team id>.<bundle id>". Without it, iOS opens the page, never the app. */
  appleAppId?: string;
  /** APP_STORE_ID: the app's number on the App Store (apps.apple.com/app/id<number>). */
  appStoreId?: string;
  /** ANDROID_PACKAGE: the app's package name on Google Play. */
  androidPackage?: string;
  /** ANDROID_CERT_SHA256: the signing certificates' SHA-256 fingerprints (Play Console, App signing). */
  androidCerts?: string[];
}

/** app.json's `scheme`: opens the app from the page ("Already have it?"). */
const APP_SCHEME = 'hanged';
const CODE = new RegExp(INVITE_CODE);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function linkRoutes(app: FastifyInstance, db: Db, opts: LinkOptions) {
  const { appleAppId, appStoreId, androidPackage, androidCerts = [] } = opts;
  const limit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  if (appleAppId) {
    const paths = [`${INVITE_PATH}*`];
    // Both formats: `components` (iOS 13+) and `paths` (older)
    const file = { applinks: { apps: [], details: [{ appID: appleAppId, paths, appIDs: [appleAppId], components: paths.map((p) => ({ '/': p })) }] } };
    app.get('/.well-known/apple-app-site-association', async (_req, reply) => reply.type('application/json').send(file));
  }
  if (androidPackage && androidCerts.length) {
    const file = [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: androidPackage, sha256_cert_fingerprints: androidCerts },
      },
    ];
    app.get('/.well-known/assetlinks.json', async (_req, reply) => reply.type('application/json').send(file));
  }

  app.get<{ Params: { code: string } }>(`${INVITE_PATH}:code`, limit, async (req, reply) => {
    const code = req.params.code.toUpperCase();
    const host = CODE.test(code) ? await inviter(db, code) : null;
    const link = `${req.protocol}://${req.host}${INVITE_PATH}${code}`;
    return reply
      .code(host ? 200 : 404)
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', host ? 'public, max-age=300' : 'no-store')
      .header('x-frame-options', 'DENY')
      .header(
        'content-security-policy',
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com",
      )
      .send(page({ code, link, name: host ? (host.name ?? 'A friend') : null, appStoreId, androidPackage }));
  });
}

interface PageData {
  code: string;
  link: string;
  /** null: no such invite. */
  name: string | null;
  appStoreId?: string;
  androidPackage?: string;
}

function page({ code, link, name, appStoreId, androidPackage }: PageData): string {
  const ios = appStoreId ? `https://apps.apple.com/app/id${appStoreId}` : '';
  const play = androidPackage
    ? `https://play.google.com/store/apps/details?id=${androidPackage}&referrer=${encodeURIComponent(`invite=${code}`)}`
    : '';
  const openIos = `${APP_SCHEME}:/${INVITE_PATH}${code}`;
  const openAndroid = androidPackage
    ? `intent:/${INVITE_PATH}${code}#Intent;scheme=${APP_SCHEME};package=${androidPackage};S.browser_fallback_url=${encodeURIComponent(play)};end`
    : '';
  const who = name === null ? '' : escapeHtml(name);
  const title = name === null ? 'Hanged: word guessing game' : `${who} invited you to Hanged`;
  const attr = (s: string) => escapeHtml(s);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="A cute word guessing game. Get it, and you'll be friends right away.">
${ios && name !== null ? `<meta name="apple-itunes-app" content="app-id=${attr(appStoreId!)}, app-argument=${attr(link)}">` : ''}
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Nunito:wght@700;800&display=swap" rel="stylesheet">
<style>
  :root { --paper: #fffaf1; --ink: #4b3a35; --muted: #a8948a; --line: #f3e6d6; --coral: #ff7b6b; --coralD: #e85c4d; --sky: #e0f3ff; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: linear-gradient(var(--sky), var(--paper) 55%); color: var(--ink);
    font: 800 16px/1.45 Nunito, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; padding: 24px 16px; }
  main { width: 100%; max-width: 380px; text-align: center; }
  .balloons { font-size: 52px; letter-spacing: -8px; margin-bottom: 4px; }
  h1 { font: 700 30px/1.15 Fredoka, system-ui, sans-serif; margin: 8px 0; overflow-wrap: anywhere; }
  .app { font: 600 17px Fredoka, system-ui, sans-serif; color: var(--coralD); margin: 0 0 14px; }
  p { margin: 0 0 18px; }
  .muted { color: var(--muted); font-size: 14px; }
  .button { display: block; background: var(--coral); color: #fff; text-decoration: none; font: 600 20px Fredoka, system-ui, sans-serif;
    padding: 15px 18px; border-radius: 18px; box-shadow: 0 5px 0 var(--coralD); margin: 0 0 14px; }
  .button:active { transform: translateY(4px); box-shadow: 0 1px 0 var(--coralD); }
  .ghost { background: #fff; color: var(--coralD); box-shadow: 0 5px 0 var(--line); border: 2px solid var(--line); }
  .open { color: var(--coralD); font-weight: 800; }
  .code { font: 600 15px Fredoka, system-ui, sans-serif; color: var(--muted); letter-spacing: 2px; margin-top: 22px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main data-ios="${attr(ios)}" data-play="${attr(play)}" data-open-ios="${attr(openIos)}" data-open-android="${attr(openAndroid)}" data-link="${attr(link)}">
  <div class="balloons" aria-hidden="true">🎈🎈🎈</div>
  ${
    name === null
      ? `<h1>This invite link doesn't work anymore</h1>
  <p>Ask your friend to share it again. You can still play:</p>`
      : `<h1>${who} invited you!</h1>
  <p class="app">Hanged: word guessing game</p>
  <p>Get the app and you'll be friends right away, ready to play Versus together.</p>`
  }
  <a id="get" class="button" href="${attr(ios || play || '#')}" hidden>Get Hanged</a>
  <div id="stores" hidden>
    <a class="button" href="${attr(ios)}" ${ios ? '' : 'hidden'}>App Store</a>
    <a class="button ghost" href="${attr(play)}" ${play ? '' : 'hidden'}>Google Play</a>
  </div>
  <p id="soon" class="muted" hidden>Hanged is coming soon to the App Store and Google Play.</p>
  <p id="pasteHint" class="muted" hidden>Once it's installed, open Hanged and tap <b>Paste</b> to join ${who}.</p>
  <p id="desktop" class="muted" hidden>Open this link on your phone.</p>
  ${name === null ? '' : `<a id="open" class="open" href="${attr(openIos)}">Already have Hanged? Open it</a>`}
  ${name === null ? '' : `<p class="code">INVITE ${escapeHtml(code)}</p>`}
</main>
<script>
  const d = document.querySelector('main').dataset;
  const $ = (id) => document.getElementById(id);
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const store = ios ? d.ios : android ? d.play : '';
  if ($('open') && !ios && !android) $('open').hidden = true;
  if (android && $('open') && d.openAndroid) $('open').href = d.openAndroid;
  if (store) {
    $('get').href = store;
    $('get').hidden = false;
  } else if (ios || android || (!d.ios && !d.play)) {
    $('soon').hidden = false;
  } else {
    $('stores').hidden = false;
    $('desktop').hidden = false;
  }
  if (android && d.play && $('open')) {
    // The install referrer carries the code into the app: nothing to tap
    location.replace(d.play);
  } else if (ios && d.ios && $('open')) {
    // Apple passes nothing through the App Store: the copied link is pasted on the app's first screen
    $('pasteHint').hidden = false;
    $('get').addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await Promise.race([navigator.clipboard.writeText(d.link), new Promise((r) => setTimeout(r, 500))]);
      } catch {}
      location.href = d.ios;
    });
  }
</script>
</body>
</html>
`;
}
