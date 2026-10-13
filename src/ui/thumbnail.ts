// Map thumbnails for the gallery (roadmap 7.2): the board of a puzzle without its tour, i.e.
// the region outline and the places, in board millimetres (scaled by the SVG viewBox).

import type { Point } from '../core/geometry';
import { listCities } from '../core/places';
import { boardProjection } from '../core/projection';
import type { PuzzleDoc } from '../core/puzzle-file';
import { boardPoints, projectionKind, regionFrame, regionOutline } from '../core/region';
import { townsById } from './board';
import { fetchCountry } from './controller';

export interface Thumbnail {
  readonly width: number;
  readonly height: number;
  /** SVG path of the region outline ('' for blank and incremental boards). */
  readonly outline: string;
  readonly points: readonly Point[];
}

const cache = new Map<string, Promise<Thumbnail | null>>();

async function build(doc: PuzzleDoc): Promise<Thumbnail | null> {
  if (doc.incremental) {
    const { widthMm, heightMm } = doc.incremental.params;
    return { width: widthMm, height: heightMm, outline: '', points: doc.incremental.points };
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
  return {
    width: params.boardWidthMm,
    height: params.boardHeightMm,
    outline: params.blankBoard ? '' : projection.path(outline),
    points: boardPoints(cities, projection),
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
