// Logos for the board export (roadmap 9.1): an SVG file instead of a place's label and one in
// the legend box. They stay in memory for this session only (usage rights): never saved in
// puzzle files, links or the library.

import { useState } from 'react';
import { parseSvgLogo } from '../../core/board/logo';
import type { BoardModel } from '../board';
import { useT } from '../i18n';
import type { PuzzleView } from '../puzzle';
import { useStore, type BoardLogo } from '../store';

export function LogoFields({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
}) {
  const t = useT();
  const logos = useStore((s) => s.logos);
  const startCity = useStore((s) => s.doc.board?.startCity ?? null);
  const cities = puzzle.members.map((c) => board.pool[c]!);
  const [target, setTarget] = useState<string>(
    String(startCity ?? cities.find((c) => c.highlight)?.id ?? cities[0]?.id ?? ''),
  );
  const [error, setError] = useState<string | null>(null);
  const load = (file: File | undefined, city: number | null) => {
    if (!file) return;
    file
      .text()
      .then((text) => {
        const logo: BoardLogo = { city, fileName: file.name, logo: parseSvgLogo(text) };
        setError(null);
        useStore.setState((s) => ({ logos: [...s.logos.filter((l) => l.city !== city), logo] }));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const name = (city: number | null) =>
    city === null ? t.logoLegend : (board.pool[board.index.get(city) ?? -1]?.name ?? String(city));
  return (
    <details className="logo-fields">
      <summary>{t.logos}</summary>
      <p className="hint">{t.logosHint}</p>
      <label className="field">
        <span>{t.logoPlace}</span>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t.logoFile}</span>
        <input
          type="file"
          accept=".svg,image/svg+xml"
          onChange={(e) => load(e.target.files?.[0], Number(target))}
        />
      </label>
      <label className="field">
        <span>{t.logoLegend}</span>
        <input
          type="file"
          accept=".svg,image/svg+xml"
          onChange={(e) => load(e.target.files?.[0], null)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      {logos.length > 0 && (
        <ul className="logo-list">
          {logos.map((l) => (
            <li key={String(l.city)}>
              {name(l.city)}: {l.fileName}{' '}
              <button
                type="button"
                onClick={() =>
                  useStore.setState((s) => ({ logos: s.logos.filter((x) => x.city !== l.city) }))
                }
              >
                {t.logoRemove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
