/*
 * Player names. The rules and the filter are shared with the server
 * (server/src/names.ts), which checks every name again on sync. A new player
 * gets a random friendly name; the Profile page lets them change it.
 */
import { checkName, NAME_MAX } from '../../server/src/names';

export { checkName, NAME_MAX, NAME_MIN, type NameCheck, type NameProblem } from '../../server/src/names';

// Words that are never a character's name (Mochi, Bun…), so a name never reads as the character.
const ADJECTIVES = [
  'Sunny', 'Bubbly', 'Brave', 'Cozy', 'Dizzy', 'Fluffy', 'Giggly', 'Happy', 'Jolly', 'Lucky', 'Merry', 'Peppy',
  'Plucky', 'Snappy', 'Sparkly', 'Speedy', 'Sleepy', 'Swift', 'Witty', 'Zippy', 'Clever', 'Cheery', 'Breezy',
  'Bouncy', 'Curious', 'Daring', 'Gentle', 'Mighty', 'Quirky', 'Rosy', 'Tiny', 'Wobbly', 'Fuzzy', 'Nifty',
  'Sweet', 'Twinkly', 'Wise', 'Chirpy', 'Dapper', 'Jazzy',
] as const;
const NOUNS = [
  'Otter', 'Comet', 'Muffin', 'Pebble', 'Pickle', 'Waffle', 'Acorn', 'Balloon', 'Bubble', 'Cloud', 'Cookie',
  'Cupcake', 'Daisy', 'Dumpling', 'Feather', 'Gecko', 'Hedgehog', 'Kiwi', 'Koala', 'Lemon', 'Maple', 'Meadow',
  'Noodle', 'Owl', 'Peanut', 'Penguin', 'Pretzel', 'Puffin', 'Quokka', 'Raccoon', 'Robin', 'Sparrow', 'Sprout',
  'Squirrel', 'Sunflower', 'Tadpole', 'Teacup', 'Toucan', 'Walrus', 'Wombat', 'Pancake', 'Pudding',
] as const;

/** Random names stay short, so they show big in the Play header. */
const RANDOM_NAME_MAX = Math.min(10, NAME_MAX);

/** Every name randomName can give: "SunnyOtter", one word, only the pairs that fit in RANDOM_NAME_MAX. */
export const RANDOM_NAMES: readonly string[] = ADJECTIVES.flatMap((a) => NOUNS.map((n) => a + n)).filter(
  (name) => name.length <= RANDOM_NAME_MAX,
);

/** A new player's name until they pick one. Names don't have to be unique. */
export const randomName = (rng: () => number = Math.random) => RANDOM_NAMES[Math.floor(rng() * RANDOM_NAMES.length)];

/**
 * A saved name the rules no longer take (the limit went from 20 to 15): its
 * first word if that one passes ("Roda The Goat" → "Roda"), else null, and
 * the player gets a random name.
 */
export function keptName(name: string | null): string | null {
  if (name === null) return null;
  const whole = checkName(name);
  if (whole.ok) return whole.name;
  const first = checkName(name.trim().split(/\s+/)[0]);
  return first.ok ? first.name : null;
}
