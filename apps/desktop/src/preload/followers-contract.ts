/** Narrow renderer models: provider JSON and request headers stay in main. */
export type FollowerStatus =
  | "pending"
  | "checking"
  | "ready"
  | "replied"
  | "contacted"
  | "unknown"
  | "blocked"
  | "sending"
  | "sent";
export interface FollowerRowVM {
  fanId: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  subscribedAt: string | null;
  status: FollowerStatus;
  reason: string;
  checkedAt: string | null;
  proof: { at: string; text: string; kind: "personal" | "incoming" } | null;
  revision: string | null;
  hasDraft: boolean;
}
export interface FollowersSnapshotVM {
  runId: string | null;
  state: "idle" | "running" | "paused" | "complete" | "error";
  stage: string;
  from: string | null;
  to: string | null;
  startedAt: string | null;
  checked: number;
  total: number;
  requests: number;
  cooldownUntil: number | null;
  truncated: boolean;
  error: string | null;
  counts: Record<FollowerStatus, number>;
  rows: FollowerRowVM[];
  matching: number;
  debug: boolean;
}
export interface FollowerMessageVM {
  id: string;
  at: string;
  fromMe: boolean;
  text: string;
  mediaCount: number;
  kind: "personal" | "incoming" | "automatic" | "ambiguous";
}
export interface FollowerDetailVM {
  row: FollowerRowVM;
  about: string;
  messages: FollowerMessageVM[];
  hasOlder: boolean;
  draft: string;
  generating: boolean;
  sending: boolean;
}
export interface FollowerTraceVM {
  seq: number;
  at: string;
  elapsedMs: number;
  fanId: string | null;
  event: string;
  detail: Record<string, string | number | boolean | null>;
}
export interface FollowersChannels {
  "query:followers.snapshot": {
    args: {
      accountId: string;
      offset?: number | undefined;
      limit?: number | undefined;
      filter?: FollowerStatus | "all" | undefined;
      search?: string | undefined;
    };
    result: FollowersSnapshotVM;
  };
  "query:followers.detail": {
    args: { accountId: string; fanId: string };
    result: FollowerDetailVM | null;
  };
  "cmd:followers.start": {
    args: { accountId: string; hours: number; acknowledgeRead: true };
    result: void;
  };
  "cmd:followers.pause": { args: { accountId: string }; result: void };
  "cmd:followers.resume": { args: { accountId: string }; result: void };
  "cmd:followers.recheck": {
    args: { accountId: string; fanId: string };
    result: void;
  };
  "cmd:followers.older": {
    args: { accountId: string; fanId: string };
    result: void;
  };
  "cmd:followers.draft": {
    args: { accountId: string; fanId: string; text: string };
    result: void;
  };
  "cmd:followers.generate": {
    args: { accountId: string; fanId: string };
    result: void;
  };
  "cmd:followers.send": {
    args: { accountId: string; fanId: string; revision: string; text: string };
    result: void;
  };
  "query:followers.trace": {
    args: {
      accountId: string;
      runId?: string | undefined;
      offset?: number | undefined;
      fanId?: string | undefined;
      search?: string | undefined;
    };
    result: {
      runs: { id: string; startedAt: string }[];
      events: FollowerTraceVM[];
      total: number;
      dropped: number;
    };
  };
  "cmd:followers.export": {
    args: { accountId: string; runId?: string | undefined };
    result: { path: string | null };
  };
}
