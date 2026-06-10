// Per-shift credit budget guard (SPEC §6.1): 80% → unobtrusive warning,
// 100% → polling slows ×4 — never silently stops.

export interface BudgetGuardOptions {
  /** null = no budget configured. */
  getBudget: () => number | null;
  getUsedToday: () => number;
  onWarning?: (usedToday: number, budget: number) => void;
}

export interface BudgetGuard {
  /** Plug into PollingSync's isBudgetExhausted. */
  isExhausted(): boolean;
  /** Call on credit-meter updates; fires the 80% warning once per UTC day. */
  check(): void;
  resetWarning(): void;
}

export function createBudgetGuard(options: BudgetGuardOptions): BudgetGuard {
  let warned = false;

  return {
    isExhausted() {
      const budget = options.getBudget();
      return budget !== null && budget > 0 && options.getUsedToday() >= budget;
    },
    check() {
      const budget = options.getBudget();
      if (budget === null || budget <= 0 || warned) {
        return;
      }
      const used = options.getUsedToday();
      if (used >= budget * 0.8) {
        warned = true;
        options.onWarning?.(used, budget);
      }
    },
    resetWarning() {
      warned = false;
    },
  };
}
