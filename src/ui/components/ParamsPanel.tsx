import { useState } from 'react';
import { EVERY_STATE } from '../../core/groups';
import { regionInfo, regionStates, type RegionInfo } from '../../core/region';
import { offeredRegions } from '../../core/region-check';
import type { BoardModel } from '../board';
import { changeParams, startSearch, stopSearch, switchCountry } from '../controller';
import { useFormat, useT } from '../i18n';
import { encodePermalink } from '../../core/permalink';
import { linkList, linkPath } from '../lists';
import { playLink } from '../play';
import { DocumentPanel } from './DocumentPanel';
import { Group } from './Group';
import { PlacesPanel } from './PlacesPanel';
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
          if (Number.isFinite(x)) changeParams({ [field]: x });
        }}
      />
    </label>
  );
}

function LabelLanguageField() {
  const t = useT();
  const value = useStore((s) => s.params.labelLanguage);
  const setParams = useStore((s) => s.setParams);
  return (
    <label className="field">
      <span>{t.labelLanguage}</span>
      <select
        value={value}
        onChange={(e) => setParams({ labelLanguage: e.target.value === 'en' ? 'en' : 'de' })}
      >
        <option value="de">{t.labelsGerman}</option>
        <option value="en">{t.labelsEnglish}</option>
      </select>
    </label>
  );
}

function BlankBoardField() {
  const t = useT();
  const value = useStore((s) => s.params.blankBoard);
  return (
    <label className="checkbox">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => changeParams({ blankBoard: e.target.checked })}
      />
      {t.blankBoard}
    </label>
  );
}

/** Country of the map puzzle (shown when the data has more than one). */
function CountryField() {
  const t = useT();
  const fmt = useFormat();
  const manifest = useStore((s) => s.manifest);
  const country = useStore((s) => s.country);
  const [error, setError] = useState<string | null>(null);
  if (!manifest || manifest.countries.length < 2) return null;
  const countries = [...manifest.countries].sort((a, b) =>
    a.name[fmt.lang].localeCompare(b.name[fmt.lang], fmt.lang),
  );
  return (
    <>
      <label className="field">
        <span>{t.country}</span>
        <select
          value={country?.country ?? ''}
          onChange={(e) => {
            setError(null);
            switchCountry(e.target.value).catch((err: unknown) =>
              setError(err instanceof Error ? err.message : String(err)),
            );
          }}
        >
          {countries.map((c) => (
            <option key={c.country} value={c.country}>
              {c.name[fmt.lang]}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
    </>
  );
}

/** Regions that hold a minimum puzzle, grouped; a region from a link stays selectable. */
function RegionField() {
  const t = useT();
  const fmt = useFormat();
  const country = useStore((s) => s.country);
  const region = useStore((s) => s.params.region);
  const name = (r: RegionInfo) => (fmt.lang === 'de' ? r.name : r.nameEn);
  let regions: RegionInfo[] = country ? offeredRegions(country) : [];
  if (country && !regions.some((r) => r.id === region)) {
    let current: RegionInfo = { id: region, name: region, nameEn: region, kind: 'state' };
    try {
      current = regionInfo(country, region);
    } catch {
      // Unknown region: shown by its id.
    }
    regions = [...regions, current];
  }
  const sorted = (kind: RegionInfo['kind']) =>
    regions.filter((r) => r.kind === kind).sort((a, b) => name(a).localeCompare(name(b), fmt.lang));
  const groups: [string, RegionInfo[]][] = [
    [
      country?.country === 'EU'
        ? t.regionContinent
        : country?.country === 'WO'
          ? t.regionWorld
          : t.regionCountry,
      sorted('country'),
    ],
    [t.regionUnions, sorted('multi')],
    [
      country?.country === 'CH'
        ? t.regionCantons
        : country?.country === 'NL'
          ? t.regionProvinces
          : country?.country === 'EU'
            ? t.regionCountries
            : country?.country === 'WO'
              ? t.regionContinents
              : t.regionStates,
      sorted('state'),
    ],
  ];
  return (
    <label className="field">
      <span>{t.region}</span>
      <select value={region} onChange={(e) => changeParams({ region: e.target.value })}>
        {groups.map(
          ([label, list]) =>
            list.length > 0 && (
              <optgroup key={label} label={label}>
                {list.map((r) => (
                  <option key={r.id} value={r.id}>
                    {name(r)}
                  </option>
                ))}
              </optgroup>
            ),
        )}
      </select>
    </label>
  );
}

/** Minimum and maximum number of places per state (one constraint for every state). */
function GroupsField() {
  const t = useT();
  const fmt = useFormat();
  const country = useStore((s) => s.country);
  const region = useStore((s) => s.params.region);
  const groups = useStore((s) => s.groups);
  if (!country) return null;
  let states: string[];
  try {
    states = regionStates(country, region) ?? country.states.map((s) => s.id);
  } catch {
    return null;
  }
  if (states.length < 2) return null;
  const every = groups.find((g) => g.group === EVERY_STATE);
  const set = (min: number, max: number | null) => {
    const others = groups.filter((g) => g.group !== EVERY_STATE);
    const constraint = min === 0 && max === null ? [] : [{ group: EVERY_STATE, min, max }];
    useStore.setState({ groups: [...others, ...constraint] });
  };
  return (
    <fieldset>
      <legend>
        {country.country === 'EU'
          ? t.perCountry
          : country.country === 'WO'
            ? t.perContinent
            : t.perState}
      </legend>
      <label className="field">
        <span>{t.perStateMin}</span>
        <input
          type="number"
          min={0}
          value={every?.min ?? 0}
          onChange={(e) => {
            const x = e.target.valueAsNumber;
            // A larger minimum raises the maximum.
            const max = every?.max ?? null;
            if (Number.isInteger(x) && x >= 0) set(x, max === null ? null : Math.max(max, x));
          }}
        />
      </label>
      <label className="field">
        <span>{t.perStateMax}</span>
        <input
          type="number"
          min={0}
          placeholder={t.noLimit}
          value={every?.max ?? ''}
          onChange={(e) => {
            const x = e.target.valueAsNumber;
            if (e.target.value === '') set(every?.min ?? 0, null);
            else if (Number.isInteger(x) && x >= 0) set(Math.min(every?.min ?? 0, x), x);
          }}
        />
      </label>
      <div className="actions">
        <button type="button" onClick={() => set(1, null)}>
          {t.everyState}
        </button>
        {states.length >= 5 && (
          <button
            type="button"
            onClick={() => {
              set(1, 1);
              changeParams({ n: states.length });
            }}
          >
            {t.onePerState(fmt.integer(states.length))}
          </button>
        )}
      </div>
      <p className="hint">{t.perStateHint}</p>
    </fieldset>
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
  const status = useStore((s) => s.run.status);
  const fixed = useStore((s) => s.list?.mode === 'fixed');
  const digital = useStore((s) => s.doc.purpose === 'digital');
  const sphere = country?.metric === 'sphere';
  const [copied, setCopied] = useState<'link' | 'play' | null>(null);
  const copy = (text: string, which: 'link' | 'play') => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(which);
        setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => setCopied(null));
  };

  const copyLink = () => {
    const { params } = useStore.getState();
    if (!country || !board) return;
    const ids = puzzle ? puzzle.members.map((c) => board.pool[c]!.id) : null;
    const { pinned, excluded } = useStore.getState();
    const hash = encodePermalink(
      params,
      { country: country.country, version: country.dataVersion },
      ids,
      { pinned, excluded },
      __APP_VERSION__,
      useStore.getState().doc.title,
      linkList(puzzle ? puzzle.members : null),
      linkPath(),
    );
    window.history.replaceState(null, '', hash);
    copy(window.location.href, 'link');
  };

  return (
    <aside className="panel params">
      <Group id="puzzle" title={t.puzzleSection}>
        <DocumentPanel puzzle={puzzle} heading={false} />
      </Group>
      <Group id="places" title={t.places}>
        <CountryField />
        <RegionField />
        <PlacesPanel board={board} puzzle={puzzle} framed={false} />
        <NumberField label={t.cityCount} field="n" min={5} />
        <NumberField label={t.minPopulation} field="minPopulation" step={1000} />
        {board && <p className="hint">{t.poolSize(fmt.integer(board.pool.length))}</p>}
        <GroupsField />
      </Group>
      <Group id="board" title={sphere ? t.worldMap : t.board}>
        <NumberField label={t.boardWidth} field="boardWidthMm" step={10} />
        <NumberField label={t.boardHeight} field="boardHeightMm" step={10} />
        <NumberField label={t.margin} field="marginMm" />
        {/* Digital puzzles have no nails or string (r_eff 0). */}
        {!digital && (
          <>
            <NumberField label={t.nailDiameter} field="nailDiameterMm" step={0.1} />
            <NumberField label={t.stringThickness} field="stringThicknessMm" step={0.1} />
          </>
        )}
        <NumberField label={t.minDistance} field="minDistanceMm" />
        <NumberField label={t.labelSize} field="labelSizeMm" step={0.5} />
        <LabelLanguageField />
        <BlankBoardField />
      </Group>
      <Group id="search" title={t.search}>
        {!digital && <NumberField label={t.targetGap} field="targetGapMm" step={0.5} />}
        <Group id="advanced" title={t.advanced} defaultOpen={false}>
          <fieldset>
            <legend>{t.weights}</legend>
            <NumberField label={t.weightGap} field="weightGap" step={0.1} />
            <NumberField label={t.weightDifficulty} field="weightDifficulty" step={0.1} />
            <NumberField label={t.weightRecognizability} field="weightRecognizability" step={0.1} />
            <NumberField label={t.weightInterior} field="weightInterior" step={0.1} />
            <NumberField label={t.weightNonNearest} field="weightNonNearest" step={0.1} />
          </fieldset>
          <NumberField label={t.seed} field="seed" />
          <NumberField label={t.iterations} field="iterations" step={100} min={1} />
        </Group>
      </Group>
      <div className="actions params-actions">
        {status === 'running' ? (
          <button type="button" onClick={stopSearch}>
            {t.stop}
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={startSearch}
            disabled={!country || fixed}
            title={fixed ? t.fixedNoSearch : undefined}
          >
            {t.start}
          </button>
        )}
        <button type="button" onClick={copyLink} disabled={!country}>
          {copied === 'link' ? t.linkCopied : t.permalink}
        </button>
        <button
          type="button"
          onClick={() => {
            const url = puzzle ? playLink(puzzle) : null;
            if (url) copy(url, 'play');
          }}
          disabled={!country || !puzzle}
        >
          {copied === 'play' ? t.linkCopied : t.playLink}
        </button>
        <button
          type="button"
          onClick={() => useStore.setState({ mode: 'play', playId: null })}
          disabled={!puzzle}
        >
          {t.playNow}
        </button>
      </div>
    </aside>
  );
}
