/*
 * Player names. The rules and the filter are shared with the server
 * (server/src/names.ts), which checks every name again on sync. A new player
 * gets a random friendly name (listed there too: Versus bots wear them); the
 * Profile page lets them change it.
 */
import { checkName, NameRules } from '../../server/src/names';

export {
  checkName,
  NAME_MAX,
  NAME_MIN,
  namesForLanguage,
  RANDOM_NAMES,
  randomName,
  type NameCheck,
  type NameProblem,
  type NameRules,
} from '../../server/src/names';

/**
 * A saved name the rules no longer take (the limit went from 20 to 15, or a
 * reserved name whose role was taken away): its first word if that one passes
 * ("Roda The Goat" → "Roda"), else null, and the player gets a random name.
 */
export function keptName(name: string | null, rules: NameRules = {}): string | null {
  if (name === null) return null;
  const whole = checkName(name, rules);
  if (whole.ok) return whole.name;
  const first = checkName(name.trim().split(/\s+/)[0], rules);
  return first.ok ? first.name : null;
}
