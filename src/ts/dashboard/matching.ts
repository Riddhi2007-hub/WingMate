import { getPeople } from './data';
import { PREF_KEYS, WEIGHTS, type PrefKey } from './options';
import { state } from './state';
import type { MatchDetail, Person, Prefs, Ranked } from './types';

/**
 * How closely a passenger matches your preferences (0-100).
 * Only the preferences ticked under "Rank by" on the Find page are counted.
 */
export function score(person: Person, me: Prefs): MatchDetail {
  let got = 0;
  let total = 0;
  const shared = person.interests.filter((i) => me.interests.includes(i));
  const hit: Partial<Record<PrefKey, number>> = {};

  for (const key of PREF_KEYS) {
    if (!state.criteria[key]) continue;
    let fraction = 0;
    if (key === 'interests') {
      fraction = me.interests.length ? Math.min(1, shared.length / Math.min(3, me.interests.length)) : 0;
    } else if (key === 'pers') {
      if (person.pers === me.pers) fraction = 1;
      else if (person.pers === 'Ambivert' || me.pers === 'Ambivert') fraction = 0.5;
    } else {
      fraction = person[key] === me[key] ? 1 : 0;
    }
    hit[key] = fraction;
    got += WEIGHTS[key] * fraction;
    total += WEIGHTS[key];
  }
  return { pct: total ? Math.round((got / total) * 100) : 0, shared, hit };
}

/** Everyone on the flight, best match first (ties sorted by name). */
export function ranked(): Ranked[] {
  return getPeople().map((p) => ({ p, s: score(p, state.prefs) })).sort(
    (a, b) => b.s.pct - a.s.pct || a.p.name.localeCompare(b.p.name),
  );
}
