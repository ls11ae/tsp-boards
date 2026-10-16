// The incremental puzzle: parameters (left), the board as it will be engraved (centre), the
// instances with their figures and the export (right).

import { useState } from 'react';
import { stepGapUm } from '../../core/incremental/generate';
import type { IncrementalUiParams } from '../../core/incremental/params';
import { useFormat, useT } from '../i18n';
import { generate, incrementalLink, incrementalPreview } from '../incremental';

/** The SVG and PDF writers load on first use (roadmap 7.6). */
const downloadIncremental = (kind: 'svg' | 'template' | 'solution') =>
  void import('../incremental-export').then((m) => m.downloadIncremental(kind));
import { useStore } from '../store';
import { incrementalPlayLink } from '../incremental-play';
import { DocumentPanel } from './DocumentPanel';
import { boardFit } from './fit';

type NumericKey = {
  [K in keyof IncrementalUiParams]: IncrementalUiParams[K] extends number ? K : never;
}[keyof IncrementalUiParams];

function Field({
  label,
  field,
  step = 1,
  min = 0,
}: {
  readonly label: string;
  readonly field: NumericKey;
  readonly step?: number;
  readonly min?: number;
}) {
  const value = useStore((s) => s.inc.params[field]);
  const setIncParams = useStore((s) => s.setIncParams);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const x = e.target.valueAsNumber;
          if (Number.isFinite(x)) setIncParams({ [field]: x });
        }}
      />
    </label>
  );
}

export function IncrementalParams() {
  const t = useT();
  const status = useStore((s) => s.inc.status);
  const hasPuzzle = useStore((s) => s.inc.puzzle !== null);
  const language = useStore((s) => s.inc.params.labelLanguage);
  const setIncParams = useStore((s) => s.setIncParams);
  const [copied, setCopied] = useState(false);
  return (
    <aside className="panel params">
      <DocumentPanel puzzle={null} />
      <h2>{t.parameters}</h2>
      <p className="hint">{t.incTagline}</p>
      <Field label={t.incPoints} field="n" min={4} />
      <fieldset>
        <legend>{t.board}</legend>
        <Field label={t.boardWidth} field="widthMm" step={10} />
        <Field label={t.boardHeight} field="heightMm" step={10} />
        <Field label={t.nailDiameter} field="nailDiameterMm" step={0.1} />
        <Field label={t.stringThickness} field="stringThicknessMm" step={0.1} />
        <Field label={t.minDistance} field="minDistanceMm" />
        <Field label={t.labelSize} field="labelSizeMm" step={0.5} />
        <label className="field">
          <span>{t.labelLanguage}</span>
          <select
            value={language}
            onChange={(e) => setIncParams({ labelLanguage: e.target.value === 'en' ? 'en' : 'de' })}
          >
            <option value="de">{t.labelsGerman}</option>
            <option value="en">{t.labelsEnglish}</option>
          </select>
        </label>
      </fieldset>
      <Field label={t.targetGap} field="targetGapMm" step={0.5} />
      <Field label={t.incSpacing} field="spacingMm" step={1} />
      <Field label={t.seed} field="seed" />
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={generate}
          disabled={status === 'running'}
        >
          {t.generate}
        </button>
        <button
          type="button"
          disabled={!hasPuzzle}
          onClick={() => {
            navigator.clipboard
              .writeText(incrementalLink())
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
              .catch(() => setCopied(false));
          }}
        >
          {copied ? t.linkCopied : t.permalink}
        </button>
      </div>
    </aside>
  );
}

export function IncrementalBoard() {
  const t = useT();
  const inc = useStore((s) => s.inc);
  const holes = useStore((s) => s.exportOptions.holes);
  const { puzzle, params } = inc;
  if (!puzzle) {
    return <p className="hint">{inc.status === 'running' ? t.generating : t.incNoPuzzle}</p>;
  }
  const preview = incrementalPreview(puzzle, params, holes);
  const k = inc.shownK;
  const step = k === null ? null : puzzle.steps.find((s) => s.k === k);
  const tour =
    step && inc.showSolution
      ? step.tour.map((v) => puzzle.points[v]!.map((c) => c.toFixed(2)).join(',')).join(' ')
      : null;
  const { widthMm: w, heightMm: h } = puzzle.params;
  return (
    <svg
      className="board"
      style={boardFit(w, h)}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={t.incrementalPuzzle}
    >
      <g className="preview">
        <rect className="board-bg" width={w} height={h} />
        <path className="lay-score" d={preview.score} />
        <path className="lay-engrave" d={preview.engrave} />
        <path className="lay-cut" d={preview.cut} />
      </g>
      {tour && <polygon className="tour" points={tour} />}
      {puzzle.points.map(([x, y], i) => (
        <circle
          key={i}
          className={k !== null && i < k ? 'inc-nail active' : 'inc-nail'}
          cx={x}
          cy={y}
          r={3}
        />
      ))}
    </svg>
  );
}

export function IncrementalSide() {
  const t = useT();
  const fmt = useFormat();
  const inc = useStore((s) => s.inc);
  const setInc = useStore((s) => s.setInc);
  const options = useStore((s) => s.exportOptions);
  const setOptions = useStore((s) => s.setExportOptions);
  const { puzzle } = inc;
  const mm = (um: number) => (um === Infinity ? '–' : fmt.number(um / 1000, 1));
  return (
    <aside className="panel side">
      <section>
        <h2>{t.incSteps}</h2>
        {inc.status === 'running' && <p className="hint">{t.generating}</p>}
        {inc.status === 'error' && <p className="error">{inc.message}</p>}
        {inc.status === 'failed' && (
          <p className="error">{t.incFailed(fmt.integer(inc.reached))}</p>
        )}
        {puzzle && inc.status === 'done' && (
          <p className="hint">
            {t.incFound(
              fmt.integer(puzzle.points.length),
              fmt.integer(inc.checks),
              fmt.number(inc.ms / 1000, 1),
            )}
          </p>
        )}
        {inc.violations.length > 0 && (
          <div className="warning">
            <p>{t.incViolations}</p>
            {inc.violations.map((v) => (
              <p key={v.k}>
                {t.incViolation(String(v.k), v.violations.map((x) => t.violation(x)).join(', '))}
              </p>
            ))}
          </div>
        )}
        {puzzle && !inc.marksFit && <p className="error">{t.incMarksDontFit}</p>}
        {puzzle && (
          <>
            <p className="hint">{t.incStepHint}</p>
            <table className="steps">
              <thead>
                <tr>
                  <th>{t.incColK}</th>
                  <th>{t.incColString}</th>
                  <th>{t.incColGap}</th>
                  <th>{t.incColTrack}</th>
                </tr>
              </thead>
              <tbody>
                {puzzle.steps.map((s) => (
                  <tr
                    key={s.k}
                    className={inc.shownK === s.k ? 'selected' : undefined}
                    onClick={() => setInc({ shownK: inc.shownK === s.k ? null : s.k })}
                  >
                    <td>{s.k}</td>
                    <td>{mm(s.stringUm)}</td>
                    <td>{s.k > 3 ? mm(s.stringGapUm) : '–'}</td>
                    <td>{s.k > 3 ? mm(stepGapUm(s)) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={inc.showSolution}
                onChange={(e) => setInc({ showSolution: e.target.checked })}
              />
              {t.incShowSolution}
            </label>
            <div className="actions">
              <button
                type="button"
                className="primary"
                onClick={() => useStore.setState({ mode: 'play', playId: null })}
              >
                {t.playNow}
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = incrementalPlayLink();
                  if (url) void navigator.clipboard.writeText(url).catch(() => undefined);
                }}
              >
                {t.playLinkIncremental}
              </button>
            </div>
          </>
        )}
      </section>
      {puzzle && (
        <section>
          <h2>{t.exportTitle}</h2>
          <label className="field">
            <span>{t.holes}</span>
            <select
              value={options.holes}
              onChange={(e) =>
                setOptions({
                  holes:
                    e.target.value === 'mark' ? 'mark' : e.target.value === 'pit' ? 'pit' : 'cut',
                })
              }
            >
              <option value="cut">{t.holesCut}</option>
              <option value="pit">{t.holesPit}</option>
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
          <div className="actions column">
            <button type="button" onClick={() => downloadIncremental('svg')}>
              {t.downloadSvg}
            </button>
            <button type="button" onClick={() => downloadIncremental('template')}>
              {t.downloadTemplate}
            </button>
            <button type="button" onClick={() => downloadIncremental('solution')}>
              {t.downloadSolution}
            </button>
          </div>
          <p className="hint">{t.exportHint}</p>
        </section>
      )}
    </aside>
  );
}
