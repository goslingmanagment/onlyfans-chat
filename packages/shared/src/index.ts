export * from './types';
export * from './constants';
export * from './features';
export * from './errors/index';
export * from './usage-metrics';
export * from './output/split';
export * from './output/xml';
export * from './output/reply-output';
export * from './transcript/index';
export * from './activity/index';
export * from './i18n/index';
export * from './protocol/index';
export * from './summary/validity';
export * from './spenders/index';
export * from './message-guard/index';
export * from './hub/mode';
// hub/client + hub/usage-reporter are main-only (network/persistence — SPEC §15)
// and deliberately not in this barrel; import them via '@chatgoose/shared/hub'.
// The pure account→page mapping helper is safe everywhere (settings UI preview).
export * from './hub/page-mapping';

// Ambiguity resolution for names defined in two modules (same values; one canonical home).
export { PING_ACTIVE_WINDOW_MS, PING_MIN_FAN_MESSAGES } from './constants';
export * from './context/spending';
export * from './context/subscription';
export { userFacingErrorSchema } from './errors/index';
