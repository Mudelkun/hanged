# Dev setup, stack and tooling

## Stack (decided 2026-10-20)

- **Expo SDK 58**, React Native 0.88, React 19.3, TypeScript 6, Jest 30 (jest-expo 58).
  Downgraded from SDK 58 to 57 on 2026-10-20 at the owner's request, then upgraded back to 58
  on 2026-10-23, once the owner's iPhone Expo Go was on SDK 58 (Expo Go runs only one SDK).
  Expo ships breaking changes every SDK: check the versioned docs (`https://docs.expo.dev/versions/v58.0.0/`)
  before using an Expo API, as [AGENTS.md](../AGENTS.md) says.
- **Expo Router**, routes in `src/app/` (`_layout.tsx` = root Stack, `index.tsx` = Play).
  Non-route code stays outside `src/app/`.
- State: React `useReducer` + context. **No state library**: ask the owner before adding one.
- Storage: `@react-native-async-storage/async-storage`. The device is the source of truth
  (offline first).
- Server: [server/](../server/), its own package (Node 24, Fastify, PostgreSQL on Railway), only for the
  leaderboard and word statistics. The app reaches it through `EXPO_PUBLIC_API_URL`. See [server.md](server.md).
- Drawing: `react-native-svg` (`SvgXml` for the character scripts and icons).
- Fonts: `@expo-google-fonts/fredoka` (titles, letters) and `nunito` (body). Loaded in
  `_layout.tsx`. The splash screen stays up until the fonts **and** the saved game are loaded.
- Haptics: `expo-haptics`.
- Audio: `expo-audio` for native playback, `expo-asset` for bundled sources; the browser uses Web Audio. See [audio-design.md](audio-design.md). Both Expo modules are included in SDK 58 Expo Go. Existing development builds need rebuilding to add the native audio module/config; there is no microphone permission or background audio service.

Every native module used is included in **Expo Go**, so the app runs on an iPhone
with Expo Go. No dev build is needed yet.

## Commands

```bash
npx expo start            # dev server; scan the QR code with Expo Go on the iPhone
npm test                  # jest (jest-expo preset): engine + progression tests
npm run typecheck         # tsc --noEmit
npx eslint .              # lint (see trap below)
npm run check:economy     # model character unlock pace with the live rewards and prices
npm run check:web         # execute startup modules from the running Metro web bundle (:8081)
npm run check:words       # validate data/words.json (add -- --build to regenerate it)
cd server && npm test     # server tests (its own package: npm install there first)
cd server && npm run dev  # local API on :3000 with an embedded database
npx expo install <pkg>    # ALWAYS this instead of npm install <pkg>: picks SDK-compatible versions
npx expo-doctor           # dependency/config check
```

Run tests, typecheck and lint before calling a task done (in `server/` too when it changed).

## Traps

- **After changing SDK, delete `node_modules` and `package-lock.json` and reinstall.**
  An old lockfile can leave `expo-modules-core` nested under `expo/`, and then jest-expo
  fails with "Cannot find module 'expo-modules-core'".

- **`npx expo lint` refuses to run** ("requires ESLint 8.57.0 or greater") even though
  ESLint 9 is installed. Run `npx eslint .` directly; the config is `eslint.config.js`.
- **The React Compiler lint rules are on** (`react-hooks/refs`, `purity`,
  `set-state-in-effect`, `immutability`). The usual RN pattern
  `useRef(new Animated.Value(0)).current` fails `react-hooks/refs`. Use
  `const [v] = useState(() => new Animated.Value(0))`. Don't read or write `ref.current`
  during render, and don't call `performance.now()` / `Math.random()` during render.
  Do it in effects or event handlers.
- **TypeScript 6 doesn't auto-include `@types/*`.** Test globals come from
  `"types": ["jest"]` in `tsconfig.json`. Add more there if you need them.
- **`npm install` failed with ERESOLVE on `react-dom`** until `react-dom` was pinned to
  the SDK's React version (`19.3.0` on SDK 58, via `npx expo install react-dom`). expo-router's
  web dependencies pull it in.
- **No 3D transforms (`rotateX`, `rotateY`, `perspective`) anywhere.** On iOS a single 3D-tilted view
  makes Core Animation depth-sort the flat views around it, and it slices them along long diagonal
  lines (parts of cards, text and characters vanish behind the background). The streak confetti's
  `rotateX` flutter did this on the owner's iPhone, and the web preview never shows it. Fake a flip
  with `scaleX`/`scaleY` going through 0 to −1 (the token coin and the confetti both do).
- **Refs take React Native's instance types** (RN 0.87+ makes the strict TypeScript API the default):
  `useRef<ViewInstance>`, `useRef<ScrollViewInstance>`, `useRef<TextInputInstance>`, all exported by
  `react-native`. `useRef<View>` no longer type-checks: `View` is the component, not what the ref holds.
  Deep imports from `react-native/Libraries/*` are type errors too.
- **`react-test-renderer` is a declared dev dependency**, pinned to the SDK's React version. The
  component tests import it, and jest-expo 58 no longer brings it in.
- **`freezeOnBlur` does nothing since SDK 58**, and `activityEnabled` is off on purpose: see
  [leaderboard.md](leaderboard.md).
- On **web**, an `<Svg>` sized only by `style={StyleSheet.absoluteFill}` falls back to
  300×150. Always also pass `width="100%" height="100%"`.

## Previewing without a Mac

**`obscenity` 0.4.6's ESM wrapper crashes under Metro web** with "Cannot read properties of
undefined (reading 'DataSet')". Its CommonJS entry marks `__esModule` without a default export,
but the wrapper default-imports it. `metro.config.js` resolves only this package on web to its
public CommonJS entry, using the app's dependency. Keep the shared name filter and native imports
unchanged. Restart Metro after changing its resolver. A successful export alone misses this runtime
failure: `npm run check:web` executes the bundled name filter and initial game state with Metro's
actual module loader. It also accepts a saved development bundle path after `--`.

`react-native-web` is installed so the screen can be checked in a browser:
`npx expo start --web`. To capture phone-sized screenshots, run headless Chrome with
`--remote-debugging-port`. Pass an **absolute** `--user-data-dir`: with a relative
one, the port never opens. Then drive it over the DevTools protocol (set the device
metrics to 393×852 / 375×667, tap keys by their `aria-label`, e.g. `Letter A`).
On web, haptics do nothing and `Animated` falls back to JS. Neither is a bug.
**`CI=1` turns off Metro's file watching**: a server started with it keeps serving the
bundle it first built. Use it only for one-off captures, and restart after edits. To check
what a server serves, `curl` its bundle URL and grep it for the new code.
The real target is iOS: confirm on a phone with Expo Go.
**Debugging on the phone without seeing it:** the phone's `console.log` output is forwarded
to the dev server and written to `.expo/dev/logs/start.log` (JSON lines, `metro:client_log`
events). Add tagged logs, ask the owner to reload (`r`) and play, then read that file. Its
`metro:bundling:started` events also show when the phone last fetched code.

## App identity

`app.json`: name **"Hanged: word guessing game"**, iOS home-screen label
(`CFBundleDisplayName`) **"Hanged"**, slug/scheme `hanged`, portrait only, no
tablet layout yet. Never "Hangman".
