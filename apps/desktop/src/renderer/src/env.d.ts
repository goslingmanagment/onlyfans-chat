declare module '*.css';

type PreloadApi = import('../../preload/index').PreloadApi;

interface Window {
  /** Absent outside Electron (plain vite dev / tests) — dev mock bridge kicks in. */
  chatgoose?: PreloadApi;
}
