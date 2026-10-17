// What the rings around places mean (roadmap 9.1): the board's legend if the puzzle has one,
// else a short default when some places are marked.

import { legendText, type LegendEntry } from '../../core/puzzle-file';
import type { BoardModel } from '../board';
import { useT } from '../i18n';
import { useStore } from '../store';

function Symbol({ kind }: { readonly kind: 'ring' | 'nail' | 'dashed' }) {
  return (
    <svg className="legend-symbol" viewBox="-8 -8 16 16" aria-hidden="true">
      {kind === 'dashed' ? (
        // The given leg of an open path (roadmap 9.17), as drawn on the map.
        <line className="given-leg" x1={-8} y1={0} x2={8} y2={0} />
      ) : (
        <>
          {kind === 'ring' && <circle className="ring" r={6} />}
          <circle className="dot" r={2.6} />
        </>
      )}
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
  const lang = useStore((s) => s.lang);
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
          <span>{legendText(e, lang)}</span>
        </li>
      ))}
    </ul>
  );
}
