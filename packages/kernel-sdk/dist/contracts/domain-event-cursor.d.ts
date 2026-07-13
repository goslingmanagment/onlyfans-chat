export type DomainEventWatermarks = ReadonlyMap<number, number>;
export type DomainEventCursorScope = "granted";
export type DecodedDomainEventCursor = {
    ok: true;
    watermarks: Map<number, number>;
    scope: DomainEventCursorScope | null;
} | {
    ok: false;
    reason: string;
};
export declare function encodeDomainEventCursor(watermarks: DomainEventWatermarks, options?: {
    scope?: DomainEventCursorScope;
}): string;
export declare function decodeDomainEventCursor(text: string): DecodedDomainEventCursor;
