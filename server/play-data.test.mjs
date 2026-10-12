import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler, validateRecord } from './play-data.mjs';

const record = {
  schema: 1,
  app: '0.0.0+abc1234',
  data: 'de@1',
  puzzle: '0a1b2c3d',
  region: 'DE',
  n: 40,
  rEffMm: 1.5,
  attempts: [
    { ms: 61_000, excessUm: 12_300 },
    { ms: 95_000, excessUm: 0 },
  ],
  solvedMs: 95_000,
  gaveUp: false,
  difficulty: 0.62,
};

describe('play record validation', () => {
  it('accepts a record and drops unknown fields', () => {
    expect(validateRecord({ ...record, name: 'Ada', ip: '1.2.3.4' })).toEqual(record);
  });

  it('rejects malformed records', () => {
    for (const bad of [
      null,
      [],
      { ...record, schema: 3 },
      { ...record, puzzle: 'Dortmund' },
      { ...record, attempts: [{ ms: -1, excessUm: 0 }] },
      { ...record, attempts: Array.from({ length: 501 }, () => ({ ms: 1, excessUm: 1 })) },
      { ...record, difficulty: 2 },
      { ...record, solvedMs: 'soon' },
      { ...record, region: 'DE; DROP TABLE' },
    ])
      expect(validateRecord(bad)).toBeNull();
  });

  const v2 = {
    ...record,
    schema: 2,
    n: 4,
    measure: 'string',
    points: [
      [0, 0],
      [30, 0],
      [30, 40],
      [0, 40],
    ],
    order: [0, 1, 2, 3],
    nickname: 'Ada L.',
  };

  it('accepts schema 2 and recomputes the length of the submitted order', () => {
    expect(validateRecord(v2)).toEqual({ ...v2, lengthMm: 140 });
    expect(validateRecord({ ...v2, order: null, nickname: null })).toMatchObject({
      lengthMm: null,
      nickname: null,
    });
  });

  it('rejects schema 2 records with bad points, orders or nicknames', () => {
    for (const bad of [
      { ...v2, order: [0, 1, 1, 3] },
      { ...v2, order: [0, 1, 2] },
      { ...v2, points: v2.points.slice(1) },
      { ...v2, measure: 'other' },
      { ...v2, nickname: '<script>' },
      { ...v2, nickname: 'x'.repeat(31) },
    ])
      expect(validateRecord(bad)).toBeNull();
  });
});

describe('play data endpoint', () => {
  const stored = [];
  let server;
  let url;
  beforeAll(async () => {
    server = createServer(
      createHandler({
        store: (entry) => stored.push(entry),
        allowOrigin: 'https://example.org',
        maxPerMinute: 3,
        now: () => Date.UTC(2026, 9, 12, 15, 30),
      }),
    );
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${server.address().port}/`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('stores valid records with the day only, rejects others, limits the rate', async () => {
    const post = (body) =>
      fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
    const ok = await post(JSON.stringify(record));
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://example.org');
    expect(stored).toEqual([{ day: '2026-10-12', ...record }]);
    expect((await post('{not json')).status).toBe(400);
    expect((await post('x'.repeat(20_000))).status).toBe(413);
    expect((await post(JSON.stringify(record))).status).toBe(429);
    expect((await fetch(url)).status).toBe(405);
  });
});
