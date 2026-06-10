import { contextBridge } from 'electron';

// Typed IPC surface only — grows with query:*/cmd:*/ai:*/sync:* channels (SPEC §4).
const api = {
  ping: (): string => 'pong',
};

export type PreloadApi = typeof api;

contextBridge.exposeInMainWorld('chatgoose', api);
