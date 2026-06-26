// The Online surface's board store — a SECOND instance of the shared board store
// (createBoardStore), so the reused QuickLook overlay + KeymapProvider
// J/K/SPACE/O/Ping drive Online exactly as they drive Spenders. The tier-only
// fields (chip/expanded/untieredOpen/stats*) lie dormant at defaults — Online
// never reads them (DESIGN §3.6: per-field selectors only).

import { createBoardStore } from '../spenders/spendersStore';

export const useOnlineStore = createBoardStore();
