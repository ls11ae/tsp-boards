// Browser stand-in for "node:module" (roadmap 7.6): the HiGHS loader imports it only in its Node
// branch, which never runs in a browser; without this alias Vite emits empty
// "__vite-browser-external" chunks for it.
export function createRequire(): never {
  throw new Error('node:module is not available in the browser');
}
