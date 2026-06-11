// Activity panel domain (PLAN item 9; binding mockup
// docs/mockups/experiments/activity-panel.html): OFAPI call purposes for the
// per-purpose credit ledger, plus pure aggregation for the credits and AI-spend
// ledgers. Platform-pure — consumed by main (instrumentation + IPC assembly)
// and by tests; the renderer only sees the assembled view-models.

export {
  OFAPI_PURPOSES,
  OFAPI_PURPOSE_LABELS,
  UNTAGGED_PURPOSE,
  purposeLabel,
} from './purposes';
export type { OfApiPurpose } from './purposes';
export {
  buildCreditLedger,
  estimateCreditDaysLeft,
} from './credit-ledger';
export type { CreditLedger, CreditLedgerEntry, CreditLedgerRow } from './credit-ledger';
export {
  AI_FEATURE_LABELS,
  aiFeatureLabel,
  buildAiSpendLedger,
  isInsertableFeature,
} from './ai-spend';
export type { AiSpendDayRow, AiSpendLedger, AiSpendLedgerRow, AiSpendTopRun } from './ai-spend';
