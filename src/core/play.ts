// Play mode: building a round trip by clicking nails, judging it against the optimum, and the
// anonymous record of a game (sent only with the player's consent).

import type { Instance } from './instance';
import type { Measure } from './scores';
import { sameTour, stringLength } from './tsp/tour';

export interface PlayState {
  /** Nails (slots) in the order visited; the trip starts at path[0]. */
  readonly path: readonly number[];
  /** The round trip is closed (all nails visited and back at the start). */
  readonly closed: boolean;
}

export const EMPTY_PLAY: PlayState = { path: [], closed: false };

/**
 * Click on a nail: a new nail extends the trip; the start nail closes a trip through all
 * nails; the last nail is taken back; an earlier nail cuts the trip back to it.
 *
 * With given end points (an open path whose leg back is given, roadmap 9.15) the trip always
 * starts at `ends[0]`, and `ends[1]` comes last: adding it after all other nails closes the
 * round trip (the given leg leads back); before that it is not taken.
 */
export function clickNail(
  state: PlayState,
  slot: number,
  n: number,
  ends: readonly [number, number] | null = null,
): PlayState {
  if (ends) return clickPathNail(state, slot, n, ends);
  const { path } = state;
  const at = path.indexOf(slot);
  if (state.closed) {
    // Reopen: a click on a nail of a closed trip cuts it back to that nail.
    return { path: path.slice(0, at + 1), closed: false };
  }
  if (at < 0) return { path: [...path, slot], closed: false };
  if (at === 0 && path.length === n && n >= 3) return { path, closed: true };
  if (at === path.length - 1) return { path: path.slice(0, -1), closed: false };
  return { path: path.slice(0, at + 1), closed: false };
}

function clickPathNail(
  state: PlayState,
  slot: number,
  n: number,
  [start, end]: readonly [number, number],
): PlayState {
  const path = state.path.length > 0 ? state.path : [start];
  const at = path.indexOf(slot);
  // A closed trip reopens before the clicked nail's successor; the end nail goes first.
  if (state.closed)
    return { path: slot === end ? path.slice(0, -1) : path.slice(0, at + 1), closed: false };
  if (slot === end)
    return path.length === n - 1 ? { path: [...path, end], closed: true } : { path, closed: false };
  if (at < 0) return { path: [...path, slot], closed: false };
  if (at === path.length - 1 && at > 0) return { path: path.slice(0, -1), closed: false };
  return { path: path.slice(0, at + 1), closed: false };
}

/** Takes back the last step (reopens a closed trip; with given end points, without its end). */
export function undo(state: PlayState, ends: readonly [number, number] | null = null): PlayState {
  if (state.closed) return { path: ends ? state.path.slice(0, -1) : state.path, closed: false };
  return { path: state.path.slice(0, -1), closed: false };
}

/** String length of the open path so far (µm): legs plus the wraps at inner nails. */
export function pathLength(inst: Instance, path: readonly number[]): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) sum += inst.dist(path[i - 1]!, path[i]!);
  for (let i = 1; i + 1 < path.length; i++) sum += inst.turn(path[i - 1]!, path[i]!, path[i + 1]!);
  return sum;
}

export interface Judgement {
  /** String length S of the player's round trip (µm). */
  readonly lengthUm: number;
  /** S minus the optimum (µm); 0 for the optimum. */
  readonly excessUm: number;
  readonly optimal: boolean;
}

export function judge(
  inst: Instance,
  path: readonly number[],
  optimum: { readonly tour: readonly number[]; readonly lengthUm: number },
): Judgement {
  const lengthUm = stringLength(inst, path);
  const optimal = sameTour(path, optimum.tour, inst.n) || lengthUm <= optimum.lengthUm;
  return { lengthUm, excessUm: Math.max(0, lengthUm - optimum.lengthUm), optimal };
}

export interface PlayAttempt {
  /** Milliseconds since the first click. */
  readonly ms: number;
  readonly excessUm: number;
}

/**
 * What a game sends with consent: no ids, no personal data; the puzzle by a hash of its
 * places and by its board points, so a server can recompute lengths from the submitted order.
 * A nickname is included only if the player agreed to show it.
 */
export interface PlayRecord {
  readonly schema: 2;
  readonly app: string;
  /** Data version, e.g. 'de@1'. */
  readonly data: string;
  /** FNV-1a hash of the sorted GeoNames ids. */
  readonly puzzle: string;
  readonly region: string;
  readonly n: number;
  readonly rEffMm: number;
  /** Every closed round trip the player checked, in order. */
  readonly attempts: readonly PlayAttempt[];
  /** Milliseconds from the first click to the optimum; null if not solved. */
  readonly solvedMs: number | null;
  /** The player looked at the solution. */
  readonly gaveUp: boolean;
  /** Difficulty score of the search (0–1), if known. */
  readonly difficulty: number | null;
  /** How round trips were judged: string length (boards) or Euclidean length (digital). */
  readonly measure: Measure;
  /** Board coordinates of the places in mm (0.01), in the puzzle's order. */
  readonly points: readonly (readonly [number, number])[];
  /** The player's best round trip (indices into points), null if none was closed. */
  readonly order: readonly number[] | null;
  /** Nickname for a shared highscore list, only with consent; else null. */
  readonly nickname: string | null;
}

export function puzzleHash(ids: readonly number[]): string {
  let h = 0x811c9dc5;
  for (const id of [...ids].sort((a, b) => a - b)) {
    for (const ch of `${id},`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}
