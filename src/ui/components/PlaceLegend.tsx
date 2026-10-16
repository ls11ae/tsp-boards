// What the rings around places mean (roadmap 9.1): the board's legend if the puzzle has one,
// else a short default when some places are marked.

import type { LegendEntry } from '../../core/puzzle-file';
import type { BoardModel } from '../board';
import { useT } from '../i18n';
import { useStore } from '../store';

function Symbol({ kind }: { readonly kind: 'ring' | 'nail' }) {
  return (
    <svg className="legend-symbol" viewBox="-8 -8 16 16" aria-hidden="true">
      {kind === 'ring' && <circle className="ring" r={6} />}
      <circle className="dot" r={2.6} />
    </svg>
  );
}

export function PlaceLegend({
  board,
  members,
}: {
  readonly board: BoardModel;
  readonly members: readonly number[];
}) {
  const t = useT();
  const legend = useStore((s) => s.doc.board?.legend);
  const marked = members.some((c) => board.pool[c]?.highlight);
  const entries: readonly LegendEntry[] =
    legend && legend.length > 0
      ? legend
      : marked
        ? [
            { symbol: 'ring', text: t.legendMarked },
            { symbol: 'nail', text: t.legendPlain },
          ]
        : [];
  if (entries.length === 0) return null;
  return (
    <ul className="place-legend">
      {entries.map((e, i) => (
        <li key={i} className={e.symbol === 'none' ? 'note' : undefined}>
          {e.symbol !== 'none' && <Symbol kind={e.symbol} />}
          <span>{e.text}</span>
        </li>
      ))}
    </ul>
  );
}
