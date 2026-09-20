// New Followers greeting request shape. Core Decision 379 turned hi-greeting
// into one feature with an explicit variant count: the queue asks for the
// single draft it sends, and the deprecated `greetingMode: "new-follower"`
// alias is gone from this client.

import { expect, test } from "vitest";
import { generateFollowerGreeting } from "../../src/main/followers/generation";
import type { AiCoordinator } from "../../src/main/ai/index";
import type { OperationEvent } from "@chatgoose/shared/protocol/index";

function stubCoordinator(): {
  coordinator: AiCoordinator;
  starts: Array<Record<string, unknown>>;
  emit: (event: OperationEvent) => void;
  cancels: string[];
} {
  const starts: Array<Record<string, unknown>> = [];
  const cancels: string[] = [];
  const listeners = new Set<(event: OperationEvent) => void>();
  const coordinator = {
    start: (req: Record<string, unknown>) => {
      starts.push(req);
    },
    cancel: (operationId: string) => {
      cancels.push(operationId);
    },
    subscribe: (listener: (event: OperationEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as AiCoordinator;
  return {
    coordinator,
    starts,
    cancels,
    emit: (event) => {
      for (const listener of [...listeners]) listener(event);
    },
  };
}

test("asks the kernel for one variant and never sends the deprecated alias", async () => {
  const { coordinator, starts, emit } = stubCoordinator();
  const pending = generateFollowerGreeting(
    coordinator,
    "acct_1",
    "12345",
    new AbortController().signal,
  );

  expect(starts).toHaveLength(1);
  const request = starts[0] as {
    operationId: string;
    feature: string;
    accountId: string;
    chatId: string;
    params: Record<string, unknown>;
  };
  expect(request.feature).toBe("hi-greeting");
  expect(request.accountId).toBe("acct_1");
  expect(request.chatId).toBe("12345");
  expect(request.params).toEqual({ variantCount: 1 });
  expect(request.params).not.toHaveProperty("greetingMode");

  emit({
    type: "operation:complete",
    operationId: request.operationId,
    feature: "hi-greeting",
    result: { rawText: "hey there", parts: ["hey there"] },
  } as OperationEvent);

  await expect(pending).resolves.toBe("hey there");
});

test("refuses a multi-part result: the queue sends exactly one message", async () => {
  const { coordinator, starts, emit } = stubCoordinator();
  const pending = generateFollowerGreeting(
    coordinator,
    "acct_1",
    "12345",
    new AbortController().signal,
  );
  const operationId = (starts[0] as { operationId: string }).operationId;

  emit({
    type: "operation:complete",
    operationId,
    feature: "hi-greeting",
    result: { rawText: "a[NEXT]b", parts: ["a", "b"] },
  } as OperationEvent);

  await expect(pending).rejects.toThrow("одно приветствие");
});

test("aborting cancels the operation and rejects", async () => {
  const { coordinator, starts, cancels } = stubCoordinator();
  const controller = new AbortController();
  const pending = generateFollowerGreeting(
    coordinator,
    "acct_1",
    "12345",
    controller.signal,
  );
  const operationId = (starts[0] as { operationId: string }).operationId;

  const reason = new Error("stopped");
  controller.abort(reason);

  await expect(pending).rejects.toBe(reason);
  expect(cancels).toEqual([operationId]);
});
