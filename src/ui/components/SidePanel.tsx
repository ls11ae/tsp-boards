import { lazy, Suspense, useMemo } from 'react';
import { Instance } from '../../core/instance';
import { tourMetrics } from '../../core/metrics';
import type { Evaluation } from '../../core/search/search';
import type { BoardModel } from '../board';
import { clearMarks, showCandidate } from '../controller';
import { useFormat, useT } from '../i18n';
import type { PuzzleView } from '../puzzle';
import { useStore, type RunError } from '../store';
import { distance } from '../../core/geometry';
import { ExportPanel } from './ExportPanel';
import { FixedAnalysis } from './PlacesPanel';
import { OverlayPicker } from './OverlayPicker';

// The teaching mode loads on demand (roadmap 7.6).
const TeachingPanel = lazy(() =>
  import('./TeachingPanel').then((m) => ({ default: m.TeachingPanel })),
);

function SearchStatus() {
  const t = useT();
  const fmt = useFormat();
  const run = useStore((s) => s.run);
  const p = run.progress;
  const errorText = (e: RunError): string => {
    switch (e.kind) {
      case 'too-few':
        return t.tooFew(fmt.integer(e.placed), fmt.integer(e.n));
      case 'pin-conflict':
        return t.pinConflict(e.names);
      case 'pin-labels':
        return t.pinLabels(e.names);
      case 'group-size':
        return t.groupSize(fmt.integer(e.min), fmt.integer(e.max));
      case 'group-short':
        return t.groupShort(e.names);
      case 'group-pins':
        return t.groupPins(e.names);
      default:
        return e.message;
    }
  };
  const label = {
    idle: t.idle,
    running: t.running,
    done: t.done,
    stopped: t.stopped,
    error: t.failed,
  }[run.status];
  return (
    <section>
      <h2>{t.search}</h2>
      <p className={`status status-${run.status}`}>{label}</p>
      {run.error && <p className="error">{errorText(run.error)}</p>}
      {p && (
        <>
          <progress value={p.iteration} max={p.iterations} />
          <p className="hint">{t.progress(fmt.integer(p.iteration), fmt.integer(p.iterations))}</p>
          <dl className="metrics">
            <dt>{t.evaluations}</dt>
            <dd>{fmt.integer(p.stats.evaluations)}</dd>
            <dt>{t.exactChecks}</dt>
            <dd>{fmt.integer(p.stats.level2)}</dd>
            <dt>{t.temperature}</dt>
            <dd>{fmt.number(p.temperature, 4)}</dd>
          </dl>
        </>
      )}
    </section>
  );
}

function PuzzleMetrics({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
}) {
  const t = useT();
  const fmt = useFormat();
  const showTour = useStore((s) => s.showTour);
  const setShowTour = useStore((s) => s.setShowTour);
  const purpose = useStore((s) => s.doc.purpose);
  const e = puzzle.evaluation;
  const v = puzzle.verification;
  const exact = v?.status === 'done' ? v.verification : null;
  const mm = (um: number) => fmt.number(um / 1000, 2);
  const shownLabel = {
    current: t.showCurrent,
    best: t.showBest,
    candidate: t.showCandidate(String(puzzle.rank ?? '?')),
    loaded: t.showLoaded,
  }[puzzle.source];

  const digital = purpose === 'digital';
  const km = (um: number) => fmt.number(um / 1000 / board.projection.mmPerKm, 1);
  let gap: string | null = null;
  if (exact?.string && digital) {
    // Digital puzzles: Euclidean gap, as share of the length and in km on the map.
    const g = exact.string.gap;
    gap = Number.isFinite(g)
      ? t.gapDigital(fmt.number((100 * g) / exact.string.optimalLength, 2), km(g))
      : '–';
  } else if (exact?.string) gap = `${mm(exact.string.gap)} mm`;
  else if (e) gap = e.gapCapped ? t.gapAtLeast(mm(e.gapUm)) : `${mm(e.gapUm)} mm`;

  let verification: string;
  if (!v) verification = '–';
  else if (v.status === 'queued') verification = t.queued;
  else if (v.status === 'running') verification = t.verifying;
  else if (v.status === 'error') verification = `${t.verificationFailed}: ${v.message}`;
  else if (v.verification.status !== 'optimal')
    verification = `${t.verificationFailed} (${t.timeLimit})`;
  else
    verification =
      v.verification.mode === 'string-exact'
        ? t.stringExact
        : purpose === 'digital'
          ? t.euclidExact
          : t.euclidExactStringLocal;

  const tour = puzzle.tour;
  const euclideanMm = tour
    ? tour.reduce(
        (sum, c, i) =>
          sum + distance(board.points[c]!, board.points[tour[(i + 1) % tour.length]!]!),
        0,
      )
    : null;
  const stringMm = exact?.string ? exact.string.optimalLength / 1000 : e ? e.lengthUm / 1000 : null;
  const thesis = useMemo(
    () =>
      tour
        ? tourMetrics(
            new Instance(
              puzzle.members.map((c) => board.points[c]!),
              0,
            ),
            tour.map((c) => puzzle.members.indexOf(c)),
          )
        : null,
    [board, puzzle.members, tour],
  );

  return (
    <section>
      <h2>{t.puzzle}</h2>
      <p className="hint">
        {t.showing}: {shownLabel}
      </p>
      <dl className="metrics">
        <dt>{t.gap}</dt>
        <dd className="gap">{gap ?? '–'}</dd>
        <dt>{t.verification}</dt>
        <dd>{verification}</dd>
        {e && !exact && (
          <>
            <dt>{t.gapEstimate}</dt>
            <dd>{e.gapCapped ? t.gapAtLeast(mm(e.gapEstUm)) : `${mm(e.gapEstUm)} mm`}</dd>
          </>
        )}
        {!digital && (exact?.euclidean || e?.euclideanGapUm != null) && (
          <>
            <dt>{t.euclideanGap}</dt>
            <dd>{mm(exact?.euclidean ? exact.euclidean.gap : e!.euclideanGapUm!)} mm</dd>
          </>
        )}
        {!digital && stringMm !== null && (
          <>
            <dt>{t.stringLength}</dt>
            <dd>{fmt.number(stringMm, 1)} mm</dd>
          </>
        )}
        {digital && euclideanMm !== null && (
          <>
            <dt>{t.tourLengthKm}</dt>
            <dd>{fmt.number(euclideanMm / board.projection.mmPerKm, 0)} km</dd>
          </>
        )}
        {!digital && euclideanMm !== null && (
          <>
            <dt>{t.euclideanLength}</dt>
            <dd>{fmt.number(euclideanMm, 1)} mm</dd>
          </>
        )}
        {e && (
          <>
            <dt>{t.difficulty}</dt>
            <dd>{fmt.integer(e.difficulty.score * 100)} %</dd>
            <dt>{t.recognizability}</dt>
            <dd>{fmt.integer(e.recognizability * 100)} %</dd>
            <dt className="sub">{t.nearestNeighbor}</dt>
            <dd>{t.excess(fmt.number(e.difficulty.nearestNeighborBest * 100, 1))}</dd>
            <dt className="sub">{t.greedyEdge}</dt>
            <dd>{t.excess(fmt.number(e.difficulty.greedyEdge * 100, 1))}</dd>
            <dt className="sub">{t.hullInsertion}</dt>
            <dd>{t.excess(fmt.number(e.difficulty.hullInsertion * 100, 1))}</dd>
          </>
        )}
        {thesis && (
          <>
            <dt>{t.interiorFraction}</dt>
            <dd>{fmt.integer(thesis.interiorFraction * 100)} %</dd>
            <dt>{t.nonNearestEdges}</dt>
            <dd>{fmt.integer(thesis.nonNearestEdges * 100)} %</dd>
          </>
        )}
      </dl>
      {exact?.optimaDiffer && <p className="hint">{t.optimaDiffer}</p>}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={showTour}
          onChange={(ev) => setShowTour(ev.target.checked)}
        />
        {t.showTour}
      </label>
      <OverlayPicker board={board} puzzle={puzzle} />
    </section>
  );
}

const NO_CANDIDATES: readonly Evaluation[] = [];

function Candidates() {
  const t = useT();
  const fmt = useFormat();
  const archive = useStore((s) => s.run.progress?.archive ?? NO_CANDIDATES);
  const shown = useStore((s) => s.shown);
  const verifications = useStore((s) => s.verifications);
  if (archive.length === 0) return null;
  return (
    <section>
      <h2>{t.candidates}</h2>
      <ol className="candidates">
        {archive.slice(0, 10).map((e, i) => {
          const v = verifications[e.key];
          const exactGap =
            v?.status === 'done' && v.verification.string ? v.verification.string.gap : null;
          const gap = fmt.number((exactGap ?? e.gapUm) / 1000, 2);
          const selected = shown.kind === 'key' && shown.key === e.key;
          return (
            <li key={e.key}>
              <button
                type="button"
                className={selected ? 'selected' : undefined}
                onClick={() => showCandidate(selected ? null : e)}
              >
                {t.candidateRow(String(i + 1), gap)}
                {exactGap !== null && <span className="badge">✓</span>}
                {(v?.status === 'running' || v?.status === 'queued') && (
                  <span className="badge">…</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Marks() {
  const t = useT();
  const fmt = useFormat();
  const pinned = useStore((s) => s.pinned);
  const excluded = useStore((s) => s.excluded);
  return (
    <section>
      <h2>{t.marks}</h2>
      <p className="hint">{t.marksHint}</p>
      {(pinned.length > 0 || excluded.length > 0) && (
        <div className="marks">
          <span>{t.marksSummary(fmt.integer(pinned.length), fmt.integer(excluded.length))}</span>
          <button type="button" onClick={clearMarks}>
            {t.clearMarks}
          </button>
        </div>
      )}
    </section>
  );
}

/** Sparklines: gap of the current state and quality of the best candidate over iterations. */
function Traces() {
  const t = useT();
  const trace = useStore((s) => s.run.trace);
  const total = useStore((s) => s.run.progress?.iterations ?? 0);
  if (trace.length < 2 || total === 0) return null;
  const width = 280;
  const height = 48;
  const line = (values: readonly (number | null)[], cap: number) => {
    const max = Math.max(cap, ...values.map((v) => v ?? 0));
    return trace
      .map((p, i) => {
        const v = values[i];
        if (v === null || v === undefined) return null;
        const x = (p.iteration / total) * width;
        const y = height - 2 - (Math.max(0, v) / (max || 1)) * (height - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .filter((s) => s !== null)
      .join(' ');
  };
  return (
    <section>
      <h2>{t.trace}</h2>
      <svg className="trace" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t.trace}>
        <polyline
          className="trace-gap"
          points={line(
            trace.map((p) => p.gapMm),
            1,
          )}
        />
        <polyline
          className="trace-quality"
          points={line(
            trace.map((p) => p.bestQuality),
            0.1,
          )}
        />
      </svg>
      <p className="legend">
        <span className="swatch trace-gap" /> {t.traceGap} <span className="swatch trace-quality" />{' '}
        {t.traceQuality}
      </p>
    </section>
  );
}

function LinkWarnings() {
  const t = useT();
  const warnings = useStore((s) => s.linkWarnings);
  const board = useStore((s) => s.country);
  if (warnings.length === 0 || !board) return null;
  return (
    <section className="warning">
      {warnings.map((w) => {
        const [kind, a, b] = w.split(':');
        return (
          <p key={w}>{kind === 'data' ? t.dataVersionMismatch(a!, b!) : t.missingCities(a!)}</p>
        );
      })}
    </section>
  );
}

export function SidePanel({
  board,
  puzzle,
}: {
  readonly board: BoardModel | null;
  readonly puzzle: PuzzleView | null;
}) {
  const t = useT();
  return (
    <aside className="panel side">
      <LinkWarnings />
      <SearchStatus />
      <Traces />
      {board && puzzle ? (
        <PuzzleMetrics board={board} puzzle={puzzle} />
      ) : (
        <section>
          <h2>{t.puzzle}</h2>
          <p className="hint">{t.noPuzzle}</p>
        </section>
      )}
      {board && puzzle && (
        <Suspense fallback={null}>
          <TeachingPanel board={board} puzzle={puzzle} />
        </Suspense>
      )}
      {board && puzzle && <FixedAnalysis board={board} puzzle={puzzle} />}
      {board && puzzle && <ExportPanel board={board} puzzle={puzzle} />}
      <Candidates />
      <Marks />
    </aside>
  );
}
