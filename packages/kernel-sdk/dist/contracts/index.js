// House primitives (mills, platformEnum, the error body, pagination) — extracted
// from routes.ts so the agent route module shares ONE declaration of each.
export * from "./primitives";
export * from "./routes";
// Agent Read Plane operations #1-#10 (spread into routeSchemas by routes.ts).
export * from "./routes-agent";
// Slice B: owner administration of the plane's keys (issue / list / revoke).
export * from "./routes-agent-keys";
export * from "./authorization-policy";
export * from "./domain-event-cursor";
export * from "./sdk-runtime";
export * from "./contract-hash";
// Agent Read Plane vocabulary. Declared once and derived, so a drift between
// the enum, the counts and the per-operation matrices becomes a compile error
// rather than an inconsistent response body (see the file header).
export * from "./agent-read-registry";
// Slice 0a vocabularies: the closed capability matrix a key grant is drawn from,
// and the dataset registry that is the ONLY bridge from a dataset name to code.
export * from "./agent-read-capabilities";
export * from "./agent-read-datasets";
// Client-side stop-reason predicate (coach-chat spec §8): surfaced through the
// contracts barrel — the same path that carries shared TYPES to the SDK — so
// out-of-workspace consumers (the extension) can import it from @kernel/sdk and
// apply it to a terminal stop reason before committing/attaching a generation.
export { isOutputExhausted } from "../shared/index";
export * from "./ofapi-vendor-usage";
export * from "./routes-ofapi-vendor";
export * from "./ofapi-extended-commands";
export * from "./routes-ofapi-banned-words";
