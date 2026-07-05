import { describe, expect, it } from "vitest";

import { KERNEL_CONTRACT_HASH, KERNEL_SDK_VERSION, createClient, kernelOperations } from "@kernel/sdk";

import vendorManifest from "../../kernel-sdk/kernel-sdk.vendor.json";

describe("vendored @kernel/sdk", () => {
  it("loads at runtime and the vendor manifest matches the exported contract hash", () => {
    expect(KERNEL_CONTRACT_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(vendorManifest.contractHash).toBe(KERNEL_CONTRACT_HASH);
    expect(KERNEL_SDK_VERSION).toBeTruthy();
  });

  it("constructs a client with the operations the hub layer delegates to", () => {
    const client = createClient({ baseUrl: "http://127.0.0.1:0", auth: { mode: "bearer", token: () => "k" } });
    for (const op of ["listPages", "getFanProfile", "putFanProfile", "usageBatch", "ofapiCreditsSummary", "ofapiCommandCreate", "ofapiCommandGet", "ofapiCommandCancel"] as const) {
      void op;
    }
    expect(typeof client).toBe("object");
    expect(Object.keys(kernelOperations).length).toBeGreaterThan(100);
  });
});
