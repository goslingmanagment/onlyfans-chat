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
  settingsKeys?: string[] | undefined;
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

/** Only main's committed runtime swap proves that Hub origin/principal changed.
 * Catalog and mapping writes are fenced per operation in main and need query
 * invalidation, never a renderer-wide AI reset. */
export function settingsKeysInvalidateAiContext(settingsKeys: readonly string[] | undefined): boolean {
  return settingsKeys?.includes('runtime.aiContext') ?? false;
}

function settingsInvalidationKeys(event: DbInvalidationEvent): InvalidationKey[] {
  const keys = event.settingsKeys;
  const invalidations: InvalidationKey[] = [['settings']];
  if (keys === undefined) return invalidations;
  const catalogChanged = keys.some((key) => key.startsWith('personalities.catalog.'));
  const mappingChanged = keys.some((key) =>
    key === 'accountMappings' || key.startsWith('personalities.accountMappings.'));
  const runtimeChanged = keys.includes('runtime.aiContext') || keys.includes('hubBaseUrl');
  if (catalogChanged || runtimeChanged) invalidations.push(['personalities']);
  if (
    catalogChanged
    || mappingChanged
    || runtimeChanged
    || keys.includes('accountPageLabels')
  ) {
    invalidations.push(['accounts']);
  }
  if (catalogChanged || runtimeChanged) {
    invalidations.push(['fan']);
  } else if (mappingChanged && event.accountId !== undefined) {
    invalidations.push(['fan', event.accountId]);
  }
  return invalidations;
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
      return settingsInvalidationKeys(event);
    case 'guard':
      return [
        ['guard-config'],
        ['guard-blocks', event.accountId ?? 'all'],
        ['activity'],
      ];
  }
}
