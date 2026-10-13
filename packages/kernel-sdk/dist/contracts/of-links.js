import { z } from "zod";
import { businessDate, isoTimestamp, mills } from "./primitives";
// «Ссылки OnlyFans» (traffic sources plan 2026-10-08, PR 12): the owner's read
// of the link series (page_link_stat_*), the "link → channel → contractor"
// bindings (traffic_*) and the series' collection state. No vendor egress, no
// writes.
//
// Vocabulary shared by all three routes:
//   - "fans" are claims on a trial link and subscribers on a tracking link;
//     `fansMetric` says which one a figure holds.
//   - Business days are Europe/Moscow from 00:00; every business date travels
//     with the UTC instants it stands for.
//   - Money is integer mills. Every money figure is the creator's NET after the
//     OnlyFans fee (vendor revenue.total, refunds and chargebacks already out):
//     `revenueBasis` names it on every block.
//   - Vendor counters are cumulative values as OFAPI reported them when Hub
//     read its cache. A delta is the difference of the last snapshots before
//     two instants, and carries the snapshot times it rests on and flags.
//
// Hub's OWN money (PR 13) has its place in every response from the start: the
// `hubMoney` blocks and the comparison. Until PR 13 fills them they come back
// `state: "no_data"`, `reason: "not_computed"`, every figure null.
/** creator_net_after_platform_fee: after the OnlyFans fee, refunds and chargebacks. */
export const OF_LINKS_REVENUE_BASIS = "creator_net_after_platform_fee";
/** The rule Hub's own figure is attributed by (PR 13): a transaction belongs to
 * the links whose subscription period holds it, split equally when several do. */
export const OF_LINKS_ATTRIBUTION_RULE = "ofapi_subscription_period_equal_split.v1";
export const OF_LINKS_BUSINESS_TIME_ZONE = "Europe/Moscow";
export const ofLinkKindSchema = z.enum(["tracking", "trial"]);
export const ofLinkFansMetricSchema = z.enum(["claims", "subscribers"]);
/** `expired`: the link's end (trial expiredAt, tracking endDate) has passed;
 * `finished`: OFAPI marks the trial link finished before its end (a claim
 * limit); `active` otherwise. */
export const ofLinkStateSchema = z.enum(["active", "finished", "expired"]);
export const ofLinkRunStatusSchema = z.enum(["complete", "partial", "truncated", "failed", "skipped"]);
export const ofLinkValidFromBasisSchema = z.enum(["confirmed", "assumed_link_created"]);
/** Flags on a delta (a day of a link, a channel segment, a channel total):
 *   no_baseline              nothing was read before the start and the link
 *                            is not one created inside the stretch (older
 *                            than the series, missed by it, or of unknown
 *                            creation): the whole value it had accumulated
 *                            by the end is counted;
 *   vendor_recalculated      OFAPI lowered the link's net money between two
 *                            snapshots inside the delta — a recalculation,
 *                            not a loss;
 *   binding_changed          the page's OFAPI account changed between two
 *                            snapshots inside the delta;
 *   money_unknown            a snapshot the delta rests on does not know the
 *                            vendor money (still computing or never
 *                            reported): the money figure is null, or a total
 *                            leaves that stretch out — an earlier value never
 *                            stands in for it;
 *   assumed_binding_start    the link's channel binding starts on an assumed
 *                            date (its creation), nobody confirmed it (П9.7);
 *   assumed_contractor_start the channel's contractor term starts on an
 *                            assumed date (П9.7). */
export const ofLinkDeltaFlagSchema = z.enum([
    "no_baseline",
    "vendor_recalculated",
    "binding_changed",
    "money_unknown",
    "assumed_binding_start",
    "assumed_contractor_start",
]);
/** Hub's own figure (PR 13). `no_data` with a reason until it can be given:
 * `not_computed` — Hub money is not computed yet (before PR 13);
 * `no_completed_walk` — no completed walk of the link's fan list, so no floor;
 * `before_floor` — the asked time ends before Hub's figure begins (`floorAt`):
 *   Hub knows nothing of it, which is not zero. */
export const ofLinkHubMoneyReasonSchema = z.enum(["not_computed", "no_completed_walk", "before_floor"]);
export const ofLinkHubMoneySchema = z.object({
    state: z.enum(["no_data", "available"]),
    reason: ofLinkHubMoneyReasonSchema.nullable(),
    revenueBasis: z.literal(OF_LINKS_REVENUE_BASIS),
    attributionRule: z.literal(OF_LINKS_ATTRIBUTION_RULE),
    /** Where Hub's figure starts: the start of the first completed walk of the
     * link's list. Hub's figure says nothing about the time before it. */
    floorAt: isoTimestamp.nullable(),
    /** Posted transactions only (П9.3), since `floorAt`. */
    netMills: mills.nullable(),
    /** Pending transactions, never part of `netMills`. */
    pendingMills: mills.nullable(),
    transactionCount: z.number().int().nonnegative().nullable(),
    fanCount: z.number().int().nonnegative().nullable(),
});
/** Hub's figure over a group of links (a channel, a contractor): `partial`
 * when some links of the group have it and some do not. */
export const ofLinkHubMoneyTotalSchema = z.object({
    state: z.enum(["no_data", "available", "partial"]),
    reason: ofLinkHubMoneyReasonSchema.nullable(),
    revenueBasis: z.literal(OF_LINKS_REVENUE_BASIS),
    attributionRule: z.literal(OF_LINKS_ATTRIBUTION_RULE),
    netMills: mills.nullable(),
    pendingMills: mills.nullable(),
});
/** The two money figures side by side (П2), over one stretch [fromAt, toAt):
 * OFAPI's increase between two of its computations (`revenue.calculatedAt`)
 * at or after Hub's floor, against Hub's figure over exactly those two
 * instants; without such a pair, OFAPI's increase from its last snapshot
 * before the floor against Hub's figure from the floor (flag
 * window_mismatch). `state`:
 *   comparable         the same stretch on both sides, Hub's fan walks read to
 *                      the end past it, nothing pending, no flag, a tracking
 *                      link (a trial link waits for a per-fan check, П9.3);
 *   different_history  OFAPI all-time against Hub since its floor (no OFAPI
 *                      snapshot before the floor to start from);
 *   provisional        a figure may still move or the stretches differ: a
 *                      flag, pending money, or a trial link;
 *   incomplete         OFAPI's figure unknown or still computing, OFAPI has
 *                      computed nothing since Hub's floor, or the split is
 *                      not final over the stretch (some link of the page the
 *                      sweep walks has no finished fan walk started at or
 *                      after its end: a fan not read in yet could still take
 *                      part of a share);
 *   null               nothing to compare: Hub's figure is absent. */
export const ofLinkComparisonStateSchema = z.enum(["comparable", "different_history", "provisional", "incomplete"]);
/** Flags on the comparison:
 *   vendor_recalculated  OFAPI lowered the link's money inside the stretch;
 *   binding_changed      the page's OFAPI account changed inside it;
 *   vendor_lagging       OFAPI's latest figure was computed more than a day
 *                        before Hub read it (the stretch ends at that
 *                        computation, not at the read);
 *   window_mismatch      no OFAPI computation at or after Hub's floor to
 *                        start from: the two figures cover different
 *                        stretches, the difference includes money outside one
 *                        of them;
 *   ledger_gap           the chargebacks reconcile is failing: Hub's ledger
 *                        may lack chargebacks OFAPI already took out. */
export const ofLinkComparisonFlagSchema = z.enum([
    "vendor_recalculated",
    "binding_changed",
    "vendor_lagging",
    "window_mismatch",
    "ledger_gap",
]);
export const ofLinkMoneyComparisonSchema = z.object({
    state: ofLinkComparisonStateSchema.nullable(),
    flags: z.array(ofLinkComparisonFlagSchema),
    fromAt: isoTimestamp.nullable(),
    toAt: isoTimestamp.nullable(),
    /** OFAPI's increase over [fromAt, toAt]. */
    vendorDeltaMills: mills.nullable(),
    /** Hub's figure over the same segment. */
    hubNetMills: mills.nullable(),
    /** hubNetMills − vendorDeltaMills. */
    differenceMills: mills.nullable(),
});
/** OFAPI's money for a link: its latest value, with the latest recalculation
 * (a decrease between two snapshots) the series saw. */
export const ofLinkVendorMoneySchema = z.object({
    revenueBasis: z.literal(OF_LINKS_REVENUE_BASIS),
    /** null = unknown: OFAPI did not report it or is still computing. */
    netMills: mills.nullable(),
    /** Already excluded from netMills; informational, never subtract again. */
    chargebacksMills: mills.nullable(),
    /** When OFAPI computed the figure (its revenue.calculatedAt). */
    calculatedAt: isoTimestamp.nullable(),
    isLoading: z.boolean().nullable(),
    lastRecalculation: z.object({
        observedAt: isoTimestamp,
        previousObservedAt: isoTimestamp,
        fromMills: mills,
        toMills: mills,
        /** The page's OFAPI account changed between the two snapshots. */
        bindingChanged: z.boolean(),
        /** The page's latest OFAPI account change at or before `observedAt`
         * (null: none in the series) — a vendor recalculation often follows one
         * by days. */
        accountChangedAt: isoTimestamp.nullable(),
    }).nullable(),
});
export const ofLinkContractorTermSchema = z.object({
    contractorKey: z.string(),
    contractorTitle: z.string(),
    validFrom: isoTimestamp,
    validTo: isoTimestamp.nullable(),
    validFromBasis: ofLinkValidFromBasisSchema,
});
/** The link's channel: the binding open now, else its latest closed one
 * (`validTo` set), with the channel's contractor at that binding's last
 * instant. */
export const ofLinkBindingSchema = z.object({
    channelKey: z.string(),
    channelTitle: z.string(),
    validFrom: isoTimestamp,
    validTo: isoTimestamp.nullable(),
    validFromBasis: ofLinkValidFromBasisSchema,
    contractor: ofLinkContractorTermSchema.nullable(),
});
export const ofLinkSchema = z.object({
    pageId: z.number().int().positive(),
    linkKind: ofLinkKindSchema,
    /** The link's id at OnlyFans. */
    linkRef: z.string(),
    name: z.string().nullable(),
    url: z.string().nullable(),
    linkCreatedAt: isoTimestamp.nullable(),
    /** Trial: expiredAt; tracking: endDate. */
    linkEndsAt: isoTimestamp.nullable(),
    isFinished: z.boolean().nullable(),
    state: ofLinkStateSchema,
    trialDays: z.number().int().nullable(),
    /** [] = none, null = unknown. */
    tags: z.array(z.string()).nullable(),
    /** The latest snapshot of the link: when Hub read it, and its run. */
    observedAt: isoTimestamp,
    businessDate,
    runRef: z.string(),
    /** False: the latest usable read of the page's list no longer has the link. */
    inLatestRun: z.boolean(),
    clicks: z.number().int(),
    /** Trial links only. */
    claims: z.number().int().nullable(),
    /** As OFAPI reports it; on trial links it is not the number of fans. */
    subscribers: z.number().int(),
    /** null = unknown (the vendor's revenue block is missing or computing). */
    spenders: z.number().int().nullable(),
    fans: z.number().int().nullable(),
    fansMetric: ofLinkFansMetricSchema,
    vendorMoney: ofLinkVendorMoneySchema,
    hubMoney: ofLinkHubMoneySchema,
    comparison: ofLinkMoneyComparisonSchema,
    binding: ofLinkBindingSchema.nullable(),
});
export const ofLinkAttemptSchema = z.object({
    runRef: z.string(),
    observedAt: isoTimestamp,
    businessDate,
    /** The scheduled window the attempt belongs to (null before 2026-10-09). */
    windowAt: isoTimestamp.nullable(),
    attempt: z.number().int(),
    status: ofLinkRunStatusSchema,
    reason: z.string().nullable(),
    /** The row gave the series a point (the series' one definition of a usable
     * result); failed, skipped, truncated and empty unverified reads did not. */
    usable: z.boolean(),
});
/** The collection state of one (page, link kind) of the series. */
export const ofLinksPageKindSchema = z.object({
    linkKind: ofLinkKindSchema,
    /** The latest usable result, and its run. */
    lastUsableAt: isoTimestamp.nullable(),
    lastUsableRunRef: z.string().nullable(),
    /** Links in that result. */
    linkCount: z.number().int().nonnegative(),
    /** The latest attempt of any status. */
    lastAttempt: ofLinkAttemptSchema.nullable(),
    /** Not written for two windows and more — the series' stale signal's own
     * rule and expectation: a pair never attempted ages from the first window
     * it was expected in. */
    stale: z.boolean(),
    /** When stale: since when the pair has had no usable result. */
    staleSince: isoTimestamp.nullable(),
});
export const ofLinksPageSchema = z.object({
    pageId: z.number().int().positive(),
    pageLabel: z.string(),
    /** The page has an OFAPI account mapping; without one nothing is read. */
    ofapiMapped: z.boolean(),
    /** The latest accounts.* state OFAPI reported for the mapped account. */
    ofapiAuthStatus: z.string().nullable(),
    kinds: z.array(ofLinksPageKindSchema),
});
const generatedFields = {
    generatedAt: isoTimestamp,
    businessTimeZone: z.literal(OF_LINKS_BUSINESS_TIME_ZONE),
    revenueBasis: z.literal(OF_LINKS_REVENUE_BASIS),
    /** The series' first run: the floor of every vendor figure here. */
    seriesFloorAt: isoTimestamp.nullable(),
};
export const ofLinksResponseSchema = z.object({
    ...generatedFields,
    /** "Not written for two windows and more", in hours. */
    staleAfterHours: z.number(),
    /** Every active OnlyFans page. */
    pages: z.array(ofLinksPageSchema),
    /** Every link the series has seen — of the asked page, else of all pages. */
    links: z.array(ofLinkSchema),
});
export const ofLinkRangeSchema = z.object({
    /** First business day, inclusive. */
    from: businessDate,
    /** Last business day, inclusive. */
    to: businessDate,
    /** [fromAt, toAt): the UTC instants of the days; toAt is never later than generatedAt. */
    fromAt: isoTimestamp,
    toAt: isoTimestamp,
});
export const ofLinkSnapshotSchema = z.object({
    runRef: z.string(),
    observedAt: isoTimestamp,
    businessDate,
    windowAt: isoTimestamp.nullable(),
    runStatus: ofLinkRunStatusSchema,
    runReason: z.string().nullable(),
    clicks: z.number().int(),
    claims: z.number().int().nullable(),
    subscribers: z.number().int(),
    spenders: z.number().int().nullable(),
    fans: z.number().int().nullable(),
    vendorNetMills: mills.nullable(),
    vendorChargebacksMills: mills.nullable(),
    vendorCalculatedAt: isoTimestamp.nullable(),
    vendorIsLoading: z.boolean().nullable(),
    isFinished: z.boolean().nullable(),
    linkEndsAt: isoTimestamp.nullable(),
    /** The page's OFAPI account differs from the previous snapshot's. */
    bindingChanged: z.boolean(),
    /** Net money is lower than in the previous snapshot with known money. */
    vendorRecalculated: z.boolean(),
});
/** Hub's own money of one business day (PR 13); null until computed. */
export const ofLinkHubDaySchema = z.object({
    netMills: mills,
    pendingMills: mills,
    transactionCount: z.number().int().nonnegative(),
    fanCount: z.number().int().nonnegative(),
});
export const ofLinkDaySchema = z.object({
    businessDate,
    dayStartAt: isoTimestamp,
    dayEndAt: isoTimestamp,
    /** The last snapshots before the day's start and end; the delta is their
     * difference. Null start: nothing before the day — zero for a link created
     * that day, else flag no_baseline; null end: nothing by the day's end, so
     * no delta. */
    startObservedAt: isoTimestamp.nullable(),
    endObservedAt: isoTimestamp.nullable(),
    clicks: z.number().int().nullable(),
    claims: z.number().int().nullable(),
    subscribers: z.number().int().nullable(),
    fans: z.number().int().nullable(),
    /** Negative = a vendor recalculation (flag vendor_recalculated), not a loss. */
    vendorNetMills: mills.nullable(),
    /** Windows of the schedule the pair (page, kind) was expected in that day
     * and that have closed without a usable result — attempted or not (the
     * series monitor's expectation). Null for a day before the pair was
     * expected at all (the series' first window stamp, the page's creation),
     * or while the series is switched off. */
    missedWindows: z.number().int().nonnegative().nullable(),
    flags: z.array(ofLinkDeltaFlagSchema),
    hub: ofLinkHubDaySchema.nullable(),
});
export const ofLinkHistoryResponseSchema = z.object({
    ...generatedFields,
    pageId: z.number().int().positive(),
    pageLabel: z.string(),
    linkKind: ofLinkKindSchema,
    linkRef: z.string(),
    name: z.string().nullable(),
    linkCreatedAt: isoTimestamp.nullable(),
    fansMetric: ofLinkFansMetricSchema,
    range: ofLinkRangeSchema,
    /** The link's snapshots in the range, oldest first. */
    snapshots: z.array(ofLinkSnapshotSchema),
    /** Every attempt to read the page's list of this kind in the range, oldest first. */
    attempts: z.array(ofLinkAttemptSchema),
    /** One row per business day of the range, oldest first. */
    days: z.array(ofLinkDaySchema),
    /** Hub's own money over the range (PR 13). */
    hubMoney: ofLinkHubMoneySchema,
});
export const ofLinkTotalsSchema = z.object({
    /** Distinct links with a segment. */
    linkCount: z.number().int().nonnegative(),
    clicks: z.number().int(),
    claims: z.number().int(),
    subscribers: z.number().int(),
    /** Claims of trial links plus subscribers of tracking links. */
    fans: z.number().int(),
    /** Sum over the segments with known money; flag money_unknown when some had none. */
    vendorNetMills: mills,
    hubMoney: ofLinkHubMoneyTotalSchema,
});
/** One link over one stretch of time: the value at the end minus the value
 * at the start. A channel's segments are cut by the link's bindings only
 * (`contractorKey` null); a contractor's segments are cut by the bindings and
 * the channel's contractor terms. So a channel's total never moves when a
 * contractor term is added or moved. */
export const ofLinkSegmentSchema = z.object({
    pageId: z.number().int().positive(),
    pageLabel: z.string(),
    linkKind: ofLinkKindSchema,
    linkRef: z.string(),
    name: z.string().nullable(),
    channelKey: z.string().nullable(),
    contractorKey: z.string().nullable(),
    startAt: isoTimestamp,
    endAt: isoTimestamp,
    /** The snapshots the delta rests on (null start: counted from zero, see flags). */
    startObservedAt: isoTimestamp.nullable(),
    endObservedAt: isoTimestamp,
    clicks: z.number().int(),
    claims: z.number().int().nullable(),
    subscribers: z.number().int(),
    fans: z.number().int().nullable(),
    vendorNetMills: mills.nullable(),
    flags: z.array(ofLinkDeltaFlagSchema),
});
export const ofLinkChannelSchema = z.object({
    /** null: the «без канала» row — links, or stretches of time, with no binding. */
    channelKey: z.string().nullable(),
    channelTitle: z.string().nullable(),
    /** The channel's contractor terms that overlap the range. */
    contractors: z.array(ofLinkContractorTermSchema),
    totals: ofLinkTotalsSchema,
    /** Union of the segments' flags. */
    flags: z.array(ofLinkDeltaFlagSchema),
    segments: z.array(ofLinkSegmentSchema),
});
export const ofLinkContractorSchema = z.object({
    /** null: segments whose channel had no contractor, or no channel. */
    contractorKey: z.string().nullable(),
    contractorTitle: z.string().nullable(),
    channelKeys: z.array(z.string()),
    totals: ofLinkTotalsSchema,
    flags: z.array(ofLinkDeltaFlagSchema),
    segments: z.array(ofLinkSegmentSchema),
});
export const ofLinkChannelsResponseSchema = z.object({
    ...generatedFields,
    range: ofLinkRangeSchema,
    /** Channels with a segment in the range, then the «без канала» row when it has one. */
    channels: z.array(ofLinkChannelSchema),
    contractors: z.array(ofLinkContractorSchema),
});
