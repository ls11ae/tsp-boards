// The board export pipeline shared by the app and the CLI:
//   boardSetup (cities, nails, instance, label metrics, texts)
//   -> verification of the string optimum (verify.ts, exact solver)
//   -> planBoard (start nail, scale, title, labels; exact measured gap)
//   -> drawPuzzleBoard (map lines and all paths) -> boardSvg / boardPdf.

import type { City, CountryFile } from '../data';
import type { Point } from '../geometry';
import { Instance } from '../instance';
import { rEffMm, type PuzzleParams } from '../params';
import { boardProjection, type BoardProjection } from '../projection';
import {
  boardPoints,
  citySphere,
  cityPool,
  projectionKind,
  regionFrame,
  regionInfo,
} from '../region';
import { boardLabel } from '../data';
import type { Tour } from '../tsp/tour';
import {
  DEFAULT_DRAWING,
  drawBoard,
  textBlockSize,
  type BoardDrawing,
  type DrawingOptions,
  type TextLine,
} from './drawing';
import { labelOptions, type LabelOptions } from './labels';
import { boardMapLines } from './map-lines';
import type { BoardPlan, PlanInput } from './plan';
import { measureText, type TextMetrics } from './text';
import { BOARD_TEXTS, type BoardTexts } from './texts';

export interface BoardSetup {
  readonly file: CountryFile;
  readonly params: PuzzleParams;
  readonly projection: BoardProjection;
  /** Selected cities in slot order (ascending pool index, as in the app). */
  readonly cities: readonly City[];
  readonly points: readonly Point[];
  /** String instance (r_eff from the nail and string). */
  readonly inst: Instance;
  readonly labels: {
    readonly texts: readonly string[];
    readonly metrics: readonly TextMetrics[];
    readonly options: LabelOptions;
  } | null;
  readonly texts: BoardTexts;
  readonly title: readonly TextLine[];
  readonly footer: TextLine;
  /** GeoNames ids of the cities that are not in the pool (data version mismatch). */
  readonly missing: readonly number[];
}

export const TITLE_SIZE_MM = 16;
export const SUBTITLE_SIZE_MM = 6;
export const FOOTER_SIZE_MM = 3.5;

/** Board setup for the cities with the given GeoNames ids. */
export function boardSetup(
  file: CountryFile,
  params: PuzzleParams,
  cityIds: readonly number[],
  /** Puzzle title for the board (default: the region's name). */
  title = '',
  /** Pool to take the cities from (default: the region's towns); e.g. a place list. */
  poolCities: readonly City[] | null = null,
): BoardSetup {
  const projection = boardProjection(
    regionFrame(file, params.region),
    { widthMm: params.boardWidthMm, heightMm: params.boardHeightMm, marginMm: params.marginMm },
    projectionKind(file),
  );
  const pool = poolCities ?? cityPool(file, params.region, { minPopulation: params.minPopulation });
  const index = new Map(pool.map((c, i) => [c.id, i]));
  const members = cityIds
    .map((id) => index.get(id))
    .filter((i): i is number => i !== undefined)
    .sort((a, b) => a - b);
  const cities = members.map((i) => pool[i]!);
  const points = boardPoints(cities, projection);
  const lang = params.labelLanguage;
  const texts = BOARD_TEXTS[lang];
  const region = regionInfo(file, params.region);
  const regionName = lang === 'de' ? region.name : region.nameEn;
  let labels: BoardSetup['labels'] = null;
  if (params.labelSizeMm > 0) {
    const labelTexts = cities.map((c) => boardLabel(c, lang));
    labels = {
      texts: labelTexts,
      metrics: labelTexts.map((t) => measureText(t, params.labelSizeMm)),
      options: labelOptions(params.labelSizeMm, params.nailDiameterMm),
    };
  }
  return {
    file,
    params,
    projection,
    cities,
    points,
    inst: new Instance(points, rEffMm(params), citySphere(file, cities, projection)),
    labels,
    texts,
    title: [
      { text: title || regionName, sizeMm: TITLE_SIZE_MM },
      { text: texts.subtitle(cities.length), sizeMm: SUBTITLE_SIZE_MM },
    ],
    footer: { text: texts.attribution, sizeMm: FOOTER_SIZE_MM },
    missing: cityIds.filter((id) => !index.has(id)),
  };
}

export interface StringOptimum {
  /** String-optimal tour over slots, the runner-up (if known) and the gap in µm. */
  readonly tour: Tour;
  readonly second: Tour | null;
  readonly gapUm: number;
}

export function boardPlanInput(setup: BoardSetup, optimum: StringOptimum): PlanInput {
  const { params } = setup;
  return {
    inst: setup.inst,
    tour: optimum.tour,
    second: optimum.second,
    stringGapUm: optimum.gapUm,
    targetGapUm: params.targetGapMm * 1000,
    width: params.boardWidthMm,
    height: params.boardHeightMm,
    nailDiameterMm: params.nailDiameterMm,
    labels: setup.labels ? { metrics: setup.labels.metrics, options: setup.labels.options } : null,
    titleSize: textBlockSize(setup.title),
    footerSize: textBlockSize([setup.footer]),
  };
}

export function drawPuzzleBoard(
  setup: BoardSetup,
  plan: BoardPlan,
  options: Partial<DrawingOptions> = {},
): BoardDrawing {
  const drawing = { ...DEFAULT_DRAWING, holeDiameterMm: setup.params.nailDiameterMm, ...options };
  const { boardWidthMm: w, boardHeightMm: h } = setup.params;
  const inset = drawing.lineInsetMm;
  const map = setup.params.blankBoard
    ? { strong: [], thin: [] }
    : boardMapLines(setup.file, setup.params.region, setup.projection, [
        inset,
        inset,
        w - inset,
        h - inset,
      ]);
  return drawBoard(
    {
      width: w,
      height: h,
      points: setup.points,
      plan,
      labelTexts: setup.labels?.texts ?? null,
      labelOptions: setup.labels?.options ?? null,
      title: setup.title,
      footer: setup.footer,
      scaleCaption: setup.texts.scaleCaption,
      map,
    },
    drawing,
  );
}
