// Reference endpoint for opt-in play records (src/core/play.ts, PlayRecord schema 1).
// Dependency-free Node (>= 22): `node server/play-data.mjs`. Accepts POST requests with one JSON
// record, validates it strictly and appends it as one line to a JSONL file, stamped with the
// day only. Stores no IP addresses, headers or cookies. Put it behind the web server (reverse
// proxy, HTTPS) and build the app with VITE_PLAY_DATA_URL pointing to it.
//
// Environment: PORT (8787), DATA_FILE (play-data.jsonl), ALLOW_ORIGIN (the app's origin, for
// CORS; '*' if unset), MAX_PER_MINUTE (120, over all clients).

import { appendFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 16 * 1024;
const MAX_ATTEMPTS = 500;

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isStr = (v, pattern) => typeof v === 'string' && pattern.test(v);

const MAX_MS = 7 * 24 * 3600 * 1000;

/** Euclidean length (mm) of a round trip over points; the server does not trust lengths. */
export function tourLengthMm(points, order) {
  let sum = 0;
  for (let i = 0; i < order.length; i++) {
    const [ax, ay] = points[order[i]];
    const [bx, by] = points[order[(i + 1) % order.length]];
    sum += Math.hypot(ax - bx, ay - by);
  }
  return Math.round(sum * 100) / 100;
}

const isPermutation = (order, n) =>
  Array.isArray(order) &&
  order.length === n &&
  new Set(order).size === n &&
  order.every((v) => isInt(v, 0, n - 1));

/**
 * The record with exactly the known fields, or null if anything is off. Schema 1 (results
 * only) and schema 2 (also board points, the best order, the measure and an optional
 * nickname; the server adds the recomputed Euclidean length of the order).
 */
export function validateRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value;
  const ok =
    (r.schema === 1 || r.schema === 2) &&
    isStr(r.app, /^[0-9A-Za-z.+-]{1,40}$/) &&
    isStr(r.data, /^[a-z]{2}@\d{1,6}$/) &&
    isStr(r.puzzle, /^[0-9a-f]{8}$/) &&
    isStr(r.region, /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/) &&
    isInt(r.n, 3, 500) &&
    isNum(r.rEffMm, 0, 50) &&
    Array.isArray(r.attempts) &&
    r.attempts.length <= MAX_ATTEMPTS &&
    r.attempts.every(
      (a) => a && typeof a === 'object' && isInt(a.ms, 0, MAX_MS) && isInt(a.excessUm, 0, 1e9),
    ) &&
    (r.solvedMs === null || isInt(r.solvedMs, 0, MAX_MS)) &&
    typeof r.gaveUp === 'boolean' &&
    (r.difficulty === null || isNum(r.difficulty, 0, 1));
  if (!ok) return null;
  const base = {
    schema: r.schema,
    app: r.app,
    data: r.data,
    puzzle: r.puzzle,
    region: r.region,
    n: r.n,
    rEffMm: r.rEffMm,
    attempts: r.attempts.map((a) => ({ ms: a.ms, excessUm: a.excessUm })),
    solvedMs: r.solvedMs,
    gaveUp: r.gaveUp,
    difficulty: r.difficulty,
  };
  if (r.schema === 1) return base;
  const points = r.points;
  const ok2 =
    (r.measure === 'string' || r.measure === 'euclidean') &&
    Array.isArray(points) &&
    points.length === r.n &&
    points.every(
      (p) => Array.isArray(p) && p.length === 2 && isNum(p[0], -1e4, 1e4) && isNum(p[1], -1e4, 1e4),
    ) &&
    (r.order === null || isPermutation(r.order, r.n)) &&
    (r.nickname === null || isStr(r.nickname, /^[\p{L}\p{N} ._-]{1,30}$/u));
  if (!ok2) return null;
  return {
    ...base,
    measure: r.measure,
    points: points.map(([x, y]) => [x, y]),
    order: r.order === null ? null : [...r.order],
    nickname: r.nickname,
    lengthMm: r.order === null ? null : tourLengthMm(points, r.order),
  };
}

/** Request handler; `store` receives each valid record (with the day). */
export function createHandler({ store, allowOrigin = '*', maxPerMinute = 120, now = Date.now }) {
  let windowStart = now();
  let count = 0;
  return (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    const end = (status, body = '') => {
      res.statusCode = status;
      res.end(body);
    };
    if (req.method === 'OPTIONS') return end(204);
    if (req.method !== 'POST') return end(405);
    if (now() - windowStart > 60_000) {
      windowStart = now();
      count = 0;
    }
    if (++count > maxPerMinute) return end(429);
    let size = 0;
    const chunks = [];
    let aborted = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        aborted = true;
        end(413);
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      let record;
      try {
        record = validateRecord(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        record = null;
      }
      if (!record) return end(400);
      const day = new Date(now()).toISOString().slice(0, 10);
      Promise.resolve(store({ day, ...record })).then(
        () => end(204),
        () => end(500),
      );
    });
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.env.DATA_FILE ?? 'play-data.jsonl';
  const port = Number(process.env.PORT ?? 8787);
  const handler = createHandler({
    store: (entry) => appendFile(file, `${JSON.stringify(entry)}\n`),
    allowOrigin: process.env.ALLOW_ORIGIN ?? '*',
    maxPerMinute: Number(process.env.MAX_PER_MINUTE ?? 120),
  });
  createServer(handler).listen(port, () => {
    console.log(`play data endpoint on port ${port}, writing to ${file}`);
  });
}
