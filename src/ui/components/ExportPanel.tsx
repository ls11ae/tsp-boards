import type { BoardPlan, PlanWarning } from '../../core/board/plan';
import type { BoardModel } from '../board';
import { downloadBoard, planKey, prepareBoard, type ExportKind } from '../export';
import { useFormat, useT } from '../i18n';
import type { Messages } from '../i18n/en';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';

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
  const plan = state?.status === 'done' ? state.plan : null;
  const download = (kind: ExportKind) => {
    if (plan) downloadBoard(kind, board, puzzle, plan);
  };

  return (
    <section>
      <h2>{t.exportTitle}</h2>
      {!verified ? (
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
        </>
      )}
    </section>
  );
}
