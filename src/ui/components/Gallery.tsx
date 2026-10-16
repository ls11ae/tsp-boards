// Start page: the curated collection and the player's own puzzles, with their status and the
// personal best; one click opens a puzzle to play or in the designer.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CollectionEntry, PuzzleDoc } from '../../core/puzzle-file';
import { regionInfo } from '../../core/region';
import { thumbnail, type Thumbnail } from '../thumbnail';
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
  /** The puzzle document (loaded once). */
  readonly open: () => Promise<PuzzleDoc>;
}

/** Solved without help, or not (yet). */
function solved(id: string): boolean {
  const best = scoresFor(id)[0];
  return best !== undefined && best.excess === 0 && !best.revealed;
}

/** A collection entry's thumbnail (also on the kiosk's cards). */
export function EntryThumbnail({ entry }: { readonly entry: CollectionEntry }) {
  const card = useMemo(() => fromEntry(entry), [entry]);
  return <CardThumbnail card={card} />;
}

/**
 * The board without a tour: region outline and places. The puzzle and its data file (de.json,
 * eu.json and wo.json are 1.6 MB together) load only when the card comes near the screen.
 */
function CardThumbnail({ card }: { readonly card: Card }) {
  const [thumb, setThumb] = useState<Thumbnail | null>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const placeholder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = placeholder.current;
    if (near || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);
  useEffect(() => {
    if (!near) return;
    let alive = true;
    card
      .open()
      .then((doc) => thumbnail(card.id, doc))
      .then((th) => {
        if (alive) setThumb(th);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [card, near]);
  if (!thumb) return <div className="card-thumb" ref={placeholder} aria-hidden="true" />;
  // Dots of about 2 % of the board's smaller side stay visible at thumbnail size.
  const r = Math.min(thumb.width, thumb.height) * 0.012;
  return (
    <svg
      className="card-thumb"
      viewBox={`0 0 ${thumb.width} ${thumb.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <rect className="board-bg" width={thumb.width} height={thumb.height} rx={r * 2} />
      {thumb.outline && <path className="thumb-outline" d={thumb.outline} />}
      {thumb.points.map(([x, y], i) => (
        <circle key={i} className="thumb-place" cx={x} cy={y} r={r} />
      ))}
    </svg>
  );
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
  const regionName = useRegionName();
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
      <CardThumbnail card={card} />
      <h3>{card.title || t.untitled}</h3>
      <p className="hint">
        {card.kind === 'incremental' ? t.incrementalPuzzle : t.mapPuzzle} ·{' '}
        {t.placesCount(fmt.integer(card.n))}
        {card.region ? ` · ${regionName(card.region)}` : ''} ·{' '}
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

function memo<T>(f: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= f());
}

const fromEntry = (e: CollectionEntry): Card => ({
  ...e,
  open: memo(() => loadCollectionPuzzle(e.file)),
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

interface Filters {
  readonly kind: 'all' | 'map' | 'incremental';
  readonly region: string;
  readonly purpose: 'all' | 'board' | 'digital';
  readonly status: 'all' | 'solved' | 'open';
}

const NO_FILTERS: Filters = { kind: 'all', region: 'all', purpose: 'all', status: 'all' };

function matches(card: Card, f: Filters): boolean {
  return (
    (f.kind === 'all' || card.kind === f.kind) &&
    (f.region === 'all' || card.region === f.region) &&
    (f.purpose === 'all' || card.purpose === f.purpose) &&
    (f.status === 'all' || solved(card.id) === (f.status === 'solved'))
  );
}

/** Readable region name (the loaded country's names, else the code). */
function useRegionName(): (code: string) => string {
  const country = useStore((s) => s.country);
  const manifest = useStore((s) => s.manifest);
  const lang = useStore((s) => s.lang);
  return (code) => {
    if (country && code.startsWith(country.country)) {
      try {
        const info = regionInfo(country, code);
        return lang === 'de' ? info.name : info.nameEn;
      } catch {
        // Unknown region: its code.
      }
    }
    // A whole country or continent of another data file: its name from the manifest.
    const entry = manifest?.countries.find((c) => c.country === code);
    return entry ? entry.name[lang] : code;
  };
}

function FilterSelect<K extends keyof Filters>({
  filters,
  field,
  label,
  options,
  onChange,
}: {
  readonly filters: Filters;
  readonly field: K;
  readonly label: string;
  readonly options: readonly (readonly [string, string])[];
  readonly onChange: (f: Filters) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={filters[field]}
        onChange={(e) => onChange({ ...filters, [field]: e.target.value })}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterBar({
  cards,
  filters,
  onChange,
}: {
  readonly cards: readonly Card[];
  readonly filters: Filters;
  readonly onChange: (f: Filters) => void;
}) {
  const t = useT();
  const regionName = useRegionName();
  const regions = [...new Set(cards.map((c) => c.region).filter(Boolean))].sort((a, b) =>
    regionName(a).localeCompare(regionName(b)),
  );
  const common = { filters, onChange };
  return (
    <div className="gallery-filters" role="group" aria-label={t.galleryFilters}>
      <FilterSelect
        {...common}
        field="kind"
        label={t.filterType}
        options={[
          ['all', t.filterAll],
          ['map', t.mapPuzzle],
          ['incremental', t.incrementalPuzzle],
        ]}
      />
      <FilterSelect
        {...common}
        field="region"
        label={t.region}
        options={[['all', t.filterAll], ...regions.map((r) => [r, regionName(r)] as const)]}
      />
      <FilterSelect
        {...common}
        field="purpose"
        label={t.filterPurpose}
        options={[
          ['all', t.filterAll],
          ['board', t.purposeBoard],
          ['digital', t.purposeDigital],
        ]}
      />
      <FilterSelect
        {...common}
        field="status"
        label={t.filterStatus}
        options={[
          ['all', t.filterAll],
          ['solved', t.gallerySolved],
          ['open', t.filterOpen],
        ]}
      />
    </div>
  );
}

export function Gallery() {
  const t = useT();
  useStore((s) => s.libraryVersion);
  useStore((s) => s.scoresVersion);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
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
  // Cards keep their loaded documents (and thumbnails) across renders.
  const [collectionCards, setCollectionCards] = useState<readonly Card[]>([]);
  const [seen, setSeen] = useState(collection);
  if (seen !== collection) {
    setSeen(collection);
    setCollectionCards(collection.map(fromEntry));
  }
  const mineCards = loadLibrary().map(fromDoc);
  const shown = (cards: readonly Card[]) => cards.filter((c) => matches(c, filters));
  const startDesigner = (type: 'map' | 'incremental') =>
    useStore.setState({ page: 'app', mode: 'design', puzzleType: type });
  return (
    <main className="gallery">
      <p className="hint">{t.galleryIntro}</p>
      <FilterBar
        cards={[...collectionCards, ...mineCards]}
        filters={filters}
        onChange={setFilters}
      />
      <section>
        <h2>{t.collection}</h2>
        {shown(collectionCards).length === 0 ? (
          <p className="hint">{t.galleryNoMatch}</p>
        ) : (
          <ul className="cards">
            {shown(collectionCards).map((c) => (
              <CardView key={c.id} card={c} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2>{t.myPuzzles}</h2>
        {mineCards.length === 0 ? (
          <p className="hint">{t.galleryMineEmpty}</p>
        ) : (
          <ul className="cards">
            {shown(mineCards).map((c) => (
              <CardView key={c.id} card={c} />
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
