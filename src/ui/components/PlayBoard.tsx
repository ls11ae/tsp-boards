// The board in play mode (roadmap 7.3): places and labels at a fixed screen size, whatever the
// board's millimetres; the view starts fitted to the places and can be zoomed (buttons, wheel,
// pinch) and panned (drag). Clicks pick the nearest place within a finger-sized radius.

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  labelCandidates,
  placeLabels,
  SEARCH_NODE_LIMIT,
  DEFAULT_LABELS,
  type LabelOptions,
} from '../../core/board/labels';
import { svgPathData } from '../../core/board/shapes';
import { measureText, textPath } from '../../core/board/text';
import { boardLabel, listName } from '../../core/data';
import type { Point } from '../../core/geometry';
import type { BoardModel } from '../board';
import { useT } from '../i18n';
import { useOverlay } from '../overlay';
import { playClick } from '../play';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';
import { MapLayers, Overlay } from './BoardMap';

/** Screen sizes in CSS pixels. */
const MARKER_PX = 7;
const LABEL_PX = 13;
const HIT_PX = 24;
/** A pointer that moves farther than this is a drag, not a click. */
const DRAG_PX = 6;

interface View {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The places' bounding box with room for labels, inside the board. */
function fitView(board: BoardModel, members: readonly number[]): View {
  const { widthMm: W, heightMm: H } = board.projection.board;
  const pts = members.length > 0 ? members.map((c) => board.points[c]!) : board.points;
  if (pts.length === 0) return { x: 0, y: 0, w: W, h: H };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = Math.max(30, 0.08 * Math.max(W, H));
  const x0 = Math.max(0, Math.min(...xs) - pad);
  const y0 = Math.max(0, Math.min(...ys) - pad);
  const x1 = Math.min(W, Math.max(...xs) + pad);
  const y1 = Math.min(H, Math.max(...ys) + pad);
  return { x: x0, y: y0, w: Math.max(40, x1 - x0), h: Math.max(40, y1 - y0) };
}

/** Zooms by `factor` (< 1: in) around the board point (cx, cy). */
function zoomAt(view: View, factor: number, cx: number, cy: number, maxW: number): View {
  const w = Math.min(maxW, Math.max(20, view.w * factor));
  const k = w / view.w;
  return { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w, h: view.h * k };
}

export function PlayBoard({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView | null;
}) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const play = useStore((s) => s.play);
  const labelLanguage = useStore((s) => s.params.labelLanguage);
  const showLabels = useStore((s) => s.params.labelSizeMm > 0);
  const members = useMemo(() => puzzle?.members ?? [], [puzzle?.members]);
  const { widthMm: W, heightMm: H } = board.projection.board;
  const maxW = Math.max(W, H) * 1.5;

  // The view resets to the places whenever the puzzle changes.
  const fitted = useMemo(() => fitView(board, members), [board, members]);
  const [view, setView] = useState<View>(fitted);
  const [seen, setSeen] = useState(fitted);
  if (seen !== fitted) {
    setSeen(fitted);
    setView(fitted);
  }

  // Pixels per board millimetre (the SVG shows the whole view box: "meet").
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pxPerMm = Math.max(1e-6, Math.min(size.w / view.w, size.h / view.h));
  // The area the fitted view shows ("meet" adds room on one axis), in board mm.
  const fitScale = Math.min(size.w / fitted.w, size.h / fitted.h);
  const viewArea = useMemo(() => {
    const w = Math.max(fitted.w, size.w / fitScale);
    const h = Math.max(fitted.h, size.h / fitScale);
    return { x: fitted.x - (w - fitted.w) / 2, y: fitted.y - (h - fitted.h) / 2, w, h };
  }, [fitted, size.w, size.h, fitScale]);
  const mm = (px: number) => px / pxPerMm;

  // Labels at screen size; recomputed in steps of 8 % of the scale.
  const labelMm = Math.pow(1.08, Math.round(Math.log(mm(LABEL_PX)) / Math.log(1.08)));
  const labels = useMemo(() => {
    if (!showLabels || members.length === 0) return [];
    const markerMm = (MARKER_PX / LABEL_PX) * labelMm;
    const options: LabelOptions = {
      ...DEFAULT_LABELS,
      sizeMm: labelMm,
      nailClearanceMm: markerMm * 1.3,
      gapMm: labelMm * 0.15,
      spacingMm: labelMm * 0.2,
      edgeMm: 0,
    };
    // Labels stay inside the area the view starts with (relative coordinates), so they do not
    // run off the screen there and do not jump while the player pans.
    const points = members.map((c): Point => {
      const [x, y] = board.points[c]!;
      return [x - viewArea.x, y - viewArea.y];
    });
    const texts = members.map((c) => boardLabel(board.pool[c]!, labelLanguage));
    const candidates = points.map((p, i) =>
      labelCandidates(p, measureText(texts[i]!, labelMm), options),
    );
    const placement = placeLabels({
      points,
      candidates,
      width: viewArea.w,
      height: viewArea.h,
      options,
      nodeLimit: SEARCH_NODE_LIMIT,
    });
    // Labels without a free spot at this zoom are left out (zooming in places them).
    return placement.choice.flatMap((choice, i) => {
      if (choice < 0) return [];
      const [x, y] = candidates[i]![choice]!.baseline;
      return [svgPathData(textPath(texts[i]!, x + viewArea.x, y + viewArea.y, labelMm), 2)];
    });
  }, [board, members, labelLanguage, labelMm, showLabels, viewArea]);

  // Zoom with the wheel around the pointer (non-passive, to keep the page from scrolling).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      setView((v) => zoomAt(v, Math.pow(1.0015, e.deltaY), p.x, p.y, maxW));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [maxW]);

  // Pointer gestures: drag pans, two pointers pinch-zoom, a short tap clicks.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; pinch: { dist: number; view: View } | null }>({
    moved: false,
    pinch: null,
  });
  const toBoard = (x: number, y: number) => {
    const m = svgRef.current?.getScreenCTM();
    return m ? new DOMPoint(x, y).matrixTransform(m.inverse()) : null;
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not an active pointer (e.g. a synthetic event): the gesture works without capture.
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: false, pinch: null };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        moved: true,
        pinch: { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), view },
      };
    }
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    const g = gesture.current;
    if (g.pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = toBoard((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      if (mid && dist > 0) setView(zoomAt(g.pinch.view, g.pinch.dist / dist, mid.x, mid.y, maxW));
      return;
    }
    const dx = now.x - last.x;
    const dy = now.y - last.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_PX) {
      // Small jitter: undo the update so a tap stays a tap.
      pointers.current.set(e.pointerId, last);
      return;
    }
    g.moved = true;
    setView((v) => ({ ...v, x: v.x - dx / pxPerMm, y: v.y - dy / pxPerMm }));
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const wasTap = pointers.current.size === 1 && !gesture.current.moved;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current.pinch = null;
    if (!wasTap || !puzzle) return;
    const p = toBoard(e.clientX, e.clientY);
    if (!p) return;
    let slot = -1;
    let nearest = mm(HIT_PX);
    members.forEach((c, s) => {
      const [x, y] = board.points[c]!;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < nearest) {
        nearest = d;
        slot = s;
      }
    });
    if (slot >= 0) playClick(puzzle, slot);
  };

  const overlay = useOverlay(board, puzzle);
  const revealed = play.revealed;
  const showOverlay = overlay && (revealed || play.solvedMs !== null);
  const at = (c: number) => board.points[c]!.map((v) => v.toFixed(2)).join(',');
  const solution = revealed && puzzle?.tour ? puzzle.tour.map(at).join(' ') : null;
  const path = puzzle ? play.state.path.map((s) => at(puzzle.members[s]!)).join(' ') : '';
  const visited = new Set(play.state.path);
  const r = mm(MARKER_PX);
  const zoomBy = (factor: number) =>
    setView((v) => zoomAt(v, factor, v.x + v.w / 2, v.y + v.h / 2, maxW));

  return (
    <div className="play-board" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="board"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={puzzle ? puzzle.members.map((c) => board.pool[c]!.name).join(', ') : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <MapLayers board={board} />
        {solution && <polygon className="solution-tour" points={solution} />}
        {showOverlay && <Overlay board={board} overlay={overlay} showRemoved={solution !== null} />}
        {path &&
          (play.state.closed ? (
            <polygon className={revealed ? 'play-path dashed' : 'play-path'} points={path} />
          ) : (
            <polyline className={revealed ? 'play-path dashed' : 'play-path'} points={path} />
          ))}
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
              {state === ' start' && <circle className="start-ring" cx={x} cy={y} r={r * 1.6} />}
            </g>
          );
        })}
      </svg>
      {showLabels && labels.length < members.length && (
        <p className="zoom-hint">{t.zoomForNames(members.length - labels.length)}</p>
      )}
      <div className="zoom-controls">
        <button type="button" onClick={() => zoomBy(0.7)} aria-label={t.zoomIn}>
          +
        </button>
        <button type="button" onClick={() => zoomBy(1 / 0.7)} aria-label={t.zoomOut}>
          −
        </button>
        <button type="button" onClick={() => setView(fitted)} aria-label={t.zoomFit}>
          ⤢
        </button>
      </div>
    </div>
  );
}
