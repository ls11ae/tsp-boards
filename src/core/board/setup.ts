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
import {
  EXPORT_NODE_LIMIT,
  labelCandidates,
  labelOptions,
  placeLabels,
  type Box,
  type LabelOptions,
} from './labels';
import { layoutLegend, type LegendLayout } from './legend';
import { logoHeight, type Logo } from './logo';
import { boardMapLines } from './map-lines';
import type { BoardPlan, PlanInput } from './plan';
import { FONT_METRICS, measureText, type TextMetrics } from './text';
import { BOARD_TEXTS, type BoardTexts } from './texts';
import type { BoardExtras } from '../puzzle-file';

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
    /** Metrics per slot if that slot is the start: the label with its caption below. */
    readonly startMetrics?: readonly TextMetrics[];
  } | null;
  /** "Start und Ziel" under the preferred start nail's label, if that nail is the start. */
  readonly startCaption: StartCaption | null;
  readonly texts: BoardTexts;
  readonly title: readonly TextLine[];
  readonly footer: TextLine;
  /** GeoNames ids of the cities that are not in the pool (data version mismatch). */
  readonly missing: readonly number[];
  /** Marked places (slot order): an engraved ring around the nail. */
  readonly highlight: readonly boolean[];
  /** Ring radii around marked nails, mm. */
  readonly ring: { readonly outerMm: number; readonly innerMm: number };
  /** A logo instead of the text label (slot order; null: the text label). */
  readonly labelLogos: readonly (Logo | null)[];
  /** Legend box at the bottom of the board (null: none; the footer is its last line). */
  readonly legend: LegendLayout | null;
  /** Preferred start nail (slot; null: the planner's choice). */
  readonly preferredStart: number | null;
}

/** The second line under a preferred start nail's label (roadmap 9.14). */
export interface StartCaption {
  readonly slot: number;
  readonly text: string;
  readonly sizeMm: number;
  /** Baseline of the caption below the label's baseline, mm. */
  readonly offsetMm: number;
  /** Width of the label or logo above the caption, mm. */
  readonly labelWidthMm: number;
}

/** The caption under a start label, relative to the label size. */
export const START_CAPTION_SCALE = 0.7;

/** Label metrics with a caption line below (left-aligned), and the caption's baseline offset. */
export function captionMetrics(
  label: TextMetrics,
  caption: string,
  sizeMm: number,
): { metrics: TextMetrics; offsetMm: number } {
  const c = measureText(caption, sizeMm);
  const offsetMm = label.inkBottom + 0.35 * sizeMm - c.inkTop;
  return {
    metrics: {
      width: Math.max(label.width, c.width),
      inkLeft: Math.min(label.inkLeft, c.inkLeft),
      inkRight: Math.max(label.inkRight, c.inkRight),
      inkTop: label.inkTop,
      inkBottom: offsetMm + c.inkBottom,
    },
    offsetMm,
  };
}

export const TITLE_SIZE_MM = 16;
export const SUBTITLE_SIZE_MM = 6;
export const FOOTER_SIZE_MM = 3.5;
/** Distance of title, footer, legend and scale from the board edge (plan default), mm. */
export const BOARD_EDGE_MM = 5;
/** Widths tried for a logo instead of a label, largest first, mm (larger would dominate the map). */
export const LOGO_WIDTHS_MM = [30, 26, 22, 20] as const;

/** Board extras beyond the puzzle (roadmap 9.1). */
export interface SetupExtras {
  /** Legend and preferred start nail (start nail as pool index). */
  readonly board?: BoardExtras | null;
  /** Logos instead of the text label, by pool index (from a local file, never stored). */
  readonly logos?: ReadonlyMap<number, Logo>;
  /** Large logo in the legend box. */
  readonly legendLogo?: Logo | null;
}

/** Ink box of a logo used as a label, vertically centred on the nail at side positions. */
export function logoMetrics(logo: Logo, width: number, sizeMm: number): TextMetrics {
  const h = logoHeight(logo, width);
  const top = -(h / 2 + (FONT_METRICS.capHeight * sizeMm) / 2);
  return { width, inkLeft: 0, inkRight: width, inkTop: top, inkBottom: top + h };
}

/** Board setup for the cities with the given GeoNames ids. */
export function boardSetup(
  file: CountryFile,
  params: PuzzleParams,
  cityIds: readonly number[],
  /** Puzzle title for the board (default: the region's name). */
  title = '',
  /** Pool to take the cities from (default: the region's towns); e.g. a place list. */
  poolCities: readonly City[] | null = null,
  extras: SetupExtras = {},
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
  const { boardWidthMm: width, boardHeightMm: height } = params;
  const footer: TextLine = { text: texts.attribution, sizeMm: FOOTER_SIZE_MM };
  const legendEntries = extras.board?.legend ?? [];
  const legend =
    legendEntries.length > 0 || extras.legendLogo
      ? layoutLegend(
          legendEntries,
          extras.legendLogo ?? null,
          footer.text,
          width - 2 * BOARD_EDGE_MM,
        )
      : null;
  const legendBox: Box | null = legend
    ? [
        BOARD_EDGE_MM,
        height - BOARD_EDGE_MM - legend.height,
        width - BOARD_EDGE_MM,
        height - BOARD_EDGE_MM,
      ]
    : null;
  let labels: BoardSetup['labels'] = null;
  const labelLogos: (Logo | null)[] = cities.map(() => null);
  if (params.labelSizeMm > 0) {
    const labelTexts = cities.map((c) => boardLabel(c, lang));
    const options = labelOptions(params.labelSizeMm, params.nailDiameterMm);
    const metrics = labelTexts.map((t) => measureText(t, params.labelSizeMm));
    // A logo replaces a label if it fits at one of the widths (largest first).
    members.forEach((poolIndex, slot) => {
      const logo = extras.logos?.get(poolIndex);
      if (!logo) return;
      for (const w of LOGO_WIDTHS_MM) {
        const trial = metrics.map((m, i) =>
          i === slot ? logoMetrics(logo, w, params.labelSizeMm) : m,
        );
        const placement = placeLabels({
          points,
          candidates: points.map((p, i) => labelCandidates(p, trial[i]!, options)),
          obstacles: legendBox
            ? [
                {
                  kind: 'polygon',
                  points: [
                    [legendBox[0], legendBox[1]],
                    [legendBox[2], legendBox[1]],
                    [legendBox[2], legendBox[3]],
                    [legendBox[0], legendBox[3]],
                  ],
                },
              ]
            : [],
          width,
          height,
          options,
          nodeLimit: EXPORT_NODE_LIMIT,
        });
        if (placement.complete) {
          metrics[slot] = trial[slot]!;
          labelLogos[slot] = logo;
          return;
        }
      }
    });
    labels = { texts: labelTexts, metrics, options };
  }
  const clearance = labels?.options.nailClearanceMm ?? params.nailDiameterMm / 2 + 2.5;
  const startPool = extras.board?.startPlace ?? null;
  const preferred = startPool === null ? -1 : members.indexOf(startPool);
  // The place the board celebrates as its start nail says so, as on the poster: "Start und
  // Ziel" under its label or logo.
  let startCaption: StartCaption | null = null;
  if (labels && preferred >= 0) {
    const sizeMm = params.labelSizeMm * START_CAPTION_SCALE;
    const label = labels.metrics[preferred]!;
    const { metrics, offsetMm } = captionMetrics(label, texts.startFinish, sizeMm);
    labels = {
      ...labels,
      startMetrics: labels.metrics.map((m, i) => (i === preferred ? metrics : m)),
    };
    startCaption = {
      slot: preferred,
      text: texts.startFinish,
      sizeMm,
      offsetMm,
      labelWidthMm: label.inkRight - label.inkLeft,
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
    startCaption,
    texts,
    title: [
      { text: title || regionName, sizeMm: TITLE_SIZE_MM },
      // A place list may hold alliances and points, not only towns: "Orte".
      { text: texts.subtitle(cities.length, poolCities !== null), sizeMm: SUBTITLE_SIZE_MM },
    ],
    footer,
    missing: cityIds.filter((id) => !index.has(id)),
    highlight: cities.map((c) => c.highlight === true),
    ring: { outerMm: clearance, innerMm: clearance - 0.8 },
    labelLogos,
    legend,
    preferredStart: preferred >= 0 ? preferred : null,
  };
}

/** The legend's box on the board (bottom, full width inside the edge). */
export function legendBox(setup: BoardSetup): Box | null {
  const { legend } = setup;
  if (!legend) return null;
  const { boardWidthMm: w, boardHeightMm: h } = setup.params;
  return [BOARD_EDGE_MM, h - BOARD_EDGE_MM - legend.height, w - BOARD_EDGE_MM, h - BOARD_EDGE_MM];
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
    labels: setup.labels
      ? {
          metrics: setup.labels.metrics,
          options: setup.labels.options,
          ...(setup.labels.startMetrics ? { startMetrics: setup.labels.startMetrics } : {}),
        }
      : null,
    titleSize: textBlockSize(setup.title),
    // With a legend, the footer is the legend's last line.
    footerSize: setup.legend ? null : textBlockSize([setup.footer]),
    reserved: legendBox(setup),
    preferredStart: setup.preferredStart,
    edgeMm: BOARD_EDGE_MM,
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
      footer: setup.legend ? null : setup.footer,
      scaleCaption: setup.texts.scaleCaption,
      map,
      highlight: setup.highlight,
      ring: setup.ring,
      labelLogos: setup.labelLogos,
      legend: setup.legend,
      startCaption: setup.startCaption,
    },
    drawing,
  );
}
