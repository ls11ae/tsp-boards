// Start page: the curated collection and the player's own puzzles, with their status and the
// personal best; one click opens a puzzle to play or in the designer.

import { useEffect, useState } from 'react';
import type { CollectionEntry, PuzzleDoc } from '../../core/puzzle-file';
import { loadCollection, loadCollectionPuzzle, loadLibrary, openDocument } from '../documents';
import { useFormat, useT } from '../i18n';
import { scoresFor, storedGame } from '../play';
import { useStore } from '../store';
import { formatDuration, useExcessText } from '../format';

interface Card {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: 'map' | 'incremental';
  readonly purpose: 'board' | 'digital';
  readonly region: string;
  readonly n: number;
  readonly open: () => Promise<PuzzleDoc>;
}

function Status({ id }: { readonly id: string }) {
  const t = useT();
  const excess = useExcessText();
  useStore((s) => s.scoresVersion);
  const best = scoresFor(id)[0];
  const game = storedGame(id);
  if (best) {
    return (
      <p className={best.excess === 0 && !best.revealed ? 'card-status solved' : 'card-status'}>
        {best.excess === 0 && !best.revealed ? t.gallerySolved : t.galleryTried}
        {' · '}
        {t.galleryBest(excess(best), formatDuration(best.ms))}
      </p>
    );
  }
  if (game && game.startedAt !== null) return <p className="card-status">{t.galleryInProgress}</p>;
  return <p className="card-status">{t.galleryUnsolved}</p>;
}

function CardView({ card }: { readonly card: Card }) {
  const t = useT();
  const fmt = useFormat();
  const [error, setError] = useState<string | null>(null);
  const open = (mode: 'design' | 'play') => {
    card
      .open()
      .then((doc) => {
        openDocument(doc, mode);
        useStore.setState({ page: 'app' });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  return (
    <li className="card">
      <h3>{card.title || t.untitled}</h3>
      <p className="hint">
        {card.kind === 'incremental' ? t.incrementalPuzzle : t.mapPuzzle} ·{' '}
        {t.placesCount(fmt.integer(card.n))}
        {card.region ? ` · ${card.region}` : ''} ·{' '}
        {card.purpose === 'digital' ? t.purposeDigital : t.purposeBoard}
      </p>
      {card.description && <p className="card-description">{card.description}</p>}
      <Status id={card.id} />
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="primary" onClick={() => open('play')}>
          {t.galleryPlay}
        </button>
        <button type="button" onClick={() => open('design')}>
          {t.galleryEdit}
        </button>
      </div>
    </li>
  );
}

const fromEntry = (e: CollectionEntry): Card => ({
  ...e,
  open: () => loadCollectionPuzzle(e.file),
});

const fromDoc = (d: PuzzleDoc): Card => ({
  id: d.id,
  title: d.title,
  description: d.description,
  kind: d.kind,
  purpose: d.purpose,
  region: d.map?.params.region ?? '',
  n: d.map ? d.map.places.length || d.map.params.n : (d.incremental?.points.length ?? 0),
  open: () => Promise.resolve(d),
});

export function Gallery() {
  const t = useT();
  useStore((s) => s.libraryVersion);
  const [collection, setCollection] = useState<readonly CollectionEntry[]>([]);
  useEffect(() => {
    let alive = true;
    void loadCollection().then((index) => {
      if (alive) setCollection(index.puzzles);
    });
    return () => {
      alive = false;
    };
  }, []);
  const mine = loadLibrary();
  const startDesigner = (type: 'map' | 'incremental') =>
    useStore.setState({ page: 'app', mode: 'design', puzzleType: type });
  return (
    <main className="gallery">
      <p className="hint">{t.galleryIntro}</p>
      <section>
        <h2>{t.collection}</h2>
        <ul className="cards">
          {collection.map((e) => (
            <CardView key={e.id} card={fromEntry(e)} />
          ))}
        </ul>
      </section>
      <section>
        <h2>{t.myPuzzles}</h2>
        {mine.length === 0 ? (
          <p className="hint">{t.galleryMineEmpty}</p>
        ) : (
          <ul className="cards">
            {mine.map((d) => (
              <CardView key={d.id} card={fromDoc(d)} />
            ))}
          </ul>
        )}
        <div className="actions">
          <button type="button" onClick={() => startDesigner('map')}>
            {t.galleryNewMap}
          </button>
          <button type="button" onClick={() => startDesigner('incremental')}>
            {t.galleryNewIncremental}
          </button>
        </div>
      </section>
    </main>
  );
}
