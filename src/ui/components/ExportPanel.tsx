import type { BoardPlan, PlanWarning } from '../../core/board/plan';
import type { BoardModel } from '../board';
import type { ExportKind } from '../export';
import { planKey, prepareBoard } from '../plans';
import { useFormat, useT } from '../i18n';
import type { Messages } from '../i18n/en';
import type { PuzzleView } from '../puzzle';
import { checkBoardRobustness } from '../robustness';
import { useStore } from '../store';
import { LogoFields } from './LogoFields';

function warningText(t: Messages, w: PlanWarning, mm: (um: number) => string): string | null {
  switch (w.kind) {
    case 'labels':
      return t.warnLabels(String(w.unplaced));
    case 'no-title-space':
      return t.warnTitle;
    case 'gap-below-target':
      return t.warnGap(mm(w.gapUm));
    case 'optimum-differs':
      return t.warnOptimum;
    case 'measurement-unverified':
      return t.warnUnverified;
    case 'legend-overlap':
      return t.warnLegend(String(w.nails));
    case 'start-not-preferred':
      return t.warnStart;
    case 'no-scale-space':
      return null;
  }
}

function PlanSummary({
  board,
  puzzle,
  plan,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
  readonly plan: BoardPlan;
}) {
  const t = useT();
  const fmt = useFormat();
  const mm = (um: number) => fmt.number(um / 1000, 2);
  const start = board.pool[puzzle.members[plan.scale.slot]!]!;
  const warnings = plan.warnings
    .map((w) => warningText(t, w, mm))
    .filter((w): w is string => w !== null);
  return (
    <>
      <dl className="metrics">
        <dt>{t.startNail}</dt>
        <dd>{start.name}</dd>
        <dt>{t.measuredGap}</dt>
        <dd className="gap">
          {plan.measured.kind === 'exact'
            ? `${mm(plan.measured.gapUm)} mm`
            : t.lowerBound(mm(plan.measured.gapUm))}
        </dd>
      </dl>
      {warnings.map((w) => (
        <p key={w} className="error">
          {w}
        </p>
      ))}
    </>
  );
}

/** Exact check for r_eff half a millimetre below and above the planned value. */
function Robustness({
  board,
  puzzle,
  plan,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
  readonly plan: BoardPlan;
}) {
  const t = useT();
  const fmt = useFormat();
  const params = useStore((s) => s.params);
  const state = useStore((s) => s.robustness);
  const mine = state?.key === planKey(puzzle.key, params) ? state : null;
  const mm = (um: number) => (Number.isFinite(um) ? `${fmt.number(um / 1000, 2)} mm` : '–');
  const verdict = (ok: boolean, status: string) =>
    status !== 'optimal' ? t.robustTimeLimit : ok ? `✓ ${t.robustSame}` : `✗ ${t.robustDiffers}`;
  const done = mine && !mine.running && !mine.error && mine.rows.length > 0;
  const allSame = mine?.rows.every((r) => r.sameOptimum && (r.scale?.sameOptimum ?? true));
  return (
    <div className="robustness">
      <h3>{t.robustness}</h3>
      <p className="hint">{t.robustnessHint}</p>
      {mine && mine.rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>r_eff</th>
              <th>{t.robustOptimum}</th>
              <th>{t.robustGap}</th>
              <th>{t.robustScale}</th>
            </tr>
          </thead>
          <tbody>
            {mine.rows.map((r) => (
              <tr key={r.rEffMm}>
                <td>{fmt.number(r.rEffMm, 2)} mm</td>
                <td>{verdict(r.sameOptimum, r.status)}</td>
                <td>{r.status === 'optimal' ? mm(r.gapUm) : '–'}</td>
                <td>
                  {r.scale
                    ? `${verdict(r.scale.sameOptimum, r.scale.status)}${r.scale.status === 'optimal' ? `, ${mm(r.scale.gapUm)}` : ''}`
                    : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {mine?.running && <p className="hint">{t.robustRunning}</p>}
      {mine?.error && <p className="error">{mine.error}</p>}
      {done && <p className={allSame ? 'hint' : 'error'}>{allSame ? t.robustOk : t.robustWarn}</p>}
      {!mine?.running && (
        <div className="actions">
          <button type="button" onClick={() => checkBoardRobustness(board, puzzle, plan)}>
            {t.robustRun}
          </button>
        </div>
      )}
    </div>
  );
}

/** Classroom worksheet: needs only the exact check (also for digital puzzles). */
function Worksheet({
  board,
  puzzle,
  paperField,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
  /** Show a paper choice (the board downloads have one already). */
  readonly paperField: boolean;
}) {
  const t = useT();
  const options = useStore((s) => s.exportOptions);
  const setOptions = useStore((s) => s.setExportOptions);
  return (
    <div className="worksheet">
      <h3>{t.worksheet}</h3>
      <p className="hint">{t.worksheetHint}</p>
      {paperField && (
        <label className="field">
          <span>{t.worksheetPaper}</span>
          <select
            value={options.paper}
            onChange={(e) => setOptions({ paper: e.target.value === 'A3' ? 'A3' : 'A4' })}
          >
            <option value="A4">A4</option>
            <option value="A3">A3</option>
          </select>
        </label>
      )}
      <div className="actions">
        <button
          type="button"
          onClick={() => void import('../export').then((m) => m.downloadWorksheet(board, puzzle))}
        >
          {t.downloadWorksheet}
        </button>
      </div>
    </div>
  );
}

export function ExportPanel({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
}) {
  const t = useT();
  const params = useStore((s) => s.params);
  const options = useStore((s) => s.exportOptions);
  const setOptions = useStore((s) => s.setExportOptions);
  const state = useStore((s) => s.boardPlans[planKey(puzzle.key, params)]);
  const v = puzzle.verification;
  const verified = v?.status === 'done' && v.verification.string !== null;
  const digital = useStore((s) => s.doc.purpose === 'digital');
  const plan = state?.status === 'done' ? state.plan : null;
  const download = (kind: ExportKind) => {
    // The downloads (SVG and PDF writers) load on first use.
    if (plan) void import('../export').then((m) => m.downloadBoard(kind, board, puzzle, plan));
  };

  return (
    <section>
      <h2>{t.exportTitle}</h2>
      {board.sphere ? (
        <p className="hint">{t.exportWorld}</p>
      ) : digital ? (
        <>
          <p className="hint">{t.exportDigital}</p>
          {verified && <Worksheet board={board} puzzle={puzzle} paperField />}
        </>
      ) : !verified ? (
        <p className="hint">{t.exportNeedsCheck}</p>
      ) : (
        <>
          {state?.status === 'running' && <p className="hint">{t.planning}</p>}
          {state?.status === 'error' && (
            <p className="error">
              {t.planFailed}: {state.message}
            </p>
          )}
          {state?.status === 'done' && !state.plan && <p className="error">{t.noScaleSpace}</p>}
          {plan && <PlanSummary board={board} puzzle={puzzle} plan={plan} />}
          {plan && <Robustness board={board} puzzle={puzzle} plan={plan} />}
          <LogoFields board={board} puzzle={puzzle} />
          {state?.status !== 'running' && !plan && (
            <div className="actions">
              <button type="button" className="primary" onClick={() => prepareBoard(board, puzzle)}>
                {t.prepareBoard}
              </button>
            </div>
          )}
          {plan && (
            <>
              <label className="field">
                <span>{t.holes}</span>
                <select
                  value={options.holes}
                  onChange={(e) =>
                    setOptions({ holes: e.target.value === 'mark' ? 'mark' : 'cut' })
                  }
                >
                  <option value="cut">{t.holesCut}</option>
                  <option value="mark">{t.holesMark}</option>
                </select>
              </label>
              <label className="field">
                <span>{t.strokeWidth}</span>
                <input
                  type="number"
                  value={options.strokeMm}
                  step={0.025}
                  min={0.001}
                  onChange={(e) => {
                    const x = e.target.valueAsNumber;
                    if (Number.isFinite(x) && x > 0) setOptions({ strokeMm: x });
                  }}
                />
              </label>
              <label className="field">
                <span>{t.paper}</span>
                <select
                  value={options.paper}
                  onChange={(e) => setOptions({ paper: e.target.value === 'A3' ? 'A3' : 'A4' })}
                >
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={options.preview}
                  onChange={(e) => setOptions({ preview: e.target.checked })}
                />
                {t.previewBoard}
              </label>
              <div className="actions column">
                <button type="button" onClick={() => download('svg')}>
                  {t.downloadSvg}
                </button>
                <button type="button" onClick={() => download('template')}>
                  {t.downloadTemplate}
                </button>
                <button type="button" onClick={() => download('solution')}>
                  {t.downloadSolution}
                </button>
              </div>
              <p className="hint">{t.exportHint}</p>
            </>
          )}
          <Worksheet board={board} puzzle={puzzle} paperField={!plan} />
        </>
      )}
    </section>
  );
}
