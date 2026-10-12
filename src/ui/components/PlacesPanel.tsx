// Places of the map puzzle: the region's towns, or a list (fixed instance or pool) entered as
// text, with the matches to check and labels to set.

import { useState } from 'react';
import type { RemovalSuggestion } from '../../core/fixed';
import { closePairs } from '../../core/fixed';
import type { BoardModel } from '../board';
import { setPurpose } from '../controller';
import { useFormat, useT } from '../i18n';
import {
  DEFAULT_MERGE_KM,
  applyList,
  changeEntry,
  clearList,
  removePlace,
  setListMode,
  suggestRemovals,
} from '../lists';
import type { PuzzleView } from '../puzzle';
import { useStore, type ListEntry } from '../store';

type Source = 'region' | 'fixed' | 'pool';

function EntryRow({ entry }: { readonly entry: ListEntry }) {
  const t = useT();
  const fmt = useFormat();
  const mark = { matched: '✓', ambiguous: '?', 'not-found': '✗', custom: '◆' }[entry.status];
  return (
    <tr className={`entry-${entry.status}`}>
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
            onChange={(e) => changeEntry(entry.line, { choice: Number(e.target.value) })}
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
        <input
          type="text"
          value={entry.label ?? ''}
          placeholder={t.listLabel}
          onChange={(e) => changeEntry(entry.line, { label: e.target.value || undefined })}
        />
      </td>
    </tr>
  );
}

export function PlacesPanel() {
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
    <fieldset>
      <legend>{t.places}</legend>
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
    </fieldset>
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
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'done'; suggestions: readonly RemovalSuggestion[] }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  if (list?.mode !== 'fixed') return null;
  const points = puzzle.members.map((c) => board.points[c]!);
  const name = (i: number) => board.pool[puzzle.members[i]!]!.label;
  const close = closePairs(points, params.minDistanceMm);
  const { widthMm: w, heightMm: h } = board.projection.board;
  const outside = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p[0] < 5 || p[1] < 5 || p[0] > w - 5 || p[1] > h - 5);
  const v = puzzle.verification;
  const gapUm = v?.status === 'done' && v.verification.string ? v.verification.string.gap : null;
  const small = gapUm !== null && purpose === 'board' && gapUm < params.targetGapMm * 1000;
  const mm = (um: number) => fmt.number(um / 1000, 2);
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
            <button
              type="button"
              disabled={state.status === 'running'}
              onClick={() => {
                setState({ status: 'running' });
                suggestRemovals()
                  .then((suggestions) => setState({ status: 'done', suggestions }))
                  .catch((error: unknown) =>
                    setState({
                      status: 'error',
                      message: error instanceof Error ? error.message : String(error),
                    }),
                  );
              }}
            >
              {state.status === 'running' ? t.fixedSearching : t.fixedRemovals}
            </button>
          </div>
        </div>
      )}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'done' && (
        <ul className="removals">
          {state.suggestions.map((s) => (
            <li key={s.point}>
              <span>
                {t.fixedWithout(name(s.point), mm(s.gapUm))}
                {s.exact ? '' : ' *'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setState({ status: 'idle' });
                  removePlace(puzzle.members[s.point]!);
                }}
              >
                {t.fixedLeaveOut}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
