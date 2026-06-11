// SQLite data layer (SPEC §10, §6.3). The composition root calls
// createDataLayer() once with the keychain-held encryption key and wires
// bus.subscribe → webContents.send('db:changed', …).

import { openDatabase } from './database';
import type { ChatGooseDb, OpenDatabaseOptions } from './database';
import { createChangeBus } from './change-bus';
import type { DbChangeBus } from './change-bus';
import { createAccountsQueries } from './queries/accounts';
import type { AccountsQueries } from './queries/accounts';
import { createChatsQueries } from './queries/chats';
import type { ChatsQueries } from './queries/chats';
import { createMessagesQueries } from './queries/messages';
import type { MessagesQueries } from './queries/messages';
import { createFansQueries } from './queries/fans';
import type { FansQueries } from './queries/fans';
import { createSummariesQueries } from './queries/summaries';
import type { SummariesQueries } from './queries/summaries';
import { createSettingsQueries } from './queries/settings';
import type { SettingsQueries } from './queries/settings';
import { createCreditLogQueries } from './queries/credit-log';
import type { CreditLogQueries } from './queries/credit-log';
import { createMediaUrlsQueries } from './queries/media-urls';
import type { MediaUrlsQueries } from './queries/media-urls';

export interface DataLayer {
  db: ChatGooseDb;
  bus: DbChangeBus;
  accounts: AccountsQueries;
  chats: ChatsQueries;
  messages: MessagesQueries;
  fans: FansQueries;
  summaries: SummariesQueries;
  settings: SettingsQueries;
  creditLog: CreditLogQueries;
  mediaUrls: MediaUrlsQueries;
  close(): void;
}

export function createDataLayer(options: OpenDatabaseOptions & { bus?: DbChangeBus }): DataLayer {
  const db = openDatabase(options);
  const bus = options.bus ?? createChangeBus();
  return {
    db,
    bus,
    accounts: createAccountsQueries(db, bus),
    chats: createChatsQueries(db, bus),
    messages: createMessagesQueries(db, bus),
    fans: createFansQueries(db, bus),
    summaries: createSummariesQueries(db, bus),
    settings: createSettingsQueries(db, bus),
    creditLog: createCreditLogQueries(db),
    mediaUrls: createMediaUrlsQueries(db),
    close() {
      bus.flushNow();
      bus.dispose();
      db.close();
    },
  };
}

export { openDatabase } from './database';
export type { ChatGooseDb, OpenDatabaseOptions } from './database';
export { createChangeBus, DB_CHANGE_FLUSH_MS } from './change-bus';
export type { DbChangeBus, DbChangeListener, DbChangedEvent } from './change-bus';
export { loadSqliteDriver } from './driver';
export type { SqliteDatabase, SqliteStatement, SqliteDriverConstructor, BindParams, SqlValue } from './driver';
export { MIGRATIONS, SCHEMA_VERSION, runMigrations, readSchemaVersion } from './migrations';
export type { Migration } from './migrations';
export { toSqlBool, toJson } from './rows';
export type {
  AccountAuthState,
  AccountRow,
  AccountUpsert,
  ChatRow,
  ChatUpsert,
  FanRow,
  FanUpsert,
  FanSpending,
  FanSubscription,
  MessageRow,
  MessageUpsert,
  MessageMediaItem,
  MessageReplyTo,
} from './rows';
export { createAccountsQueries } from './queries/accounts';
export type { AccountsQueries, AccountListRow } from './queries/accounts';
export { createChatsQueries } from './queries/chats';
export type { ChatsQueries, ChatListPage } from './queries/chats';
export { createMessagesQueries, MESSAGE_RETENTION_DEFAULT } from './queries/messages';
export type { MessagesQueries, MessagePage } from './queries/messages';
export { createFansQueries } from './queries/fans';
export type { FansQueries } from './queries/fans';
export { createSummariesQueries } from './queries/summaries';
export type { SummariesQueries } from './queries/summaries';
export { createSettingsQueries } from './queries/settings';
export type { SettingsQueries } from './queries/settings';
export { createCreditLogQueries } from './queries/credit-log';
export type { CreditLogQueries } from './queries/credit-log';
export { createMediaUrlsQueries } from './queries/media-urls';
export type { MediaUrlsQueries } from './queries/media-urls';
