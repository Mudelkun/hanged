// The server (server/) has its own node_modules and dev database: keep Metro
// from watching them. The app only imports server/src/contract.ts (types and limits)
// and server/src/names.ts, whose `obscenity` comes from the app's own node_modules.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.blockList = [/[\/]server[\/](node_modules|\.pglite)[\/].*/];

module.exports = config;
