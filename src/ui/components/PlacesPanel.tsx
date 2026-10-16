// Places of the map puzzle: the region's towns, or a list (fixed instance or pool) entered as
// text, with the matches to check and labels to set.

import { useState, type ReactNode } from 'react';
import type { RatedChange } from '../../core/fixed';
import { closePairs } from '../../core/fixed';
import type { BoardModel } from '../board';
import { setPurpose } from '../controller';
import { useFormat, useT } from '../i18n';
import {
  DEFAULT_MERGE_KM,
  applyList,
  cancelCombining,
  changeEntry,
  clearList,
  combinePlaces,
  combinedName,
  startCombining,
  combinePair,
  removePlace,
  setListMode,
  suggestChanges,
} from '../lists';
import type { PuzzleView } from '../puzzle';
import { useStore, type ListEntry } from '../store';

type Source = 'region' | 'fixed' | 'pool';

/** One list line; a composite line lists its members below (each with its own choice). */
function EntryRow({
  entry,
  member = null,
}: {
  readonly entry: ListEntry;
  /** Index of the member within its composite line, for member rows. */
  readonly member?: number | null;
}) {
  const t = useT();
  const fmt = useFormat();
  const mark = {
    matched: '✓',
    ambiguous: '?',
    'not-found': '✗',
    custom: '◆',
    composite: '⊕',
  }[entry.status];
  if (entry.members) {
    return (
      <>
        <tr className="entry-composite">
          <td title={entry.text}>
            {mark} {entry.query}
          </td>
          <td>
            <span className="hint">{t.listComposite(fmt.integer(entry.members.length))}</span>
          </td>
          <td>
            <input
              type="text"
              value={entry.label ?? ''}
              placeholder={t.listLabel}
              onChange={(e) => changeEntry(entry.line, { label: e.target.value || undefined })}
            />
          </td>
        </tr>
        {entry.members.map((m, i) => (
          <EntryRow key={i} entry={m} member={i} />
        ))}
      </>
    );
  }
  return (
    <tr className={`entry-${entry.status}${member !== null ? ' entry-member' : ''}`}>
      <td title={entry.text}>
        {mark} {entry.query}
      </td>
      <td>
        {entry.custom ? (
          <span className="hint">{t.listCustom}</span>
        ) : entry.options.length === 0 ? (
          <span className="error">{t.listNotFound}</span>
        ) : (
          <select
            value={entry.choice}
            onChange={(e) => changeEntry(entry.line, { choice: Number(e.target.value) }, member)}
          >
            {entry.options.map((o, i) => (
              <option key={o.id} value={i}>
                {o.name}
                {o.state ? ` (${o.state.replace(/^DE-/, '')}, ${fmt.integer(o.pop)})` : ''}
              </option>
            ))}
            <option value={-1}>{t.listSkip}</option>
          </select>
        )}
      </td>
      <td>
        {member === null && (
          <input
            type="text"
            value={entry.label ?? ''}
            placeholder={t.listLabel}
            onChange={(e) => changeEntry(entry.line, { label: e.target.value || undefined })}
          />
        )}
      </td>
    </tr>
  );
}

/** Combining places into one node: choose them on the board, name it, combine. */
function CombineField({
  board,
  puzzle,
}: {
  readonly board: BoardModel | null;
  readonly puzzle: PuzzleView | null;
}) {
  const t = useT();
  const combining = useStore((s) => s.combining);
  const [name, setName] = useState('');
  if (!combining) {
    return (
      <div className="actions">
        <button type="button" onClick={startCombining} disabled={!board}>
          {t.combineStart}
        </button>
      </div>
    );
  }
  const chosen = board ? combining.map((c) => board.pool[c]!) : [];
  return (
    <div className="combine">
      <p className="hint">{t.combineHint}</p>
      <p>{chosen.length > 0 ? chosen.map((c) => c.label).join(' + ') : '–'}</p>
      <label className="field">
        <span>{t.combineName}</span>
        <input
          type="text"
          value={name}
          placeholder={combinedName(chosen)}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={chosen.length < 2}
          onClick={() => {
            combinePlaces(name, puzzle?.members ?? null);
            setName('');
          }}
        >
          {t.combineApply}
        </button>
        <button type="button" onClick={cancelCombining}>
          {t.combineCancel}
        </button>
      </div>
    </div>
  );
}

/** A fieldset with a legend, or just the content (inside a collapsible group). */
function Frame({
  framed,
  legend,
  children,
}: {
  readonly framed: boolean;
  readonly legend: string;
  readonly children: ReactNode;
}) {
  if (!framed) return <div className="places">{children}</div>;
  return (
    <fieldset>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}

export function PlacesPanel({
  board,
  puzzle,
  framed = true,
}: {
  readonly board: BoardModel | null;
  readonly puzzle: PuzzleView | null;
  readonly framed?: boolean;
}) {
  const t = useT();
  const fmt = useFormat();
  const list = useStore((s) => s.list);
  const country = useStore((s) => s.country);
  const [text, setText] = useState(list?.text ?? '');
  const placing = useStore((s) => s.placing);
  // Points placed by hand change the list text.
  const listText = list?.text;
  const [seenText, setSeenText] = useState(listText);
  if (listText !== seenText) {
    setSeenText(listText);
    if (listText !== undefined) setText(listText);
  }
  const [mergeKm, setMergeKm] = useState(list?.mergeKm ?? DEFAULT_MERGE_KM);
  const source: Source = list ? list.mode : 'region';
  const [draft, setDraft] = useState<Source>(source);
  const shown = list ? source : draft;
  const counts = list
    ? {
        places: list.places.length,
        notFound: list.entries.filter((e) => e.status === 'not-found').length,
        ambiguous: list.entries.filter((e) => e.status === 'ambiguous').length,
      }
    : null;

  return (
    <Frame framed={framed} legend={t.places}>
      <label className="field">
        <span>{t.placesSource}</span>
        <select
          value={shown}
          onChange={(e) => {
            const value = e.target.value as Source;
            if (value === 'region') {
              clearList();
              setDraft('region');
            } else if (list) {
              setListMode(value);
            } else {
              setDraft(value);
            }
          }}
        >
          <option value="region">{t.placesRegion}</option>
          <option value="fixed">{t.placesFixed}</option>
          <option value="pool">{t.placesPool}</option>
        </select>
      </label>
      <div className="actions">
        <button
          type="button"
          className={placing ? 'primary' : undefined}
          aria-pressed={placing}
          onClick={() => useStore.setState({ placing: !placing })}
        >
          {placing ? t.placeByHandDone : t.placeByHand}
        </button>
      </div>
      {placing && <p className="hint">{t.placeByHandHint}</p>}
      <CombineField board={board} puzzle={puzzle} />
      {shown !== 'region' && (
        <>
          <label className="field wide">
            <span className="hint">{t.listHint}</span>
            <textarea
              rows={6}
              value={text}
              placeholder={t.listPlaceholder}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t.listMerge}</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={mergeKm}
              onChange={(e) => {
                const x = e.target.valueAsNumber;
                if (Number.isFinite(x) && x >= 0) setMergeKm(x);
              }}
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={!country || !text.trim()}
              onClick={() => applyList(text, shown === 'pool' ? 'pool' : 'fixed', mergeKm)}
            >
              {t.listApply}
            </button>
          </div>
          {list && counts && (
            <>
              <p className="hint">
                {t.listSummary(
                  fmt.integer(counts.places),
                  fmt.integer(list.entries.length),
                  fmt.integer(counts.ambiguous),
                  fmt.integer(counts.notFound),
                )}
              </p>
              <details open={counts.ambiguous + counts.notFound > 0}>
                <summary>{t.listCheck}</summary>
                <table className="entries">
                  <tbody>
                    {list.entries.map((e) => (
                      <EntryRow key={e.line} entry={e} />
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </>
      )}
    </Frame>
  );
}

/** Warnings and help for a fixed instance (shown with the puzzle's metrics). */
export function FixedAnalysis({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
}) {
  const t = useT();
  const fmt = useFormat();
  const list = useStore((s) => s.list);
  const params = useStore((s) => s.params);
  const purpose = useStore((s) => s.doc.purpose);
  const pinned = useStore((s) => s.pinned);
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'done'; suggestions: readonly RatedChange[] }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  if (list?.mode !== 'fixed') return null;
  const points = puzzle.members.map((c) => board.points[c]!);
  const name = (i: number) => board.pool[puzzle.members[i]!]!.label;
  // Pinned places stay in every variant (roadmap 9.6).
  const kept = puzzle.members.flatMap((c, i) => (pinned.includes(board.pool[c]!.id) ? [i] : []));
  const close = closePairs(points, params.minDistanceMm);
  const { widthMm: w, heightMm: h } = board.projection.board;
  const outside = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p[0] < 5 || p[1] < 5 || p[0] > w - 5 || p[1] > h - 5);
  const v = puzzle.verification;
  const gapUm = v?.status === 'done' && v.verification.string ? v.verification.string.gap : null;
  const small = gapUm !== null && purpose === 'board' && gapUm < params.targetGapMm * 1000;
  const mm = (um: number) => fmt.number(um / 1000, 2);
  const target = params.targetGapMm * 1000;
  const analyse = () => {
    setState({ status: 'running' });
    suggestChanges()
      .then((suggestions) => setState({ status: 'done', suggestions }))
      .catch((error: unknown) =>
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
  };
  return (
    <section>
      <h2>{t.fixedTitle}</h2>
      <p className="hint">{t.fixedHint(fmt.integer(points.length))}</p>
      {close.length > 0 && (
        <div className="warning">
          <p>{t.fixedClose(fmt.integer(close.length), fmt.number(params.minDistanceMm, 0))}</p>
          <ul>
            {close.slice(0, 6).map((c) => (
              <li key={`${c.a}-${c.b}`}>
                {name(c.a)} – {name(c.b)}: {fmt.number(c.distanceMm, 1)} mm
              </li>
            ))}
          </ul>
        </div>
      )}
      {outside.length > 0 && (
        <p className="warning">{t.fixedOutside(outside.map(({ i }) => name(i)).join(', '))}</p>
      )}
      {small && gapUm !== null && (
        <div className="warning">
          <p>{t.fixedSmallGap(mm(gapUm), fmt.number(params.targetGapMm, 1))}</p>
          <div className="actions">
            <button type="button" onClick={() => setPurpose('digital')}>
              {t.fixedMakeDigital}
            </button>
            <button type="button" disabled={state.status === 'running'} onClick={analyse}>
              {state.status === 'running' ? t.fixedSearching : t.fixedChanges}
            </button>
          </div>
        </div>
      )}
      {!small && !board.sphere && (purpose === 'digital' || close.length > 0) && (
        <div className="actions">
          <button type="button" disabled={state.status === 'running'} onClick={analyse}>
            {state.status === 'running' ? t.fixedSearching : t.fixedBoardVariant}
          </button>
        </div>
      )}
      {(small || (!board.sphere && (purpose === 'digital' || close.length > 0))) && (
        <p className="hint">
          {kept.length > 0 ? t.fixedKept(kept.map(name).join(', ')) : t.fixedKeepHint}
        </p>
      )}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'done' && (
        <>
          <p className="hint">{t.fixedChangesHint(fmt.number(params.targetGapMm, 1))}</p>
          <ul className="removals">
            {state.suggestions.map((s) => {
              const fits = s.gapUm >= target && s.closePairs === 0;
              const text =
                s.kind === 'remove'
                  ? t.fixedWithout(name(s.point), mm(s.gapUm))
                  : t.fixedCombined(name(s.a), name(s.b), mm(s.gapUm));
              return (
                <li key={s.kind === 'remove' ? `r${s.point}` : `c${s.a}-${s.b}`}>
                  <span>
                    {text}
                    {s.exact ? '' : ' *'}
                    {fits
                      ? ` · ${t.fixedBoardOk}`
                      : s.closePairs > 0
                        ? ` · ${t.fixedStillClose(fmt.integer(s.closePairs))}`
                        : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setState({ status: 'idle' });
                      if (s.kind === 'remove') removePlace(puzzle.members[s.point]!);
                      else combinePair(puzzle.members[s.a]!, puzzle.members[s.b]!);
                    }}
                  >
                    {s.kind === 'remove' ? t.fixedLeaveOut : t.combineApply}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
