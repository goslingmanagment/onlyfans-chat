export * from "./routes";
export * from "./authorization-policy";
export * from "./domain-event-cursor";
export * from "./sdk-runtime";
export * from "./contract-hash";
// Client-side stop-reason predicate (coach-chat spec §8): surfaced through the
// contracts barrel — the same path that carries shared TYPES to the SDK — so
// out-of-workspace consumers (the extension) can import it from @kernel/sdk and
// apply it to a terminal stop reason before committing/attaching a generation.
export { isOutputExhausted } from "../shared/index";
