/**
 * Mount point for the AI dock (P2). Sits between the thread and the composer —
 * the dock agent renders draft-bubble cards here (DESIGN §1). Renders nothing
 * until given children.
 */
export function AiDockSlot({ children }: { children?: React.ReactNode }): React.JSX.Element | null {
  if (children === undefined || children === null) return null;
  return <div className="mx-[18px] mt-2 flex-none">{children}</div>;
}
