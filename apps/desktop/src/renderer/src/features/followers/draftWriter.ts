/** Serializes edits before Generate/Send. A failed save stays dirty and the next
 * explicit flush retries it. Instances are shared across remounts below. */
export function createDraftWriter(save: (text: string) => Promise<void>) {
  let latest = '';
  let version = 0;
  let savedVersion = 0;
  let running: Promise<void> | null = null;
  let retired = false;
  return {
    edit(text: string) {
      if (retired) return;
      latest = text;
      version += 1;
    },
    pendingText(): string | null { return !retired && version !== savedVersion ? latest : null; },
    isDirty() {
      return !retired && version !== savedVersion;
    },
    retire() {
      retired = true;
    },
    flush(): Promise<void> {
      if (retired) return Promise.reject(new Error('Follower draft runtime was replaced'));
      if (running !== null) return running;
      running = (async () => {
        while (!retired && savedVersion !== version) {
          const sendingVersion = version;
          const text = latest;
          await save(text);
          if (retired) throw new Error('Follower draft runtime was replaced');
          savedVersion = sendingVersion;
        }
      })().finally(() => {
        running = null;
      });
      return running;
    },
  };
}

// A renderer mount is not a write-order boundary. An old view waiting on an
// acknowledgement and a newly opened view must share one latest-edit queue.
const writers = new Map<string, ReturnType<typeof createDraftWriter>>();
export function getFollowerDraftWriter(
  accountId: string,
  fanId: string,
  save: (text: string) => Promise<void>,
) {
  const key = JSON.stringify([accountId, fanId]);
  let writer = writers.get(key);
  if (writer === undefined) {
    writer = createDraftWriter(save);
    writers.set(key, writer);
  }
  return writer;
}

/** The committed runtime identity changed. An in-flight IPC is never retried;
 * older queued edits cannot leak into the replacement runtime. */
export function resetFollowerDraftWriters(): void {
  for (const writer of writers.values()) writer.retire();
  writers.clear();
}
