// Board labels in the app: label metrics of all pool cities (memoised) and the placement for
// the puzzle on display, with the same solver the search uses, so the board shows the labels
// the search checked.

import {
  labelCandidates,
  labelOptions,
  placeLabels,
  type LabelCandidate,
  type LabelOptions,
  type Obstacle,
} from '../core/board/labels';
import { svgPathData } from '../core/board/shapes';
import { measureText, textPath, type TextMetrics } from '../core/board/text';
import { boardLabel } from '../core/data';
import type { PoolLabels } from '../core/search/search';
import type { BoardModel } from './board';
import type { UiParams } from './store';

export interface LabelModel {
  readonly texts: readonly string[];
  readonly metrics: readonly TextMetrics[];
  readonly options: LabelOptions;
  /** Candidates per pool city, filled on first use. */
  readonly candidates: (LabelCandidate[] | undefined)[];
}

let cached: { board: BoardModel; key: string; model: LabelModel } | null = null;

/** Memoised per board, label size, language and nail diameter; null without labels. */
export function getLabels(board: BoardModel, params: UiParams): LabelModel | null {
  if (params.labelSizeMm <= 0) return null;
  const key = [params.labelSizeMm, params.labelLanguage, params.nailDiameterMm].join('|');
  if (cached && cached.board === board && cached.key === key) return cached.model;
  const texts = board.pool.map((c) => boardLabel(c, params.labelLanguage));
  const model: LabelModel = {
    texts,
    metrics: texts.map((t) => measureText(t, params.labelSizeMm)),
    options: labelOptions(params.labelSizeMm, params.nailDiameterMm),
    candidates: new Array<LabelCandidate[] | undefined>(board.pool.length),
  };
  cached = { board, key, model };
  return model;
}

/** The label constraint for the search worker (plain data). */
export function poolLabels(board: BoardModel, labels: LabelModel): PoolLabels {
  return {
    metrics: labels.metrics,
    options: labels.options,
    width: board.projection.board.widthMm,
    height: board.projection.board.heightMm,
  };
}

export interface PlacedLabel {
  /** Pool index. */
  readonly city: number;
  /** Outline as SVG path data (board mm); at the preferred position if it did not fit. */
  readonly path: string;
  readonly fits: boolean;
}

export function placeBoardLabels(
  board: BoardModel,
  labels: LabelModel,
  members: readonly number[],
  obstacles: readonly Obstacle[] = [],
): { readonly labels: PlacedLabel[]; readonly complete: boolean } {
  const candidates = members.map(
    (c) =>
      (labels.candidates[c] ??= labelCandidates(
        board.points[c]!,
        labels.metrics[c]!,
        labels.options,
      )),
  );
  const placement = placeLabels({
    points: members.map((c) => board.points[c]!),
    candidates,
    obstacles,
    width: board.projection.board.widthMm,
    height: board.projection.board.heightMm,
    options: labels.options,
  });
  return {
    complete: placement.complete,
    labels: members.map((city, i) => {
      const choice = placement.choice[i]!;
      const candidate = candidates[i]![Math.max(0, choice)]!;
      const [x, y] = candidate.baseline;
      return {
        city,
        path: svgPathData(textPath(labels.texts[city]!, x, y, labels.options.sizeMm), 2),
        fits: choice >= 0,
      };
    }),
  };
}
