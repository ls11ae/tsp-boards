import { useState } from 'react';
import { regionsOf } from '../../core/region';
import type { BoardModel } from '../board';
import { startSearch, stopSearch } from '../controller';
import { useFormat, useT } from '../i18n';
import { encodePermalink } from '../permalink';
import type { PuzzleView } from '../puzzle';
import { useStore, type UiParams } from '../store';

type NumericKey = {
  [K in keyof UiParams]: UiParams[K] extends number ? K : never;
}[keyof UiParams];

function NumberField({
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
  const value = useStore((s) => s.params[field]);
  const setParams = useStore((s) => s.setParams);
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
          if (Number.isFinite(x)) setParams({ [field]: x });
        }}
      />
    </label>
  );
}

export function ParamsPanel({
  board,
  puzzle,
}: {
  readonly board: BoardModel | null;
  readonly puzzle: PuzzleView | null;
}) {
  const t = useT();
  const fmt = useFormat();
  const country = useStore((s) => s.country);
  const region = useStore((s) => s.params.region);
  const setParams = useStore((s) => s.setParams);
  const status = useStore((s) => s.run.status);
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    const { params } = useStore.getState();
    if (!country || !board) return;
    const ids = puzzle ? puzzle.members.map((c) => board.pool[c]!.id) : null;
    const hash = encodePermalink(
      params,
      { country: country.country, version: country.dataVersion },
      ids,
    );
    window.history.replaceState(null, '', hash);
    const url = window.location.href;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  return (
    <aside className="panel params">
      <h2>{t.parameters}</h2>
      <label className="field">
        <span>{t.region}</span>
        <select value={region} onChange={(e) => setParams({ region: e.target.value })}>
          {country &&
            regionsOf(country).map((r) => (
              <option key={r.id} value={r.id}>
                {fmt.lang === 'de' ? r.name : r.nameEn}
              </option>
            ))}
        </select>
      </label>
      <NumberField label={t.cityCount} field="n" min={5} />
      <NumberField label={t.minPopulation} field="minPopulation" step={1000} />
      {board && <p className="hint">{t.poolSize(fmt.integer(board.pool.length))}</p>}
      <fieldset>
        <legend>{t.board}</legend>
        <NumberField label={t.boardWidth} field="boardWidthMm" step={10} />
        <NumberField label={t.boardHeight} field="boardHeightMm" step={10} />
        <NumberField label={t.margin} field="marginMm" />
        <NumberField label={t.nailDiameter} field="nailDiameterMm" step={0.1} />
        <NumberField label={t.stringThickness} field="stringThicknessMm" step={0.1} />
        <NumberField label={t.minDistance} field="minDistanceMm" />
      </fieldset>
      <NumberField label={t.targetGap} field="targetGapMm" step={0.5} />
      <fieldset>
        <legend>{t.weights}</legend>
        <NumberField label={t.weightGap} field="weightGap" step={0.1} />
        <NumberField label={t.weightDifficulty} field="weightDifficulty" step={0.1} />
        <NumberField label={t.weightRecognizability} field="weightRecognizability" step={0.1} />
      </fieldset>
      <NumberField label={t.seed} field="seed" />
      <NumberField label={t.iterations} field="iterations" step={100} min={1} />
      <div className="actions">
        {status === 'running' ? (
          <button type="button" onClick={stopSearch}>
            {t.stop}
          </button>
        ) : (
          <button type="button" className="primary" onClick={startSearch} disabled={!country}>
            {t.start}
          </button>
        )}
        <button type="button" onClick={copyLink} disabled={!country}>
          {copied ? t.linkCopied : t.permalink}
        </button>
      </div>
    </aside>
  );
}
