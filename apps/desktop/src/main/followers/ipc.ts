import { ipcMain, dialog } from "electron";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import type { FollowersService } from "./service";

const account = z.object({ accountId: z.string().min(1).max(128) });
const fan = account.extend({ fanId: z.string().regex(/^\d+$/).max(32) });
const run = account.extend({ runId: z.string().uuid().optional() });

export function registerFollowersIpc(
  getService: () => FollowersService | null,
): void {
  const service = (): FollowersService => {
    const value = getService();
    if (!value) throw new Error("Подключите аккаунт к Hub");
    return value;
  };
  ipcMain.handle("query:followers.snapshot", (_event, raw: unknown) =>
    service().snapshot(
      account
        .extend({
          offset: z.number().int().min(0).max(5_000).optional(),
          limit: z.number().int().min(1).max(200).optional(),
          filter: z
            .enum([
              "all",
              "pending",
              "checking",
              "ready",
              "replied",
              "contacted",
              "unknown",
              "blocked",
              "sending",
              "sent",
            ])
            .optional(),
          search: z.string().max(200).optional(),
        })
        .parse(raw),
    ),
  );
  ipcMain.handle("query:followers.detail", (_event, raw: unknown) => {
    const args = fan.parse(raw);
    return service().detail(args.accountId, args.fanId);
  });
  ipcMain.handle("cmd:followers.start", (_event, raw: unknown) => {
    const args = account
      .extend({
        hours: z.number().int().min(1).max(720),
        acknowledgeRead: z.literal(true),
      })
      .parse(raw);
    service().start(args.accountId, args.hours);
  });
  ipcMain.handle("cmd:followers.pause", (_event, raw: unknown) =>
    service().pause(account.parse(raw).accountId),
  );
  ipcMain.handle("cmd:followers.resume", (_event, raw: unknown) =>
    service().resume(account.parse(raw).accountId),
  );
  for (const action of ["recheck", "older", "generate"] as const)
    ipcMain.handle(`cmd:followers.${action}`, (_event, raw: unknown) => {
      const args = fan.parse(raw);
      return service()[action](args.accountId, args.fanId);
    });
  ipcMain.handle("cmd:followers.draft", (_event, raw: unknown) => {
    const args = fan.extend({ text: z.string().max(5_000) }).parse(raw);
    return service().draft(args.accountId, args.fanId, args.text);
  });
  ipcMain.handle("cmd:followers.send", (_event, raw: unknown) => {
    const args = fan
      .extend({
        text: z.string().trim().min(1).max(5_000),
        revision: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(raw);
    return service().send(args.accountId, args.fanId, args.revision, args.text);
  });
  ipcMain.handle("query:followers.trace", (_event, raw: unknown) =>
    service().trace(
      run
        .extend({
          offset: z.number().int().min(0).max(100_000).optional(),
          fanId: z.string().regex(/^\d+$/).max(32).optional(),
          search: z.string().max(200).optional(),
        })
        .parse(raw),
    ),
  );
  ipcMain.handle("cmd:followers.export", async (_event, raw: unknown) => {
    const args = run.parse(raw);
    const text = service().exportText(args.accountId, args.runId);
    const result = await dialog.showSaveDialog({
      defaultPath: `followers-${args.accountId}-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`,
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (result.canceled || !result.filePath) return { path: null };
    await writeFile(result.filePath, text, { encoding: "utf8", mode: 0o600 });
    return { path: result.filePath };
  });
}
