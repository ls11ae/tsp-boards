import loadHighs, { type Highs } from 'highs';
import wasmUrl from 'highs/runtime?url';

/** Loads HiGHS in a module worker; Vite emits the .wasm file as a hashed asset. */
export function loadHighsInWorker(): Promise<Highs> {
  return loadHighs({ locateFile: () => wasmUrl });
}
