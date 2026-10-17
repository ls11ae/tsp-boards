// The open puzzle as a document: title, description and purpose; save to the local library,
// download and open files; lists of saved and curated puzzles.

import { useEffect, useRef, useState } from 'react';
import {
  localText,
  withLocalText,
  type CollectionEntry,
  type LocalText,
  type PuzzleDoc,
} from '../../core/puzzle-file';
import {
  downloadDocument,
  incrementalDocument,
  libraryPersistent,
  loadCollection,
  loadCollectionPuzzle,
  loadLibrary,
  mapDocument,
  newDocument,
  openDocument,
  readDocumentFile,
  removeFromLibrary,
  saveToLibrary,
} from '../documents';
import { setPurpose } from '../controller';
import { useFormat, useT } from '../i18n';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';

function useCollection(): readonly CollectionEntry[] {
  const [entries, setEntries] = useState<readonly CollectionEntry[]>([]);
  useEffect(() => {
    let alive = true;
    void loadCollection().then((index) => {
      if (alive) setEntries(index.puzzles);
    });
    return () => {
      alive = false;
    };
  }, []);
  return entries;
}

function DocList({
  docs,
  onOpen,
  onRemove,
}: {
  readonly docs: readonly {
    readonly id: string;
    readonly title: LocalText;
    readonly kind: string;
    readonly n: number;
  }[];
  readonly onOpen: (id: string) => void;
  readonly onRemove?: (id: string) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <ul className="doc-list">
      {docs.map((d) => (
        <li key={d.id}>
          <button type="button" className="doc-open" onClick={() => onOpen(d.id)}>
            <span>{localText(d.title, fmt.lang) || t.untitled}</span>
            <span className="hint">
              {d.kind === 'incremental' ? t.incrementalPuzzle : t.mapPuzzle} ·{' '}
              {t.placesCount(fmt.integer(d.n))}
            </span>
          </button>
          {onRemove &&
            (confirm === d.id ? (
              <button type="button" className="primary" onClick={() => onRemove(d.id)}>
                {t.removeConfirm}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirm(d.id)}>
                {t.remove}
              </button>
            ))}
        </li>
      ))}
    </ul>
  );
}

const placesOf = (d: PuzzleDoc) =>
  d.map ? d.map.places.length || d.map.params.n : (d.incremental?.points.length ?? 0);

export function DocumentPanel({
  puzzle,
  heading = true,
}: {
  readonly puzzle: PuzzleView | null;
  /** Show the section heading (off inside a collapsible group). */
  readonly heading?: boolean;
}) {
  const t = useT();
  const doc = useStore((s) => s.doc);
  const lang = useStore((s) => s.lang);
  const setDoc = useStore((s) => s.setDoc);
  const puzzleType = useStore((s) => s.puzzleType);
  const hasIncremental = useStore((s) => s.inc.puzzle !== null);
  const world = useStore((s) => puzzleType === 'map' && s.country?.metric === 'sphere');
  // A world board (roadmap 9.15) measures on the flat map: it may be a board.
  const flatMap = useStore((s) => s.params.flatMap);
  const sphere = world && !flatMap;
  useStore((s) => s.libraryVersion);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const collection = useCollection();
  const library = loadLibrary();
  const current = () =>
    puzzleType === 'incremental' ? incrementalDocument() : mapDocument(puzzle);
  const canSave = puzzleType === 'incremental' ? hasIncremental : puzzle !== null;

  return (
    <section className="doc-panel">
      {heading && <h2>{t.puzzleSection}</h2>}
      <label className="field wide">
        <span>{t.docTitle}</span>
        <input
          type="text"
          value={localText(doc.title, lang)}
          maxLength={120}
          onChange={(e) => setDoc({ title: withLocalText(doc.title, lang, e.target.value) })}
        />
      </label>
      <label className="field wide">
        <span>{t.docDescription}</span>
        <textarea
          rows={2}
          value={localText(doc.description, lang)}
          maxLength={2000}
          onChange={(e) =>
            setDoc({ description: withLocalText(doc.description, lang, e.target.value) })
          }
        />
      </label>
      <label className="field">
        <span>{t.docPurpose}</span>
        <select
          value={doc.purpose}
          onChange={(e) => setPurpose(e.target.value === 'digital' ? 'digital' : 'board')}
        >
          <option value="board" disabled={sphere}>
            {t.purposeBoard}
          </option>
          <option value="digital">{t.purposeDigital}</option>
        </select>
      </label>
      {sphere && <p className="hint">{t.purposeWorld}</p>}
      {world && flatMap && <p className="hint">{t.purposeWorldBoard}</p>}
      <div className="actions">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            const d = current();
            if (!d) return;
            saveToLibrary(d);
            setMessage(t.docSaved);
          }}
        >
          {t.docSave}
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            const d = current();
            if (d) downloadDocument(d);
          }}
        >
          {t.docDownload}
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          {t.docOpen}
        </button>
        <button type="button" onClick={newDocument}>
          {t.docNew}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            readDocumentFile(file)
              .then((d) => {
                openDocument(d);
                setMessage(null);
              })
              .catch((error: unknown) =>
                setMessage(t.docOpenFailed(error instanceof Error ? error.message : String(error))),
              );
          }}
        />
      </div>
      {message && <p className="hint">{message}</p>}
      <details>
        <summary>
          {t.myPuzzles} ({library.length})
        </summary>
        {!libraryPersistent() && <p className="hint">{t.notPersistent}</p>}
        {library.length === 0 ? (
          <p className="hint">{t.myPuzzlesEmpty}</p>
        ) : (
          <DocList
            docs={library.map((d) => ({ id: d.id, title: d.title, kind: d.kind, n: placesOf(d) }))}
            onOpen={(id) => {
              const d = library.find((x) => x.id === id);
              if (d) openDocument(d);
            }}
            onRemove={removeFromLibrary}
          />
        )}
      </details>
      {collection.length > 0 && (
        <details>
          <summary>
            {t.collection} ({collection.length})
          </summary>
          <DocList
            docs={collection}
            onOpen={(id) => {
              const entry = collection.find((x) => x.id === id);
              if (!entry) return;
              loadCollectionPuzzle(entry.file)
                .then((d) => openDocument(d))
                .catch((error: unknown) =>
                  setMessage(
                    t.docOpenFailed(error instanceof Error ? error.message : String(error)),
                  ),
                );
            }}
          />
        </details>
      )}
    </section>
  );
}
