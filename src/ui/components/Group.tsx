// A collapsible group of settings (roadmap 7.4); whether it is open is remembered per browser.

import { useState, type ReactNode } from 'react';

const KEY = 'tsp-boards.groups.v1';

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const stored = (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>)[id];
    return typeof stored === 'boolean' ? stored : fallback;
  } catch {
    return fallback;
  }
}

function writeOpen(id: string, open: boolean): void {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(KEY, JSON.stringify({ ...all, [id]: open }));
  } catch {
    // Not remembered; the group still opens and closes.
  }
}

export function Group({
  id,
  title,
  defaultOpen = true,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));
  return (
    <details
      className="group"
      open={open}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        if (now !== open) {
          setOpen(now);
          writeOpen(id, now);
        }
      }}
    >
      <summary>{title}</summary>
      <div className="group-body">{children}</div>
    </details>
  );
}
