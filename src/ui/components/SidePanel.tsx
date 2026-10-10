import type { Evaluation } from '../../core/search/search';
import type { BoardModel } from '../board';
import { showCandidate } from '../controller';
import { useFormat, useT } from '../i18n';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';
import { distance } from '../../core/geometry';

function SearchStatus() {
  const t = useT();
  const fmt = useFormat();
  const run = useStore((s) => s.run);
  const p = run.progress;
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
      {run.error && <p className="error">{run.error}</p>}
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

  let gap: string | null = null;
  if (exact?.string) gap = `${mm(exact.string.gap)} mm`;
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
      v.verification.mode === 'string-exact' ? t.stringExact : t.euclidExactStringLocal;

  const tour = puzzle.tour;
  const euclideanMm = tour
    ? tour.reduce(
        (sum, c, i) =>
          sum + distance(board.points[c]!, board.points[tour[(i + 1) % tour.length]!]!),
        0,
      )
    : null;
  const stringMm = exact?.string ? exact.string.optimalLength / 1000 : e ? e.lengthUm / 1000 : null;

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
        {(exact?.euclidean || e?.euclideanGapUm != null) && (
          <>
            <dt>{t.euclideanGap}</dt>
            <dd>{mm(exact?.euclidean ? exact.euclidean.gap : e!.euclideanGapUm!)} mm</dd>
          </>
        )}
        {stringMm !== null && (
          <>
            <dt>{t.stringLength}</dt>
            <dd>{fmt.number(stringMm, 1)} mm</dd>
          </>
        )}
        {euclideanMm !== null && (
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
      {board && puzzle ? (
        <PuzzleMetrics board={board} puzzle={puzzle} />
      ) : (
        <section>
          <h2>{t.puzzle}</h2>
          <p className="hint">{t.noPuzzle}</p>
        </section>
      )}
      <Candidates />
    </aside>
  );
}
