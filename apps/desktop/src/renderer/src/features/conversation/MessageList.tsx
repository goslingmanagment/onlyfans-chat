// The workspace chat thread: a thin shell over the shared <Thread> (stick mode,
// comfortable density). All virtualizer/scroll/scrollback/bottom-stick logic
// lives in Thread.tsx, shared with the Spenders quick-look preview so the two
// can never drift apart.

import { Thread } from './Thread';

export function MessageList({
  accountId,
  chatId,
  fanName,
}: {
  accountId: string;
  chatId: string;
  fanName: string;
}): React.JSX.Element {
  return (
    <Thread
      accountId={accountId}
      chatId={chatId}
      fanName={fanName}
      scrollMode="stick"
      density="comfortable"
    />
  );
}
