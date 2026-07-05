import type { Platform } from "./types";
export declare const MOSCOW_TIME_ZONE = "Europe/Moscow";
export declare const UTC_TIME_ZONE = "UTC";
export declare const PERIOD_OPTIONS: readonly ["today", "7d", "30d", "all", "custom"];
export declare const SPENDER_PERIOD_OPTIONS: readonly ["today", "7d", "30d", "90d", "180d", "mtd", "custom", "lifetime"];
export declare const SPENDER_SERIES_GRANULARITIES: readonly ["day", "week", "month", "auto"];
interface DateParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}
export type Period = (typeof PERIOD_OPTIONS)[number];
export type SpenderPeriod = (typeof SPENDER_PERIOD_OPTIONS)[number];
export type SpenderSeriesGranularity = (typeof SPENDER_SERIES_GRANULARITIES)[number];
export interface PeriodBounds {
    from: Date | null;
    to: Date | null;
}
export interface BusinessDateRange {
    from: string | null;
    toExclusive: string | null;
}
export declare function isPeriod(value: string): value is Period;
export declare function parsePeriod(value: string): Period;
export declare function isSpenderPeriod(value: string): value is SpenderPeriod;
export declare function parseSpenderPeriod(value: string): SpenderPeriod;
export declare function zonedDateTimeToUtc(parts: Pick<DateParts, "year" | "month" | "day"> & Partial<Pick<DateParts, "hour" | "minute" | "second">>, timeZone: string): Date;
export declare function startOfBusinessDay(date: Date, timeZone?: string): Date;
export declare function addUtcDays(date: Date, days: number): Date;
export declare function toBusinessDate(date: Date, timeZone?: string): string;
export declare function isValidBusinessDateString(value: string): boolean;
export declare function parseBusinessDate(value: string): {
    year: number;
    month: number;
    day: number;
};
export declare function resolveBusinessTimeZone(platform: Platform): string;
export declare function businessDateToUtcStart(value: string, timeZone?: string): Date;
export declare function resolvePeriodBounds(period: Period, now?: Date, custom?: {
    from: string;
    to: string;
}, timeZone?: string): PeriodBounds;
export declare function resolveRevenuePeriodBoundsForPlatform(platform: Platform, period: Period, now?: Date, custom?: {
    from: string;
    to: string;
}): PeriodBounds;
export declare function resolveComparisonPeriodBounds(period: Period, now?: Date, custom?: {
    from: string;
    to: string;
}, timeZone?: string): PeriodBounds | null;
export declare function resolveRevenueComparisonPeriodBoundsForPlatform(platform: Platform, period: Period, now?: Date, custom?: {
    from: string;
    to: string;
}): PeriodBounds | null;
export declare function resolveBusinessDateRange(period: Period, now?: Date, custom?: {
    from: string;
    to: string;
}, timeZone?: string): BusinessDateRange;
export declare function resolveBusinessDateRangeForPlatform(platform: Platform, period: Period, now?: Date, custom?: {
    from: string;
    to: string;
}): BusinessDateRange;
export declare function resolveRevenueBusinessDateRangeForPlatform(platform: Platform, period: Period, now?: Date, custom?: {
    from: string;
    to: string;
}): BusinessDateRange;
export declare function resolveSpenderPeriodBoundsForPlatform(platform: Platform, period: SpenderPeriod, now?: Date, custom?: {
    from: string;
    to: string;
}): PeriodBounds;
export declare function resolveSpenderComparisonPeriodBoundsForPlatform(platform: Platform, period: SpenderPeriod, now?: Date, custom?: {
    from: string;
    to: string;
}): PeriodBounds | null;
export declare function resolveSpenderBusinessDateRangeForPlatform(platform: Platform, period: SpenderPeriod, now?: Date, custom?: {
    from: string;
    to: string;
}): {
    timeZone: string;
    fromBusinessDate: string | null;
    toBusinessDateInclusive: string | null;
    bounds: PeriodBounds;
};
export declare function diffBusinessDays(fromBusinessDate: string, toBusinessDateInclusive: string): number;
export declare function resolveAutoSpenderSeriesGranularity(fromBusinessDate: string, toBusinessDateInclusive: string): Exclude<SpenderSeriesGranularity, "auto">;
export declare function nextBusinessDate(value: string): string;
export declare function previousBusinessDate(value: string): string;
export {};
