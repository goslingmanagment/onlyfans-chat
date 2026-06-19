export * from './types';
export * from './constants';
export * from './features';
export * from './errors/index';
export * from './output/split';
export * from './output/xml';
export * from './output/reply-output';
export * from './prompts/escape';
export * from './prompts/templates';
export * from './prompts/builder';
export * from './prompts/personalities';
export * from './llm/model-registry';
export * from './llm/capabilities';
export * from './llm/cost';
export * from './llm/sse';
export * from './transcript/index';
export * from './activity/index';
export * from './i18n/index';
export * from './context/spending';
export * from './context/subscription';
export * from './protocol/index';
export * from './summary/validity';
export * from './spenders/index';
export * from './hub/mode';
// hub/client + hub/usage-reporter are main-only (network/persistence — SPEC §15)
// and deliberately not in this barrel; import them via '@chatgoose/shared/hub'.
// The pure account→page mapping helper is safe everywhere (settings UI preview).
export * from './hub/page-mapping';

// Ambiguity resolution for names defined in two modules (same values; one canonical home).
export { PING_ACTIVE_WINDOW_MS, PING_MIN_FAN_MESSAGES } from './constants';
export { formatUsd } from './llm/cost';
export { userFacingErrorSchema } from './errors/index';
