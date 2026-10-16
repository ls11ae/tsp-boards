// A rotatable globe for world puzzles (roadmap 9.3): orthographic, clipped at the horizon, in
// screen pixels. Drag (mouse or one finger) turns it with versors, so the point under the
// pointer follows the pointer and nothing sticks at the poles; buttons, the wheel and two
// fingers zoom. Only places on the visible side can be picked; their labels are placed anew
// for every view. A flight follows a round trip leg by leg along the great circles and turns
// the globe with it.

import {
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
} from 'd3-geo';
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { Point } from '../../core/geometry';
import { mapLayers } from '../../core/region';
import type { BoardModel } from '../board';
import { useT } from '../i18n';
import { useStore } from '../store';
import { cartesian, delta, multiply, rotation, versor, type Rotation } from '../versor';

const MARKER_PX = 7;
const HIT_PX = 24;
const DRAG_PX = 6;
const LABEL_PX = 13;
const MAX_ZOOM = 12;
const NO_POINTS: readonly Point[] = [];
/** Height of the band for the buttons above the globe. */
const CONTROLS_PX = 48;
/** Flight speed in km per second, and the shortest leg time in seconds. */
const FLIGHT_KM_S = 4000;
const MIN_LEG_S = 0.5;
const EARTH_KM = 6371.0088;

export interface GlobePlace {
  /** Pool index. */
  readonly city: number;
  readonly label: string;
  readonly title: string;
  readonly className: string;
  /** A ring around the marker (marked places). */
  readonly ring?: boolean;
}

export interface GlobeRoute {
  /** Pool indices in order. */
  readonly cities: readonly number[];
  readonly closed: boolean;
  readonly className: string;
}

export interface Flight {
  readonly cities: readonly number[];
  /** A new key starts the flight again. */
  readonly key: number;
}

interface Gesture {
  readonly pointerId: number;
  readonly start: Point;
  moved: boolean;
  /** Drag: start rotation as versor and the point under the pointer. */
  readonly q0: ReturnType<typeof versor>;
  /** Inverse of the projection at the start rotation (the drag is measured against it). */
  readonly invert0: (p: Point) => [number, number] | null;
  readonly v0: ReturnType<typeof cartesian> | null;
  pinch: { readonly distance: number; readonly zoom: number } | null;
}

/** Legs of a route as great-circle line strings. */
function legs(lonLat: readonly Point[], cities: readonly number[], closed: boolean) {
  const out: [number, number][][] = [];
  for (let i = 1; i < cities.length; i++)
    out.push([[...lonLat[cities[i - 1]!]!], [...lonLat[cities[i]!]!]]);
  if (closed && cities.length > 2)
    out.push([[...lonLat[cities.at(-1)!]!], [...lonLat[cities[0]!]!]]);
  return out;
}

/** Greedy screen-size labels: right, left, above, below; bigger places first. */
function placeScreenLabels(
  items: readonly { readonly x: number; readonly y: number; readonly text: string }[],
  width: number,
  height: number,
): {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly anchor: 'start' | 'middle' | 'end';
}[] {
  const boxes: [number, number, number, number][] = items.map(({ x, y }) => [
    x - MARKER_PX,
    y - MARKER_PX,
    x + MARKER_PX,
    y + MARKER_PX,
  ]);
  type Anchor = 'start' | 'middle' | 'end';
  const out: { x: number; y: number; text: string; anchor: Anchor }[] = [];
  const free = (b: [number, number, number, number]) =>
    b[0] >= 2 &&
    b[1] >= 2 &&
    b[2] <= width - 2 &&
    b[3] <= height - 2 &&
    !boxes.some((o) => b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3]);
  for (const { x, y, text } of items) {
    const w = 0.56 * LABEL_PX * text.length;
    const h = LABEL_PX;
    const gap = MARKER_PX + 4;
    const options: [number, number, Anchor, [number, number, number, number]][] = [
      [x + gap, y + h * 0.35, 'start', [x + gap, y - h / 2, x + gap + w, y + h / 2]],
      [x - gap, y + h * 0.35, 'end', [x - gap - w, y - h / 2, x - gap, y + h / 2]],
      [x, y - gap - 2, 'middle', [x - w / 2, y - gap - h, x + w / 2, y - gap]],
      [x, y + gap + h - 2, 'middle', [x - w / 2, y + gap, x + w / 2, y + gap + h]],
    ];
    const pick = options.find((o) => free(o[3]));
    if (!pick) continue;
    boxes.push(pick[3]);
    out.push({ x: pick[0], y: pick[1], text, anchor: pick[2] });
  }
  return out;
}

export function Globe({
  className,
  board,
  places,
  routes,
  dots = [],
  onPick,
  flight = null,
  onFlightEnd,
  controls,
}: {
  readonly className: string;
  readonly board: BoardModel;
  readonly places: readonly GlobePlace[];
  readonly routes: readonly GlobeRoute[];
  /** Further pool cities as small dots (designer). */
  readonly dots?: readonly number[];
  readonly onPick?: (city: number) => void;
  readonly flight?: Flight | null;
  readonly onFlightEnd?: () => void;
  /** Extra controls in the corner (e.g. the switch between globe and map). */
  readonly controls?: ReactNode;
}) {
  const t = useT();
  const country = useStore((s) => s.country);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lonLat = board.sphere?.lonLat ?? NO_POINTS;
  const layers = useMemo(() => (country ? mapLayers(country) : null), [country]);

  // Start over the places' mean longitude, a little north (recomputed for other places only).
  const placesKey = places.map((p) => p.city).join(',');
  const centre = useMemo((): Rotation => {
    const ids = placesKey ? placesKey.split(',').map(Number) : [];
    if (ids.length === 0) return [-10, -30, 0];
    let x = 0;
    let y = 0;
    for (const c of ids) {
      const [lon] = lonLat[c]!;
      x += Math.cos((lon * Math.PI) / 180);
      y += Math.sin((lon * Math.PI) / 180);
    }
    return [-(Math.atan2(y, x) * 180) / Math.PI, -30, 0];
  }, [placesKey, lonLat]);
  const [rot, setRot] = useState<Rotation>(centre);
  const [zoom, setZoom] = useState(1);
  const [seen, setSeen] = useState(centre);
  if (seen !== centre) {
    setSeen(centre);
    setRot(centre);
  }

  const [size, setSize] = useState({ w: 600, h: 600 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // The controls take a band at the top; the globe sits below it.
  const band = CONTROLS_PX;
  const cx = size.w / 2;
  const cy = (size.h + band) / 2;
  const radius = (Math.min(size.w, size.h - band) / 2) * 0.96 * zoom;
  const projection = useMemo(
    () =>
      geoOrthographic()
        .rotate([...rot])
        .translate([cx, cy])
        .scale(radius)
        .clipAngle(90)
        .precision(0.4),
    [rot, cx, cy, radius],
  );
  const path = useMemo(() => geoPath(projection), [projection]);
  const centreLonLat: [number, number] = [-rot[0], -rot[1]];
  const visible = (c: number) =>
    geoDistance(centreLonLat, [...lonLat[c]!] as [number, number]) < Math.PI / 2 - 0.02;
  const screen = (c: number) => projection([...lonLat[c]!] as [number, number]) as Point | null;

  // --- flight -----------------------------------------------------------------------------
  const [flown, setFlown] = useState<{ leg: number; t: number } | null>(null);
  useEffect(() => {
    if (!flight || flight.cities.length < 2) return;
    const cities = flight.cities;
    const n = cities.length;
    const times = cities.map((c, i) => {
      const next = cities[(i + 1) % n]!;
      const km =
        geoDistance([...lonLat[c]!] as [number, number], [...lonLat[next]!] as [number, number]) *
        EARTH_KM;
      return Math.max(MIN_LEG_S, km / FLIGHT_KM_S) * 1000;
    });
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      let elapsed = now - start;
      let leg = 0;
      while (leg < n && elapsed > times[leg]!) {
        elapsed -= times[leg]!;
        leg++;
      }
      if (leg >= n) {
        setFlown(null);
        onFlightEnd?.();
        return;
      }
      const tt = elapsed / times[leg]!;
      const a = lonLat[cities[leg]!]!;
      const b = lonLat[cities[(leg + 1) % n]!]!;
      const [lon, lat] = geoInterpolate([...a] as [number, number], [...b] as [number, number])(tt);
      setFlown({ leg, t: tt });
      setRot([-lon, -Math.max(-60, Math.min(60, lat)), 0]);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // A new key starts a new flight.
  }, [flight?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- gestures ---------------------------------------------------------------------------
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const startDrag = (pointerId: number, p: Point): Gesture => {
    // A projection of its own: d3 projections are mutable, the rendered one must stay as it is.
    const fixed = geoOrthographic()
      .rotate([...rot])
      .translate([cx, cy])
      .scale(radius)
      .clipAngle(90);
    const invert0 = (q: Point) => {
      const r = fixed.invert?.([q[0], q[1]]);
      return r && Number.isFinite(r[0]) && Number.isFinite(r[1]) ? r : null;
    };
    const inv = invert0(p);
    return {
      pointerId,
      start: p,
      moved: false,
      q0: versor(rot),
      invert0,
      v0: inv ? cartesian(inv) : null,
      pinch: null,
    };
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (flight && flown) return;
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers cannot be captured.
    }
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) gesture.current = startDrag(e.pointerId, p);
    else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = { distance: Math.hypot(a![0] - b![0], a![1] - b![1]), zoom };
      gesture.current.moved = true;
    }
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (g.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a![0] - b![0], a![1] - b![1]);
      setZoom(Math.max(1, Math.min(MAX_ZOOM, (g.pinch.zoom * d) / Math.max(1, g.pinch.distance))));
      return;
    }
    if (e.pointerId !== g.pointerId) return;
    if (!g.moved && Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) < DRAG_PX) return;
    g.moved = true;
    if (!g.v0) return;
    const inv = g.invert0(p);
    if (!inv) return;
    const q1 = multiply(g.q0, delta(g.v0, cartesian(inv)));
    setRot(rotation(q1));
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    const tap = pointers.current.size === 1 && g !== null && !g.moved;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    if (!tap || !onPick) return;
    const p = local(e);
    let best = -1;
    let nearest = HIT_PX;
    for (const c of [...places.map((pl) => pl.city), ...dots]) {
      if (!visible(c)) continue;
      const s = screen(c);
      if (!s) continue;
      const d = Math.hypot(s[0] - p[0], s[1] - p[1]);
      if (d < nearest) {
        nearest = d;
        best = c;
      }
    }
    if (best >= 0) onPick(best);
  };
  // Wheel zoom (non-passive, so the page does not scroll).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(1, Math.min(MAX_ZOOM, z * Math.exp(-e.deltaY * 0.0015))));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // --- drawing ----------------------------------------------------------------------------
  const shownPlaces = places.filter((p) => visible(p.city));
  const labels = placeScreenLabels(
    shownPlaces.flatMap((p) => {
      const s = screen(p.city);
      return s ? [{ x: s[0], y: s[1], text: p.label }] : [];
    }),
    size.w,
    size.h,
  );
  const routePath = (r: GlobeRoute) =>
    path({ type: 'MultiLineString', coordinates: legs(lonLat, r.cities, r.closed) }) ?? '';
  let flightPath = '';
  let marker: Point | null = null;
  if (flight && flown) {
    const cities = flight.cities;
    const n = cities.length;
    const done = legs(lonLat, cities.slice(0, flown.leg + 1), false);
    const a = lonLat[cities[flown.leg]!]!;
    const b = lonLat[cities[(flown.leg + 1) % n]!]!;
    const here = geoInterpolate([...a] as [number, number], [...b] as [number, number])(flown.t);
    done.push([[...a], here]);
    flightPath = path({ type: 'MultiLineString', coordinates: done }) ?? '';
    marker = projection(here);
  }
  const layer = (o: GeoPermissibleObjects | undefined) => (o ? (path(o) ?? '') : '');

  return (
    <div className={className} ref={wrapRef}>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        role="img"
        aria-label={t.globeLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <path className="globe-sea" d={layer({ type: 'Sphere' })} />
        <path className="globe-graticule" d={layer(geoGraticule10())} />
        <path className="globe-context" d={layer(layers?.neighbors)} />
        <path className="globe-land" d={layer(layers?.country)} />
        <path className="globe-borders" d={layer(layers?.states)} />
        {dots
          .filter((c) => visible(c))
          .map((c) => {
            const s = screen(c);
            return s ? (
              <circle key={`d${c}`} className="globe-dot" cx={s[0]} cy={s[1]} r={2.5} />
            ) : null;
          })}
        {routes.map((r) => (
          <path key={r.className} className={r.className} d={routePath(r)} />
        ))}
        {flightPath && <path className="flight-path" d={flightPath} />}
        {shownPlaces.map((p) => {
          const s = screen(p.city);
          if (!s) return null;
          return (
            <g key={p.city} className={`play-place ${p.className}`}>
              <title>{p.title}</title>
              <circle cx={s[0]} cy={s[1]} r={MARKER_PX} />
              {p.ring && <circle className="mark-ring" cx={s[0]} cy={s[1]} r={MARKER_PX * 1.55} />}
            </g>
          );
        })}
        <g className="globe-labels">
          {labels.map((l, i) => (
            <text key={i} x={l.x} y={l.y} textAnchor={l.anchor}>
              {l.text}
            </text>
          ))}
        </g>
        {marker && <circle className="flight-marker" cx={marker[0]} cy={marker[1]} r={6} />}
      </svg>
      {controls && <div className="view-switch">{controls}</div>}
      <div className="zoom-controls">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.4))}
          aria-label={t.zoomIn}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(1, z / 1.4))}
          aria-label={t.zoomOut}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setRot(centre);
          }}
          aria-label={t.zoomFit}
        >
          ⤢
        </button>
      </div>
    </div>
  );
}
