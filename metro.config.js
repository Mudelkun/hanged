// The server (server/) has its own node_modules and dev database: keep Metro
// from watching them. The app only imports server/src/contract.ts (types and limits)
// and server/src/names.ts, whose `obscenity` comes from the app's own node_modules.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.blockList = [/[\/]server[\/](node_modules|\.pglite)[\/].*/];

// obscenity's ESM wrapper default-imports its CommonJS entry, which has
// __esModule but no default export. Metro web therefore crashes on DataSet.
// Resolve just this package to its public CommonJS entry; keep all other
// package conditions and native resolution unchanged.
config.resolver.resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(
    context,
    platform === 'web' && moduleName === 'obscenity' ? require.resolve('obscenity') : moduleName,
    platform,
  );

module.exports = config;
