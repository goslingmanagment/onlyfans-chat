import { randomUUID } from "node:crypto";
import type { AiCoordinator } from "../ai/coordinator";

/** Reuse persona fencing, metering, timeout, output sanitation and acceptance
 * correlation from the ordinary coordinator; no second AI implementation. */
export function generateFollowerGreeting(
  coordinator: AiCoordinator,
  accountId: string,
  fanId: string,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const operationId = randomUUID();
    const cleanup = (): void => {
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = (): void => {
      cleanup();
      coordinator.cancel(operationId);
      reject(signal.reason);
    };
    const unsubscribe = coordinator.subscribe((event) => {
      if (event.operationId !== operationId) return;
      if (event.type === "operation:complete") {
        cleanup();
        const parts = event.result.parts;
        if (!parts || parts.length !== 1)
          reject(new Error("AI должен вернуть одно приветствие"));
        else resolve(parts[0] ?? "");
      } else if (
        event.type === "operation:error" ||
        event.type === "operation:discarded"
      ) {
        cleanup();
        reject(
          new Error(
            "Генерация остановлена. Проверьте подключение и выбранную персону",
          ),
        );
      }
    });
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      coordinator.start({
        operationId,
        feature: "hi-greeting",
        accountId,
        chatId: fanId,
        params: { greetingMode: "new-follower" },
      });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
