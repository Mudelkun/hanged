// Execute the real Metro web modules: Jest's Node resolution misses browser-only import failures.
// Usage: node scripts/check-web.js [path-to-development-web-bundle.js]
// With no path, reads the running Expo server at http://localhost:8081.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parse } = require('@babel/parser');

async function main() {
  const source = process.argv[2]
    ? fs.readFileSync(process.argv[2], 'utf8')
    : await fetch('http://localhost:8081/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&lazy=false&transform.routerRoot=src%2Fapp')
      .then(response => { assert.ok(response.ok, `Web bundle returned HTTP ${response.status}`); return response.text(); });
  const context = vm.createContext({ console: { ...console, warn() {} }, __DEV__: true, __METRO_GLOBAL_PREFIX__: '' });
  vm.runInContext('var global = this;', context);
  // Use Metro's own loader and import interoperability, not a Node/Jest substitute.
  vm.runInContext(fs.readFileSync(require.resolve('metro-runtime/src/polyfills/require.js'), 'utf8'), context);
  const statements = parse(source, { sourceType: 'script' }).program.body;
  const registrations = statements.filter(statement => statement.type === 'ExpressionStatement'
    && statement.expression.type === 'CallExpression' && statement.expression.callee.type === 'Identifier'
    && statement.expression.callee.name === '__d');
  assert.ok(registrations.length > 0, 'Expected a Metro development bundle');
  vm.runInContext(registrations.map(statement => source.slice(statement.start, statement.end)).join('\n'), context);
  // Skip UI/bootstrap execution: this check exercises the actual shared startup modules.
  const names = context.__r('src/game/names.ts');
  assert.equal(names.checkName('SunnyOtter').ok, true);
  assert.equal(names.checkName('BigDick').problem, 'blocked');
  assert.equal(names.checkName('Hanged').problem, 'blocked');
  for (const name of names.RANDOM_NAMES) assert.equal(names.checkName(name).ok, true, name);
  const progress = context.__r('src/game/progress.ts');
  assert.equal(progress.initialState().tokens >= 0, true);
  console.log(`Web startup modules passed: name filter, ${names.RANDOM_NAMES.length} friendly names, and initial game state.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
