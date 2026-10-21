import { useState } from 'react';
import type { BoardPlan, PlanWarning } from '../../core/board/plan';
import { DIN_PAPERS, DIN_SIZES } from '../../core/board/paper';
import { localText, type LegendEntry } from '../../core/puzzle-file';
import { pathCities, usePathCities, type BoardModel } from '../board';
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
  // An open path (roadmap 9.15) is tied at its start and read at its end nail.
  const ends = pathCities(board, puzzle.members);
  const warnings = plan.warnings
    .map((w) => warningText(t, w, mm))
    .filter((w): w is string => w !== null);
  return (
    <>
      <dl className="metrics">
        <dt>{ends ? t.endNail : t.startNail}</dt>
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

/** Poster in a DIN format (roadmap 9.7): the solution, its length and facts. */
function Poster({
  board,
  puzzle,
  logos,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
  /** Show the logo fields (the board downloads have them already). */
  readonly logos: boolean;
}) {
  const t = useT();
  const fmt = useFormat();
  const options = useStore((s) => s.exportOptions);
  const setOptions = useStore((s) => s.setExportOptions);
  const doc = useStore((s) => s.doc);
  const cities = puzzle.members.map((c) => board.pool[c]!);
  // Texts of the poster, prefilled from the puzzle (not its description: that is written for
  // the screen), editable before the export (roadmap 9.9).
  const [title, setTitle] = useState(() =>
    localText(doc.title, useStore.getState().params.labelLanguage),
  );
  const [subtitle, setSubtitle] = useState('');
  const [legend, setLegend] = useState<LegendEntry[]>(() =>
    doc.board?.legend.length
      ? [...doc.board.legend]
      : cities.some((c) => c.highlight)
        ? [{ symbol: 'ring', text: t.posterMarked }]
        : [],
  );
  const [emphasis, setEmphasis] = useState<number | null>(null);
  // A QR code to the game for gallery puzzles; on localhost it would point nowhere useful.
  const [qr, setQr] = useState(
    doc.id !== null && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname),
  );
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'done'; km: number; same: boolean }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const composite = cities.some((c) => (c.members?.length ?? 0) >= 2);
  const setLine = (i: number, line: LegendEntry) =>
    setLegend((l) => l.map((e, j) => (j === i ? line : e)));
  const download = () => {
    setState({ status: 'running' });
    import('../export')
      .then((m) =>
        m.downloadPoster(board, puzzle, {
          title,
          subtitle,
          legend: legend.filter((e) => e.text.trim()),
          emphasis,
          qr,
        }),
      )
      .then((tour) => setState({ status: 'done', km: tour.lengthKm, same: tour.mapAgrees }))
      .catch((e: unknown) =>
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
      );
  };
  return (
    <div className="poster">
      <h3>{t.poster}</h3>
      <p className="hint">{t.posterHint}</p>
      <label className="field">
        <span>{t.posterPaper}</span>
        <select
          value={options.posterPaper}
          onChange={(e) => {
            const paper = DIN_PAPERS.find((p) => p === e.target.value);
            if (paper) setOptions({ posterPaper: paper });
          }}
        >
          {DIN_PAPERS.map((p) => (
            <option key={p} value={p}>
              {p} ({DIN_SIZES[p].join(' × ')} mm)
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t.posterOrientation}</span>
        <select
          value={options.posterOrientation}
          onChange={(e) =>
            setOptions({
              posterOrientation: e.target.value === 'landscape' ? 'landscape' : 'portrait',
            })
          }
        >
          <option value="portrait">{t.portrait}</option>
          <option value="landscape">{t.landscape}</option>
        </select>
      </label>
      {composite && (
        <label className="field">
          <span>{t.posterMembers}</span>
          <select
            value={options.posterMembers}
            onChange={(e) =>
              setOptions({
                posterMembers: e.target.value === 'separate' ? 'separate' : 'centroid',
              })
            }
          >
            <option value="centroid">{t.membersCentroid}</option>
            <option value="separate">{t.membersSeparate}</option>
          </select>
        </label>
      )}
      <label className="field">
        <span>{t.posterTitle}</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>{t.posterSubtitle}</span>
        <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
      </label>
      <label className="field">
        <span>{t.posterEmphasis}</span>
        <select
          value={emphasis ?? ''}
          onChange={(e) => setEmphasis(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">{t.emphasisNone}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="poster-legend">
        <legend>{t.posterLegend}</legend>
        {legend.map((e, i) => (
          <div key={i} className="legend-row">
            <select
              aria-label={t.posterLegendSymbol}
              value={e.symbol}
              onChange={(ev) =>
                setLine(i, {
                  ...e,
                  symbol:
                    ev.target.value === 'ring'
                      ? 'ring'
                      : ev.target.value === 'nail'
                        ? 'nail'
                        : 'none',
                })
              }
            >
              <option value="ring">{t.legendRing}</option>
              <option value="nail">{t.legendNail}</option>
              <option value="none">{t.legendNote}</option>
            </select>
            <input
              type="text"
              aria-label={t.posterLegend}
              value={e.text}
              onChange={(ev) => setLine(i, { ...e, text: ev.target.value })}
            />
            <button
              type="button"
              aria-label={t.legendRemove}
              onClick={() => setLegend((l) => l.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLegend((l) => [...l, { symbol: 'none', text: '' }])}
        >
          {t.legendAdd}
        </button>
      </fieldset>
      {doc.id !== null && (
        <label className="checkbox">
          <input type="checkbox" checked={qr} onChange={(e) => setQr(e.target.checked)} />
          {t.posterQr}
        </label>
      )}
      {logos && <LogoFields board={board} puzzle={puzzle} />}
      <p className="hint">{t.posterLogoHint}</p>
      <div className="actions">
        <button type="button" disabled={state.status === 'running'} onClick={download}>
          {state.status === 'running' ? t.posterRunning : t.downloadPoster}
        </button>
      </div>
      {state.status === 'done' && (
        <p className={state.same ? 'hint' : 'error'}>
          {t.posterDone(fmt.number(Math.round(state.km), 0), state.same)}
        </p>
      )}
      {state.status === 'error' && <p className="error">{state.message}</p>}
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
  // Worksheet and poster draw closed round trips: not for an open path (roadmap 9.15).
  const path = usePathCities(board, puzzle.members) !== null;
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
          {verified && !path && <Worksheet board={board} puzzle={puzzle} paperField />}
          {!path && <Poster key={puzzle.key} board={board} puzzle={puzzle} logos />}
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
                    setOptions({
                      holes:
                        e.target.value === 'mark'
                          ? 'mark'
                          : e.target.value === 'pit'
                            ? 'pit'
                            : 'cut',
                    })
                  }
                >
                  <option value="cut">{t.holesCut}</option>
                  <option value="pit">{t.holesPit}</option>
                  <option value="mark">{t.holesMark}</option>
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={options.edge}
                  onChange={(e) => setOptions({ edge: e.target.checked })}
                />
                {t.edgeCut}
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
          {!path && <Worksheet board={board} puzzle={puzzle} paperField={!plan} />}
          {!path && <Poster key={puzzle.key} board={board} puzzle={puzzle} logos={false} />}
        </>
      )}
    </section>
  );
}
