// The board in play mode (roadmap 7.3): places and labels at a fixed screen size, whatever the
// board's millimetres; the view starts fitted to the places and can be zoomed (buttons, wheel,
// pinch) and panned (drag). Clicks pick the nearest place within a finger-sized radius.
// City-scale puzzles (roadmap 9.8) show the surrounding towns lightly, as the map has no
// municipal borders.

import { useMemo, type CSSProperties } from 'react';
import type { Obstacle } from '../../core/board/labels';
import { boardLabel, listName, type CountryFile } from '../../core/data';
import type { Point } from '../../core/geometry';
import { routePath, townsById, type BoardModel } from '../board';
import { ViewSwitch } from './WorldGlobe';
import { useT } from '../i18n';
import { useOverlay } from '../overlay';
import { playClick } from '../play';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';
import {
  fitBox,
  HIT_PX,
  LABEL_PX,
  MIN_VIEW_MM,
  labelSizeMm,
  MARKER_PX,
  screenLabels,
  useZoomView,
  type View,
} from '../zoom';
import { MapLayers, Overlay } from './BoardMap';
import { ZoomControls } from './ZoomControls';

/**
 * The places' bounding box with room for labels, inside the board. World maps show the whole
 * map: great-circle legs pass near the poles and leave the map at its edges.
 */
function fitView(board: BoardModel, members: readonly number[]): View {
  const { widthMm: W, heightMm: H } = board.projection.board;
  const pts = members.length > 0 ? members.map((c) => board.points[c]!) : board.points;
  if (pts.length === 0 || board.sphere) return { x: 0, y: 0, w: W, h: H };
  // A small cluster (a city-scale puzzle on a state's board) gets a margin to its size.
  const span = Math.max(
    Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])),
    Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])),
  );
  return fitBox(pts, W, H, Math.min(Math.max(30, 0.08 * Math.max(W, H)), Math.max(15, 0.2 * span)));
}

/** Views narrower than this show the surrounding towns, km. */
const CONTEXT_KM = 200;
/** Surrounding towns with at least this population get a dot, and the larger ones a name. */
const CONTEXT_DOT_POP = 20_000;
const CONTEXT_NAME_POP = 50_000;
/** Towns this close to a place of the puzzle are left out (e.g. the city of its districts). */
const CONTEXT_CLEAR_KM = 3;

interface ContextTown {
  readonly point: Point;
  readonly label: string;
  readonly named: boolean;
}

/** The country's towns in the view around a city-scale puzzle (not its own places). */
function contextTowns(
  country: CountryFile | null,
  board: BoardModel,
  members: readonly number[],
  area: View,
): ContextTown[] {
  const kmPerMm = 1 / board.projection.mmPerKm;
  if (!country || board.sphere || area.w * kmPerMm > CONTEXT_KM || members.length === 0) return [];
  const own = new Set(members.map((c) => board.pool[c]!.id));
  const places = members.map((c) => board.points[c]!);
  const clear = CONTEXT_CLEAR_KM / kmPerMm;
  const out: ContextTown[] = [];
  for (const town of townsById(country).values()) {
    if (town.pop < CONTEXT_DOT_POP || own.has(town.id)) continue;
    const p = board.projection.project(town.lon, town.lat);
    if (p[0] < area.x || p[0] > area.x + area.w || p[1] < area.y || p[1] > area.y + area.h)
      continue;
    if (places.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < clear)) continue;
    out.push({ point: p, label: town.label, named: town.pop >= CONTEXT_NAME_POP });
  }
  return out;
}

export function PlayBoard({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView | null;
}) {
  const t = useT();
  const play = useStore((s) => s.play);
  const labelLanguage = useStore((s) => s.params.labelLanguage);
  const country = useStore((s) => s.country);
  const showLabels = useStore((s) => s.params.labelSizeMm > 0);
  const members = useMemo(() => puzzle?.members ?? [], [puzzle?.members]);
  const { widthMm: W, heightMm: H } = board.projection.board;

  // The view resets to the places whenever the puzzle changes.
  const fitted = useMemo(() => fitView(board, members), [board, members]);
  const { wrapRef, svgRef, view, viewArea, mm, zoomBy, fit, handlers } = useZoomView(
    fitted,
    Math.max(W, H) * 1.5,
    ([px, py], hitMm, touch, current) => {
      if (!puzzle) return;
      const near = members
        .map((c, slot) => ({
          slot,
          d: Math.hypot(board.points[c]![0] - px, board.points[c]![1] - py),
        }))
        .filter((x) => x.d < hitMm)
        .sort((a, b) => a.d - b.d);
      if (near.length === 0) return;
      // A finger between two places about as near: zoom in around the tap until they are a
      // finger apart, instead of guessing (roadmap 9.10). A mouse picks the nearest place.
      const ambiguous = near.length >= 2 && near[1]!.d - near[0]!.d < hitMm / 2;
      if (touch && ambiguous && current.width > MIN_VIEW_MM * 1.05) {
        const a = board.points[members[near[0]!.slot]!]!;
        const b = board.points[members[near[1]!.slot]!]!;
        const apartPx = Math.hypot(a[0] - b[0], a[1] - b[1]) * current.pxPerMm;
        current.zoomAround(Math.min(0.6, Math.max(0.15, apartPx / (2.2 * HIT_PX))), [px, py]);
        return;
      }
      playClick(puzzle, near[0]!.slot);
    },
  );

  // Labels at screen size; recomputed in steps of 8 % of the scale.
  const labelMm = labelSizeMm(mm);
  const placed = useMemo(
    () =>
      showLabels
        ? screenLabels(
            members.map((c) => board.points[c]!),
            members.map((c) => boardLabel(board.pool[c]!, labelLanguage)),
            labelMm,
            viewArea,
          ).filter((l) => l !== null)
        : [],
    [board, members, labelLanguage, labelMm, showLabels, viewArea],
  );
  const labels = placed.map((l) => l.d);

  // The surrounding towns of a city-scale puzzle: light dots, names where there is room (they
  // keep clear of the puzzle's places and names).
  const context = useMemo(
    () => contextTowns(country, board, members, viewArea),
    [country, board, members, viewArea],
  );
  const contextLabels = useMemo(() => {
    const named = context.filter((t) => t.named);
    if (!showLabels || named.length === 0) return [];
    const markerMm = (MARKER_PX / LABEL_PX) * labelMm;
    const obstacles: Obstacle[] = [
      ...members.map((c): Obstacle => ({
        kind: 'circle',
        centre: board.points[c]!,
        radius: markerMm * 1.4,
      })),
      ...placed.map(({ box: [x0, y0, x1, y1] }): Obstacle => ({
        kind: 'polygon',
        points: [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ],
      })),
    ];
    return screenLabels(
      named.map((t) => t.point),
      named.map((t) => t.label),
      labelMm * 0.8,
      viewArea,
      obstacles,
    ).flatMap((l) => (l ? [l.d] : []));
  }, [context, showLabels, labelMm, members, board, placed, viewArea]);

  const overlay = useOverlay(board, puzzle);
  const revealed = play.revealed;
  const showOverlay = overlay && (revealed || play.solvedMs !== null);
  const solution = revealed && puzzle?.tour ? routePath(board, puzzle.tour, true) : null;
  // While a comparison is drawn next to the solution, the own tour would be a third one
  // (roadmap 9.6); after solving without the solution shown it is the optimum and stays.
  const path =
    puzzle && !(showOverlay && solution)
      ? routePath(
          board,
          play.state.path.map((s) => puzzle.members[s]!),
          play.state.closed,
        )
      : '';
  const visited = new Set(play.state.path);
  const r = mm(MARKER_PX);

  return (
    <div
      className="play-board"
      ref={wrapRef}
      style={{ '--view-aspect': fitted.w / fitted.h } as CSSProperties}
    >
      <svg
        ref={svgRef}
        className="board"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={puzzle ? puzzle.members.map((c) => board.pool[c]!.name).join(', ') : undefined}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
      >
        <MapLayers board={board} />
        {context.length > 0 && (
          <g className="context-towns" aria-hidden="true">
            {context.map((town, i) => (
              <circle key={i} cx={town.point[0]} cy={town.point[1]} r={mm(2.2)} />
            ))}
            {contextLabels.map((d, i) => (
              <path key={`l${i}`} className="context-label" d={d} />
            ))}
          </g>
        )}
        {solution && <path className="solution-tour" d={solution} />}
        {showOverlay && <Overlay board={board} overlay={overlay} showRemoved={solution !== null} />}
        {path && <path className={revealed ? 'play-path dashed' : 'play-path'} d={path} />}
        <g className="play-labels">
          {labels.map((d, i) => (
            <path key={i} className="play-label" d={d} />
          ))}
        </g>
        {members.map((c, slot) => {
          const [x, y] = board.points[c]!;
          const city = board.pool[c]!;
          const state =
            play.state.path[0] === slot ? ' start' : visited.has(slot) ? ' visited' : '';
          return (
            <g key={c} className={`play-place${state}`}>
              <title>{listName(city, labelLanguage)}</title>
              <circle cx={x} cy={y} r={r} />
              {city.highlight && <circle className="mark-ring" cx={x} cy={y} r={r * 1.55} />}
              {state === ' start' && <circle className="start-ring" cx={x} cy={y} r={r * 1.9} />}
            </g>
          );
        })}
      </svg>
      {showLabels && labels.length < members.length && (
        <p className="zoom-hint">{t.zoomForNames(members.length - labels.length)}</p>
      )}
      {board.sphere && (
        <div className="view-switch">
          <ViewSwitch />
        </div>
      )}
      <ZoomControls zoomBy={zoomBy} fit={fit} />
    </div>
  );
}
