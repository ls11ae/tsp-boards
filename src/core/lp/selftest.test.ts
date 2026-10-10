import loadHighs from 'highs';
import { describe, expect, it } from 'vitest';
import type { HighsLike } from './highs';
import { runLpSelfTest } from './selftest';

describe('HiGHS (WebAssembly) in Node', () => {
  it('solves the self-test MIP', async () => {
    const highs: HighsLike = await loadHighs();
    expect(runLpSelfTest(highs)).toEqual({ ok: true, status: 'Optimal', objective: 23 });
  });

  it('keeps working after repeated solves in one module instance', async () => {
    // Older highs-js releases failed after ~4095 solves in the same instance (issues #5, #10).
    // 5000 solves passed with highs 1.15.3 (2026-10-10); each MIP run costs ~9 ms, so CI runs
    // a shorter loop.
    const highs: HighsLike = await loadHighs();
    for (let i = 0; i < 300; i++) {
      if (!runLpSelfTest(highs).ok) throw new Error(`self-test failed at solve ${i}`);
    }
  }, 60_000);
});
