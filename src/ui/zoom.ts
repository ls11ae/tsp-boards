// A zoomable board view in play mode (roadmap 7.3; incremental play since 9.6): places and
// labels at a fixed screen size, whatever the board's millimetres; the view starts fitted and
// can be zoomed (buttons, wheel, pinch) and panned (drag); a short tap is a click at a board
// point. Labels are placed at screen size inside the area the view starts with.

import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import {
  labelCandidates,
  placeLabels,
  SEARCH_NODE_LIMIT,
  DEFAULT_LABELS,
  type Box,
  type LabelOptions,
  type Obstacle,
} from '../core/board/labels';
import { svgPathData } from '../core/board/shapes';
import { measureText, textPath } from '../core/board/text';
import type { Point } from '../core/geometry';

/** Screen sizes in CSS pixels. */
export const MARKER_PX = 7;
export const LABEL_PX = 13;
/** Clicks pick the nearest place within a finger-sized radius. */
export const HIT_PX = 24;
/** A pointer that moves farther than this is a drag, not a click. */
const DRAG_PX = 6;

export interface View {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The points' bounding box with `padMm` around it, inside the board (W × H mm). */
export function fitBox(points: readonly Point[], W: number, H: number, padMm: number): View {
  if (points.length === 0) return { x: 0, y: 0, w: W, h: H };
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.max(0, Math.min(...xs) - padMm);
  const y0 = Math.max(0, Math.min(...ys) - padMm);
  const x1 = Math.min(W, Math.max(...xs) + padMm);
  const y1 = Math.min(H, Math.max(...ys) + padMm);
  return { x: x0, y: y0, w: Math.max(40, x1 - x0), h: Math.max(40, y1 - y0) };
}

/** Zooms by `factor` (< 1: in) around the board point (cx, cy). */
export function zoomAt(view: View, factor: number, cx: number, cy: number, maxW: number): View {
  const w = Math.min(maxW, Math.max(20, view.w * factor));
  const k = w / view.w;
  return { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w, h: view.h * k };
}

export interface ZoomView {
  readonly wrapRef: RefObject<HTMLDivElement | null>;
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly view: View;
  readonly fitted: View;
  /** The area the fitted view shows ("meet" adds room on one axis), in board mm. */
  readonly viewArea: View;
  /** Board millimetres of `px` screen pixels at the current zoom. */
  readonly mm: (px: number) => number;
  readonly zoomBy: (factor: number) => void;
  readonly fit: () => void;
  readonly handlers: {
    readonly onPointerDown: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerMove: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerUp: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerCancel: (e: PointerEvent<SVGSVGElement>) => void;
  };
}

/**
 * The view of a play board. It resets to `fitted` whenever that changes (a new puzzle); `onTap`
 * gets the board point of a tap and the hit radius in board mm.
 */
export function useZoomView(
  fitted: View,
  maxW: number,
  onTap: (p: Point, hitMm: number) => void,
): ZoomView {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
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
  const fitScale = Math.min(size.w / fitted.w, size.h / fitted.h);
  const viewArea = useMemo(() => {
    const w = Math.max(fitted.w, size.w / fitScale);
    const h = Math.max(fitted.h, size.h / fitScale);
    return { x: fitted.x - (w - fitted.w) / 2, y: fitted.y - (h - fitted.h) / 2, w, h };
  }, [fitted, size.w, size.h, fitScale]);
  const mm = (px: number) => px / pxPerMm;

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
    if (!wasTap) return;
    const p = toBoard(e.clientX, e.clientY);
    if (p) onTap([p.x, p.y], mm(HIT_PX));
  };

  return {
    wrapRef,
    svgRef,
    view,
    fitted,
    viewArea,
    mm,
    zoomBy: (factor) => setView((v) => zoomAt(v, factor, v.x + v.w / 2, v.y + v.h / 2, maxW)),
    fit: () => setView(fitted),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

/** Label size in board mm for the current zoom (`mm` of ZoomView), in steps of 8 % (so labels
 * are not redone at every wheel tick). */
export function labelSizeMm(mm: (px: number) => number): number {
  return Math.pow(1.08, Math.round(Math.log(mm(LABEL_PX)) / Math.log(1.08)));
}

/** A label at screen size: SVG path data and its ink box (board mm). */
export interface ScreenLabel {
  readonly d: string;
  readonly box: Box;
}

/**
 * Labels at screen size, or null where no free spot is left at this zoom (zooming in places
 * it). They stay inside `area` (the area the view starts with), so they do not run off the
 * screen there and do not jump while the player pans; `obstacles` (board mm) stay free, e.g.
 * the places and labels of the puzzle under the names of the surrounding towns.
 */
export function screenLabels(
  points: readonly Point[],
  texts: readonly string[],
  labelMm: number,
  area: View,
  obstacles: readonly Obstacle[] = [],
): (ScreenLabel | null)[] {
  if (points.length === 0) return [];
  const markerMm = (MARKER_PX / LABEL_PX) * labelMm;
  const options: LabelOptions = {
    ...DEFAULT_LABELS,
    sizeMm: labelMm,
    nailClearanceMm: markerMm * 1.3,
    gapMm: labelMm * 0.15,
    spacingMm: labelMm * 0.2,
    edgeMm: 0,
  };
  const shift = (p: Point): Point => [p[0] - area.x, p[1] - area.y];
  const relative = points.map(shift);
  const candidates = relative.map((p, i) =>
    labelCandidates(p, measureText(texts[i]!, labelMm), options),
  );
  const placement = placeLabels({
    points: relative,
    candidates,
    obstacles: obstacles.map((o): Obstacle =>
      o.kind === 'circle'
        ? { kind: 'circle', centre: shift(o.centre), radius: o.radius }
        : { kind: 'polygon', points: o.points.map(shift) },
    ),
    width: area.w,
    height: area.h,
    options,
    nodeLimit: SEARCH_NODE_LIMIT,
  });
  return placement.choice.map((choice, i) => {
    if (choice < 0) return null;
    const c = candidates[i]![choice]!;
    const [x, y] = c.baseline;
    const [x0, y0, x1, y1] = c.box;
    return {
      d: svgPathData(textPath(texts[i]!, x + area.x, y + area.y, labelMm), 2),
      box: [x0 + area.x, y0 + area.y, x1 + area.x, y1 + area.y],
    };
  });
}
