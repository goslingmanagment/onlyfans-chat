// Main → renderer event forwarding (SPEC §4): sync events, db change batches,
// AI operation frames, credit-balance status frames.

import type { BrowserWindow } from 'electron';
import type { OperationEvent, SyncEvent } from '@chatgoose/shared/protocol/index';
import type { CreditBalanceEvent } from '../../preload/contract';
import type { DbChangeBus } from '../db/change-bus';
import type { CreditMeter } from '../ofapi/credit-meter';
import type { SyncProvider } from '../sync/provider';
import type { SpendersRefreshFrame } from '../spenders/refresh';

interface SyncStatusEvent {
  type: 'syncStatus';
}

type StatusAwareSyncProvider = SyncProvider & {
  subscribeStatus?: (listener: () => void) => () => void;
};

export interface EventForwarderDeps {
  window: () => BrowserWindow | null;
  bus: DbChangeBus;
  sync: StatusAwareSyncProvider | null;
  creditMeter: CreditMeter | null;
  coordinator: { subscribe(listener: (event: OperationEvent) => void): () => void } | null;
  /** Spenders refresh queue progress frames (PLAN item 13), additive on sync:event. */
  spendersRefresh?: {
    subscribe(listener: (frame: SpendersRefreshFrame) => void): () => void;
  } | null;
  onSyncEvent?: (event: SyncEvent) => void;
}

export function attachEventForwarding(deps: EventForwarderDeps): () => void {
  const disposers: Array<() => void> = [];

  function send(channel: 'sync:event' | 'ai:event' | 'db:changed', payload: unknown): void {
    const win = deps.window();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }

  disposers.push(
    deps.bus.subscribe((events) => {
      for (const event of events) {
        send('db:changed', event);
      }
    }),
  );

  if (deps.sync) {
    disposers.push(
      deps.sync.subscribe((event) => {
        send('sync:event', event);
        deps.onSyncEvent?.(event);
      }),
    );
    if (deps.sync.subscribeStatus) {
      disposers.push(
        deps.sync.subscribeStatus(() => {
          const frame: SyncStatusEvent = { type: 'syncStatus' };
          send('sync:event', frame);
        }),
      );
    }
  }

  if (deps.creditMeter) {
    disposers.push(
      deps.creditMeter.subscribe((snapshot) => {
        const frame: CreditBalanceEvent = {
          type: 'creditBalance',
          balance: snapshot.balance,
          usedToday: snapshot.usedToday,
          rpmRemaining: snapshot.rpmRemaining,
        };
        send('sync:event', frame);
      }),
    );
  }

  if (deps.spendersRefresh) {
    disposers.push(deps.spendersRefresh.subscribe((frame) => send('sync:event', frame)));
  }

  if (deps.coordinator) {
    disposers.push(deps.coordinator.subscribe((event) => send('ai:event', event)));
  }

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
  };
}
