export type DomainEventWatermarks = ReadonlyMap<number, number>;
export type DomainEventCursorScope = "granted";
export interface DomainEventCursorRecovery {
    kind: "snapshot";
    /** Highest non-dry-run erasure_log id observed when the cursor was minted. */
    erasureEpoch: number;
    /** Immutable snapshot cursor before recovery replay starts. */
    base: DomainEventWatermarks;
    /** Immutable account heads captured by the snapshot response. */
    targets: DomainEventWatermarks;
    /** Retained row count in each `(base, target]` interval at mint time. */
    retainedCounts: DomainEventWatermarks;
}
export type DecodedDomainEventCursor = {
    ok: true;
    watermarks: Map<number, number>;
    scope: DomainEventCursorScope | null;
    recovery: DomainEventCursorRecovery | null;
} | {
    ok: false;
    reason: string;
};
export declare function encodeDomainEventCursor(watermarks: DomainEventWatermarks, options?: {
    scope?: DomainEventCursorScope;
    recovery?: DomainEventCursorRecovery;
}): string;
export declare function decodeDomainEventCursor(text: string): DecodedDomainEventCursor;
