export type DbInvalidationScope =
  | 'accounts'
  | 'chats'
  | 'messages'
  | 'fans'
  | 'summaries'
  | 'settings'
  | 'outbox'
  | 'guard';

export interface DbInvalidationEvent {
  scope: DbInvalidationScope;
  accountId?: string | undefined;
  chatId?: string | undefined;
}

export type InvalidationKey = readonly string[];

function spendersInvalidationKeys(accountId: string): InvalidationKey[] {
  return [
    ['spenders-roster', accountId],
    ['spenders-untiered', accountId],
    ['spenders-stats', accountId],
  ];
}

function chatListInvalidationKeys(accountId: string): InvalidationKey[] {
  return [
    ['chats', accountId],
    ['chats-paged', accountId],
  ];
}

// Active-member ids stay cached in main; row previews/waiting/sendability are
// local DB joins and must refresh without another /fans/active read.
function onlineInvalidationKeys(accountId: string): InvalidationKey[] {
  return [['online', accountId]];
}

export function dbChangedInvalidationKeysForEvent(
  event: DbInvalidationEvent,
): InvalidationKey[] {
  switch (event.scope) {
    case 'accounts':
      return [['accounts']];
    case 'chats':
      if (event.accountId === undefined) {
        return [['chats']];
      }
      return [
        ...chatListInvalidationKeys(event.accountId),
        event.chatId === undefined
          ? ['chat', event.accountId]
          : ['chat', event.accountId, event.chatId],
        ['accounts'],
        ...spendersInvalidationKeys(event.accountId),
        ...onlineInvalidationKeys(event.accountId),
      ];
    case 'messages':
      return [
        event.accountId !== undefined && event.chatId !== undefined
          ? ['messages', event.accountId, event.chatId]
          : ['messages'],
        ...(event.accountId === undefined
          ? []
          : [...spendersInvalidationKeys(event.accountId), ...onlineInvalidationKeys(event.accountId)]),
      ];
    case 'outbox':
      return [
        event.accountId !== undefined && event.chatId !== undefined
          ? ['outbox', event.accountId, event.chatId]
          : ['outbox'],
        ['sync-status'],
        ['activity'],
      ];
    case 'fans':
    case 'summaries':
      return [
        event.accountId !== undefined && event.chatId !== undefined
          ? ['fan', event.accountId, event.chatId]
          : ['fan'],
        ...(event.scope === 'fans' && event.accountId !== undefined
          ? [...spendersInvalidationKeys(event.accountId), ...onlineInvalidationKeys(event.accountId)]
          : []),
      ];
    case 'settings':
      return [['settings'], ['personalities'], ['guard-config']];
    case 'guard':
      return [
        ['guard-config'],
        ['guard-blocks', event.accountId ?? 'all'],
        ['activity'],
      ];
  }
}
