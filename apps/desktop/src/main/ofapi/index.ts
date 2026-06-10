// OFAPI client layer (SPEC §5) — factories the composition root wires.
// READ-ONLY toward OFAPI in this phase: GET endpoints only.

export { createOfApiClient, OFAPI_BASE_URL, USERS_MASS_LIST_MAX_IDS, FANS_LIST_MAX_LIMIT } from './client';
export type {
  OfApiClient,
  OfApiClientOptions,
  ChatListFilter,
  ChatListOrder,
  SkipUsers,
  MessageListOrder,
  TransactionType,
  ListChatsParams,
  ListMessagesParams,
  ListTransactionsParams,
  ListFansParams,
} from './client';

export {
  createRateLimiter,
  createRequestExecutor,
  DEFAULT_RPM,
  DEFAULT_BURST,
  DEFAULT_PER_ACCOUNT_CONCURRENCY,
  DEFAULT_GLOBAL_CONCURRENCY,
  RATE_LIMIT_BACKOFF_MS,
  SERVER_ERROR_RETRY_DELAYS_MS,
} from './rate-limiter';
export type { RateLimiter, RateLimiterOptions, RequestExecutor, RetryableResponse, SleepFn } from './rate-limiter';

export {
  paginateNextPageUrl,
  paginateLimitOffset,
  paginateMarker,
  paginateFirstLastId,
} from './pagination';
export type { PaginationWant, PaginateOutcome, PaginateCommonOptions } from './pagination';

export { createCreditMeter } from './credit-meter';
export type { CreditMeter, CreditMeterSnapshot, CreditMeterListener, HeadersLike } from './credit-meter';

export {
  OfApiError,
  mapOfApiHttpError,
  mapOfApiNetworkError,
  ofApiShapeError,
  parseRetryAfterMs,
} from './errors';
export type { OfApiHttpFailure, OfApiErrorExtras } from './errors';

export { createFixtureCapture } from './fixture-capture';
export type { FixtureCapture, FixtureCaptureOptions, CapturedExchange } from './fixture-capture';

export { createOfApiSanitizer } from './sanitize';
export type { OfApiSanitizer } from './sanitize';

export {
  accountNeedsReauth,
  ofapiAccountSchema,
  ofapiWhoamiSchema,
  ofapiChatSchema,
  ofapiChatLastMessageSchema,
  ofapiMessageSchema,
  ofapiUserSchema,
  ofapiUsersByIdSchema,
  ofapiSubscribedOnDataSchema,
  ofapiTransactionSchema,
  ofapiTransactionsDataSchema,
  ofapiFansDataSchema,
  ofapiEnvelopeSchema,
  ofapiPaginationSchema,
} from './schemas';
export type {
  OfApiAccount,
  OfApiWhoami,
  OfApiChat,
  OfApiMessage,
  OfApiUser,
  OfApiSubscribedOnData,
  OfApiTransaction,
  OfApiEnvelope,
} from './schemas';
