export type DomainEventWatermarks = ReadonlyMap<number, number>;
export type DecodedDomainEventCursor = {
    ok: true;
    watermarks: Map<number, number>;
} | {
    ok: false;
    reason: string;
};
export declare function encodeDomainEventCursor(watermarks: DomainEventWatermarks): string;
export declare function decodeDomainEventCursor(text: string): DecodedDomainEventCursor;
