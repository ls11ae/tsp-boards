// Map thumbnails for the gallery (roadmap 7.2): the board of a puzzle without its tour, i.e.
// the region outline and the places, in board millimetres (scaled by the SVG viewBox).

import type { Point } from '../core/geometry';
import { listCities } from '../core/places';
import { boardProjection } from '../core/projection';
import type { PuzzleDoc } from '../core/puzzle-file';
import {
  boardPoints,
  outlineLines,
  projectionKind,
  regionFrame,
  regionOutline,
} from '../core/region';
import { townsById } from './board';
import { fetchCountry } from './controller';

export interface Thumbnail {
  /** The part of the board shown (board mm): all of it, or the places of a small cluster. */
  readonly view: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** SVG path of the region outline, without the data's clip edges ('' for blank and
   * incremental boards). */
  readonly outline: string;
  readonly points: readonly Point[];
}

const cache = new Map<string, Promise<Thumbnail | null>>();

/** Places spanning less than this share of the board are shown cropped (roadmap 9.8). */
const CROP_SHARE = 0.45;

/**
 * The whole board, or the places' box with a margin of a fifth of its size when they cluster
 * in a small part of it (a city-scale puzzle on a state's board).
 */
export function thumbnailView(
  points: readonly Point[],
  width: number,
  height: number,
): Thumbnail['view'] {
  const whole = { x: 0, y: 0, w: width, h: height };
  if (points.length < 2) return whole;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (Math.max((x1 - x0) / width, (y1 - y0) / height) >= CROP_SHARE) return whole;
  const pad = Math.max(10, 0.2 * Math.max(x1 - x0, y1 - y0));
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

async function build(doc: PuzzleDoc): Promise<Thumbnail | null> {
  if (doc.incremental) {
    const { widthMm, heightMm } = doc.incremental.params;
    return {
      view: { x: 0, y: 0, w: widthMm, h: heightMm },
      outline: '',
      points: doc.incremental.points,
    };
  }
  const map = doc.map;
  if (!map) return null;
  const { params } = map;
  const country = await fetchCountry(doc.data?.country ?? params.region.slice(0, 2));
  const outline = regionOutline(country, params.region);
  const projection = boardProjection(
    regionFrame(country, params.region),
    { widthMm: params.boardWidthMm, heightMm: params.boardHeightMm, marginMm: params.marginMm },
    projectionKind(country),
  );
  const cities = listCities(map.places, townsById(country));
  const points = boardPoints(cities, projection);
  return {
    view: thumbnailView(points, params.boardWidthMm, params.boardHeightMm),
    outline: params.blankBoard ? '' : projection.path(outlineLines(outline)),
    points,
  };
}

/** Thumbnail of a puzzle (memoised by `key`); null if it cannot be drawn. */
export function thumbnail(key: string, doc: PuzzleDoc): Promise<Thumbnail | null> {
  let t = cache.get(key);
  if (!t) {
    t = build(doc).catch(() => null);
    cache.set(key, t);
  }
  return t;
}
