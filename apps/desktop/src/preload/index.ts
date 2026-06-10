import { contextBridge, ipcRenderer } from 'electron';
import type { ChatGooseBridge, EventChannelName, InvokeChannelName } from './contract';

const EVENT_CHANNELS: ReadonlySet<string> = new Set([
  'sync:event',
  'ai:event',
  'db:changed',
] satisfies EventChannelName[]);

const bridge: ChatGooseBridge = {
  invoke: (channel: InvokeChannelName, args: unknown) => ipcRenderer.invoke(channel, args),
  on: (channel: EventChannelName, listener) => {
    if (!EVENT_CHANNELS.has(channel)) {
      throw new Error(`Unknown event channel: ${channel}`);
    }
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      (listener as (payload: unknown) => void)(args[0]);
    };
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

export type PreloadApi = ChatGooseBridge;

contextBridge.exposeInMainWorld('chatgoose', bridge);
