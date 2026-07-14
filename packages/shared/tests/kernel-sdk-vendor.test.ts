import { describe, expect, it } from "vitest";

import { KERNEL_CONTRACT_HASH, KERNEL_SDK_VERSION, createClient, kernelOperations } from "@kernel/sdk";

import vendorManifest from "../../kernel-sdk/kernel-sdk.vendor.json";

describe("vendored @kernel/sdk", () => {
  it("loads at runtime and the vendor manifest matches the exported contract hash", () => {
    expect(KERNEL_CONTRACT_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(vendorManifest.contractHash).toBe(KERNEL_CONTRACT_HASH);
    expect(KERNEL_SDK_VERSION).toBeTruthy();
  });

  it("constructs a client exposing every operation the hub layer delegates to", () => {
    const client = createClient({
      baseUrl: "http://127.0.0.1:0",
      auth: { mode: "bearer", token: () => "k" },
    }) as unknown as Record<string, unknown>;
    // The exact SDK methods packages/shared/src/hub/client.ts calls via
    // clientFor(...) — keep in sync with that file's delegations. These are
    // SDK operation names, NOT HubClient method names (listPages etc.).
    const delegatedOps = [
      "pages",
      "pageFanProfile",
      "upsertFanProfile",
      "aiUsageBatch",
      "ingestObservations",
      "ofapiCreditsChatterSummary",
      "createOfapiCommand",
      "getOfapiCommand",
      "cancelOfapiCommand",
      "aiPersonaCatalog",
    ] as const;
    for (const op of delegatedOps) {
      expect(op in kernelOperations, `kernelOperations.${op}`).toBe(true);
      expect(typeof client[op], `client.${op}`).toBe("function");
    }
    expect(Object.keys(kernelOperations).length).toBeGreaterThan(100);
  });
});
