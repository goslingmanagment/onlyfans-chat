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
import { createFanTransactionsQueries } from './queries/fan-transactions';
import type { FanTransactionsQueries } from './queries/fan-transactions';
import { createSummariesQueries } from './queries/summaries';
import type { SummariesQueries } from './queries/summaries';
import { createSettingsQueries } from './queries/settings';
import type { SettingsQueries } from './queries/settings';
import { createOutboxQueries } from './queries/outbox';
import type { OutboxQueries } from './queries/outbox';
import { createCreditLogQueries } from './queries/credit-log';
import type { CreditLogQueries } from './queries/credit-log';
import { createAiSpendLogQueries } from './queries/ai-spend';
import type { AiSpendLogQueries } from './queries/ai-spend';
import { createMediaUrlsQueries } from './queries/media-urls';
import type { MediaUrlsQueries } from './queries/media-urls';
import { createThreadFetchLogQueries } from './queries/thread-fetch-log';
import type { ThreadFetchLogQueries } from './queries/thread-fetch-log';

export interface DataLayer {
  db: ChatGooseDb;
  bus: DbChangeBus;
  accounts: AccountsQueries;
  chats: ChatsQueries;
  messages: MessagesQueries;
  fans: FansQueries;
  fanTransactions: FanTransactionsQueries;
  summaries: SummariesQueries;
  settings: SettingsQueries;
  outbox: OutboxQueries;
  creditLog: CreditLogQueries;
  aiSpendLog: AiSpendLogQueries;
  mediaUrls: MediaUrlsQueries;
  threadFetchLog: ThreadFetchLogQueries;
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
    fanTransactions: createFanTransactionsQueries(db, bus),
    summaries: createSummariesQueries(db, bus),
    settings: createSettingsQueries(db, bus),
    outbox: createOutboxQueries(db, bus),
    creditLog: createCreditLogQueries(db),
    aiSpendLog: createAiSpendLogQueries(db),
    mediaUrls: createMediaUrlsQueries(db),
    threadFetchLog: createThreadFetchLogQueries(db),
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
  ChatListRow,
  FanRow,
  FanUpsert,
  FanSpending,
  FanSubscription,
  FanTransactionRow,
  FanTransactionUpsert,
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
export { createFanTransactionsQueries } from './queries/fan-transactions';
export type { FanTransactionsQueries } from './queries/fan-transactions';
export { createSummariesQueries } from './queries/summaries';
export type { SummariesQueries } from './queries/summaries';
export { createSettingsQueries } from './queries/settings';
export type { SettingsQueries } from './queries/settings';
export { createOutboxQueries, decodeOutboxRow } from './queries/outbox';
export type {
  OutboxQueries,
  OutboxRow,
  OutboxInsert,
  OutboxMediaId,
  OutboxState,
  OutboxTransport,
  OutboxTransitionArgs,
} from './queries/outbox';
export { createCreditLogQueries } from './queries/credit-log';
export type { CreditLogQueries } from './queries/credit-log';
export { createAiSpendLogQueries } from './queries/ai-spend';
export type { AiSpendLogQueries, AiSpendRunArgs } from './queries/ai-spend';
export { createMediaUrlsQueries } from './queries/media-urls';
export type { MediaUrlsQueries } from './queries/media-urls';
