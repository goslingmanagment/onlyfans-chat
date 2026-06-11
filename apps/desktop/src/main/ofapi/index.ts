// OFAPI client layer (SPEC §5) — factories the composition root wires.
// Reads retry idempotently; the SPEC §7 write paths run with retry:'none'
// (exactly one attempt) and the outbox classifies failures via
// classifySendFailure — indeterminate outcomes are NEVER auto-retried.

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
  SendMessageParams,
  MessageRefParams,
  ChatRefParams,
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
export type {
  RateLimiter,
  RateLimiterOptions,
  RequestExecutor,
  RetryableResponse,
  RetryPolicy,
  ExecuteOptions,
  SleepFn,
} from './rate-limiter';

export { classifySendFailure } from './send-outcome';
export type { SendFailureKind } from './send-outcome';

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
  ofapiSentMessageSchema,
  ofapiSuccessDataSchema,
  ofapiLikeDataSchema,
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
  OfApiSentMessage,
  OfApiLikeResult,
  OfApiUser,
  OfApiSubscribedOnData,
  OfApiTransaction,
  OfApiEnvelope,
} from './schemas';
