/*
 * npm run check:economy
 * Outcome model for shop pacing, not a prediction of real players' win rates.
 * Reuses the live rewards and level progression. Win rates and letter use are
 * explicit assumptions; free descriptions are included in those win rates.
 * See Context/characters-shop.md before changing them or the target pace.
 */
const fs = require('fs');
const ts = require('typescript');

// Use the project's existing compiler to load its pure TS rules in this CLI.
// Restore the loader after imports; no new dependency or app runtime code.
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (mod, file) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  mod._compile(outputText, file);
};
const { CHARACTER_PRICES, LETTER_BUY_COST, STARTING_TOKENS } = require('../src/game/config.ts');
const { afterRound, levelByNumber, START_LEVEL } = require('../src/game/levels.ts');
const { tokenReward } = require('../src/game/progress.ts');
if (previousLoader) require.extensions['.ts'] = previousLoader;
else delete require.extensions['.ts'];

const PLAYERS = 400;
const MAX_ROUNDS = 10000;
// Assumed win rates: tutorial, everyday levels 3-15, then summit levels 16-20.
const PROFILES = {
  casual: [0.9, 0.85, ...Array(13).fill(0.75), 0.7, 0.68, 0.65, 0.62, 0.6],
  regular: [0.95, 0.9, ...Array(13).fill(0.82), 0.8, 0.78, 0.75, 0.72, 0.7],
  strong: [0.98, 0.95, ...Array(13).fill(0.9), 0.88, 0.86, 0.84, 0.82, 0.8],
};
const paidPrices = Object.values(CHARACTER_PRICES).filter((price) => price > 0);
// Historical prices immediately after descriptions became free, for comparison only.
const PRICING = {
  previous: { prices: [30, 50, 75, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400], letters: 10 },
  current: { prices: paidPrices, letters: LETTER_BUY_COST },
};
const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function simulate({ prices, letters }, winRates, letterUse) {
  const milestones = prices.map(() => []);
  for (let player = 1; player <= PLAYERS; player++) {
    const rng = seeded(player);
    let progress = START_LEVEL;
    let streak = 0;
    let tokens = STARTING_TOKENS;
    let owned = 0;
    for (let round = 1; round <= MAX_ROUNDS && owned < prices.length; round++) {
      const level = levelByNumber(progress.level);
      const winChance = winRates[level.level - 1];
      if (winChance === undefined) throw new Error(`Add a win-rate assumption for level ${level.level}`);
      // A planned purchase on a level selling letters, only if affordable. This
      // assumes enough letters remain; actual puzzle eligibility can reduce spending.
      // Always draw both random values so pricing comparisons use the same outcomes.
      const buysLetters = rng() < letterUse;
      const won = rng() < winChance;
      if (buysLetters && level.sellsLetters && tokens >= letters) tokens -= letters;
      streak = won ? streak + 1 : 0;
      if (won) tokens += tokenReward(level.level, streak);
      progress = afterRound(progress, won);
      // A collector buys the cheapest remaining character as soon as it is affordable.
      while (owned < prices.length && tokens >= prices[owned]) {
        tokens -= prices[owned];
        milestones[owned++].push(round);
      }
    }
    if (owned < prices.length) throw new Error(`Player ${player} did not finish within ${MAX_ROUNDS} rounds`);
  }
  return milestones.map(median);
}

const rows = [];
let regularMilestones;
for (const [pricing, prices] of Object.entries(PRICING)) {
  for (const [profile, winRates] of Object.entries(PROFILES)) {
    for (const letterUse of [0, 0.05, 0.1]) {
      const milestones = simulate(prices, winRates, letterUse);
      if (pricing === 'current' && profile === 'regular' && letterUse === 0.05) regularMilestones = milestones;
      rows.push({ pricing, profile, letterUse: `${Math.round(letterUse * 100)}%`, first: milestones[0], collection: milestones.at(-1) });
    }
  }
}
console.log(`Median rounds across ${PLAYERS} seeded players. Win rates are assumptions, not measured player data.`);
console.log(`Current collection: ${paidPrices.reduce((sum, price) => sum + price, 0)} tokens. Letter purchase: ${LETTER_BUY_COST} tokens.`);
console.table(rows);
console.log('Current regular collector, 5% planned letter purchases on levels selling letters:');
console.table(Object.entries(CHARACTER_PRICES).filter(([, price]) => price > 0).map(([character, price], index) => ({
  character, price, medianRound: regularMilestones[index],
})));

// Broad design guardrails for the owner's steady pace, using the declared regular scenario.
const first = regularMilestones[0];
const collection = regularMilestones.at(-1);
if (first < 20 || first > 30 || collection < 1500 || collection > 2000) {
  console.error('Outside the steady target: first unlock 20-30 rounds, collection 1,500-2,000.');
  process.exitCode = 1;
} else {
  console.log('Steady pacing target met. Confirm the assumptions against player data before release.');
}
