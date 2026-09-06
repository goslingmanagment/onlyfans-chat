/**
 * Agent Read Plane — the dataset vocabulary.
 *
 * WHY THIS FILE EXISTS: the dataset name in `POST /agent/pages/:pageLabel/
 * datasets/:dataset/query` is the one open-looking segment of the whole plane, and
 * the registry is the ONLY bridge from that name to code. A string never becomes a
 * table or column name at runtime: the name resolves here, and a field outside the
 * dataset's allowlist is a static 400 BEFORE any SQL. Declaring the vocabulary once
 * (here) and deriving the enums, the catalog response and the filter allowlists from
 * it is the same anti-drift law the claim/plane registry states in its own header.
 *
 * SCOPE: names, field maps, scalar kinds, deterministic sort keys. The SQL mapping
 * (dataset -> table, field -> expression) lands in slice A together with the
 * operation, WITH a mandatory two-way test: every available dataset's declared
 * fields are exactly covered by the runtime mapping, and vice versa. `platforms`
 * and `captureState` — the two remaining catalog-response columns — are runtime
 * facts about a deployment rather than vocabulary, and join in the same slice.
 *
 * Source: the contract appendix §17 dataset catalog (names, fields, default sorts,
 * stable keys and the money-bearing set are copied from it verbatim; the scalar
 * kinds are the appendix's own closed union). Architecture reference:
 * `investigations/agent-read-api-design-2026-07-31.md` §10.
 */
/**
 * The closed scalar union a dataset row may carry. There is no nested structure
 * and no free JSON: `components.schemas` is empty in the generated OpenAPI (every
 * schema inlines), so a recursive JSON value expands forever. A dataset that needs
 * structure needs a real operation instead.
 */
export const AGENT_DATASET_FIELD_KINDS = [
    "string",
    "int",
    /** Integer mills (1 mill = $0.001) — never a float, never dollars. */
    "mills",
    "bool",
    "timestamp",
    "date",
    "string_array",
];
/**
 * The closed filter-operator vocabulary. The route schema and the kind-aware
 * validator below both derive from this value so an operator cannot be accepted
 * on the wire but forgotten by the semantic boundary (or vice versa).
 */
export const AGENT_DATASET_FILTER_OPS = [
    "eq",
    "neq",
    "lt",
    "lte",
    "gt",
    "gte",
    "in",
    "is_null",
    "is_not_null",
];
/** Shared by the window contract and timestamp filter validation. */
export const AGENT_RFC3339_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
/** Kinds that admit a deterministic ORDER BY. See `agentDatasetFieldSortable`. */
const ORDERED_FIELD_KINDS = new Set([
    "int",
    "mills",
    "timestamp",
    "date",
]);
/**
 * Datasets addressable TODAY. The path enum is built from exactly these keys, so a
 * planned dataset is caught by Zod at the boundary as a static 400 — visible in the
 * catalog, not addressable in the query.
 */
export const AGENT_DATASETS = {
    ofapi_financial_snapshots: {
        moneyBearing: true, verbatimText: false, disclosesPurchase: false,
        fields: { platform: "string", source: "string", operation: "string", metricPath: "string", unit: "string", rawValue: "string", valueMills: "mills", windowFrom: "timestamp", windowTo: "timestamp", granularity: "string", observedAt: "timestamp", coverageState: "string", coverageReason: "string", observationRef: "string" },
        defaultSort: { field: "observedAt", dir: "desc", nullsLast: false }, stableKey: ["metricKey"],
    },
    fan_memberships: {
        // MONEY-BEARING because of `lifetimeSpendMills`. The appendix's prose names
        // only subscriptions/transactions/fan_spend_daily as money-bearing while its
        // own catalog puts a mills field on THIS dataset; the two statements
        // contradict each other, and following the narrower one would hand a
        // read:datasets-only key a fan's lifetime spend without read:money.
        moneyBearing: true,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            platformUserId: "string",
            username: "string",
            displayName: "string",
            membershipState: "string",
            firstSeenAt: "timestamp",
            lastSeenAt: "timestamp",
            lifetimeSpendMills: "mills",
        },
        defaultSort: { field: "lastSeenAt", dir: "desc", nullsLast: false },
        stableKey: ["fanId"],
    },
    dm_threads: {
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            platformUserId: "string",
            conversationRef: "string",
            lastMessageAt: "timestamp",
            messageCount: "int",
            unreadCount: "int",
            coverageStatus: "string",
        },
        defaultSort: { field: "lastMessageAt", dir: "desc", nullsLast: true },
        stableKey: ["threadId"],
    },
    subscriptions: {
        moneyBearing: true,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            platformUserId: "string",
            subscriptionRef: "string",
            subscriptionState: "string",
            startedAt: "timestamp",
            expiresAt: "timestamp",
            priceMills: "mills",
            currency: "string",
        },
        defaultSort: { field: "startedAt", dir: "desc", nullsLast: false },
        stableKey: ["subscriptionId"],
    },
    subscription_events: {
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            occurredAt: "timestamp",
            fanId: "string",
            phase: "string",
            subType: "string",
        },
        defaultSort: { field: "occurredAt", dir: "desc", nullsLast: false },
        stableKey: ["domainEventId"],
    },
    transactions: {
        moneyBearing: true,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            platformUserId: "string",
            transactionRef: "string",
            transactionType: "string",
            transactionState: "string",
            occurredAt: "timestamp",
            grossMills: "mills",
            netMills: "mills",
            feeMills: "mills",
            currency: "string",
            /** Backward-compatible legacy name. The provider value is a generic
             * correlation key and is not guaranteed to identify a message. */
            relatedMessageRef: "string",
            correlationRef: "string",
        },
        defaultSort: { field: "occurredAt", dir: "desc", nullsLast: false },
        stableKey: ["transactionId"],
    },
    tip_transactions: {
        moneyBearing: true,
        // Fan-written tip copy is transcript-grade verbatim material. One query
        // intentionally returns ledger money and captured context together, so all
        // three dataset/money/messages capabilities are mandatory.
        verbatimText: true,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            platformUserId: "string",
            transactionRef: "string",
            transactionType: "string",
            transactionState: "string",
            occurredAt: "timestamp",
            grossMills: "mills",
            netMills: "mills",
            feeMills: "mills",
            currency: "string",
            correlationRef: "string",
            contextState: "string",
            capturedConversationRef: "string",
            tipMessageText: "string",
        },
        defaultSort: { field: "occurredAt", dir: "desc", nullsLast: false },
        stableKey: ["transactionId"],
    },
    fan_spend_daily: {
        moneyBearing: true,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            platformUserId: "string",
            businessDate: "date",
            grossMills: "mills",
            netMills: "mills",
            transactionCount: "int",
            currency: "string",
        },
        defaultSort: { field: "businessDate", dir: "desc", nullsLast: false },
        stableKey: ["fanId", "canonicalType", "transactionState"],
    },
    follows: {
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            platformUserId: "string",
            followed: "bool",
            followedAt: "timestamp",
            unfollowedAt: "timestamp",
        },
        defaultSort: { field: "followedAt", dir: "desc", nullsLast: true },
        stableKey: ["followId"],
    },
    followers_daily: {
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            businessDate: "date",
            followersCount: "int",
        },
        defaultSort: { field: "businessDate", dir: "desc", nullsLast: false },
        stableKey: ["pageId"],
    },
    fan_aliases: {
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            platformUserId: "string",
            aliasKind: "string",
            aliasValue: "string",
            firstSeenAt: "timestamp",
            lastSeenAt: "timestamp",
        },
        defaultSort: { field: "lastSeenAt", dir: "desc", nullsLast: true },
        stableKey: ["aliasId"],
    },
    fan_notes: {
        moneyBearing: false,
        verbatimText: true,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            platformUserId: "string",
            noteRef: "string",
            noteText: "string",
            createdAt: "timestamp",
            updatedAt: "timestamp",
        },
        defaultSort: { field: "createdAt", dir: "desc", nullsLast: false },
        stableKey: ["noteId"],
    },
    posts: {
        moneyBearing: false,
        // Creator-written post copy is verbatim material. This deliberately reuses
        // the transcript disclosure class: a read:datasets-only key must not gain a
        // side door to content text.
        verbatimText: true,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            postRef: "string",
            postText: "string",
            publishedAt: "timestamp",
            firstObservedAt: "timestamp",
            lastObservedAt: "timestamp", rowUpdatedAt: "timestamp",
            attachmentCount: "int",
            fypFlags: "int",
            inReplyToRef: "string",
            wallRefs: "string_array",
        },
        defaultSort: { field: "publishedAt", dir: "desc", nullsLast: false },
        stableKey: ["postId"],
    },
    raw_media: {
        moneyBearing: false, verbatimText: true, disclosesPurchase: false,
        fields: {
            platform: "string", mediaRef: "string", ownerAccountRef: "string",
            filename: "string", mimeType: "string", mediaType: "int", providerType: "string", durationMs: "int",
            width: "int", height: "int", originalWidth: "int", originalHeight: "int",
            frameRateMilli: "int", createdAtPlatform: "timestamp", updatedAtPlatform: "timestamp",
            firstOrigin: "string", sourceKind: "string", firstObservedAt: "timestamp", lastObservedAt: "timestamp", rowUpdatedAt: "timestamp",
        },
        defaultSort: { field: "firstObservedAt", dir: "asc", nullsLast: false },
        stableKey: ["mediaRef"],
    },
    post_attachments: {
        moneyBearing: false, verbatimText: true, disclosesPurchase: false,
        fields: {
            platform: "string", postRef: "string", publishedAt: "timestamp", attachmentIndex: "int",
            pos: "int", contentType: "int", contentRef: "string", role: "string", memberIndex: "int",
            bundleRef: "string", mediaOfferRef: "string", previewRef: "string", mediaRef: "string",
            linkState: "string", filename: "string", mimeType: "string", durationMs: "int",
            originalWidth: "int", originalHeight: "int", lastObservedAt: "timestamp", rowUpdatedAt: "timestamp",
            postObservationRef: "int", offerObservationRef: "int", bundleObservationRef: "int", fileObservationRef: "int",
        },
        defaultSort: { field: "publishedAt", dir: "asc", nullsLast: false },
        stableKey: ["postAttachmentKey"],
    },
    post_monetization: {
        moneyBearing: true,
        // Fansly's tip-goal label is creator-written verbatim copy. Keep the whole
        // dataset behind the same read:messages disclosure gate as creator posts so
        // the label cannot become a side door around the text capability.
        verbatimText: true,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            postRef: "string",
            publishedAt: "timestamp",
            lastObservedAt: "timestamp",
            postTargetTipAmountMills: "mills",
            attachmentTipAmountMills: "mills",
            postTipTotalMills: "mills",
            tipGoalLinked: "bool",
            tipGoalRef: "string",
            tipGoalLabelText: "string",
            tipGoalTargetMills: "mills",
            tipGoalCurrentMills: "mills",
            tipGoalAmountsHidden: "bool",
        },
        defaultSort: { field: "publishedAt", dir: "desc", nullsLast: false },
        stableKey: ["postId"],
    },
    post_tips: {
        moneyBearing: true,
        // Fansly permits the sender to attach a free-form note to a tip. The note
        // is fan-written transcript-grade material, so the whole dataset stays
        // behind read:messages in addition to its money gate.
        verbatimText: true,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            postTipPostRef: "string",
            postTipRef: "string",
            tipSenderPlatformUserId: "string",
            postTipOccurredAt: "timestamp",
            postTipAmountMills: "mills",
            receiverTransactionRef: "string",
            postTipGoalRef: "string",
            postTipMessageText: "string",
        },
        defaultSort: { field: "postTipOccurredAt", dir: "desc", nullsLast: false },
        stableKey: ["postTipId"],
    },
    tip_goals: {
        moneyBearing: true,
        // The goal label is creator-written verbatim copy. This remains true even
        // though the dataset deduplicates shared goals to one latest snapshot.
        verbatimText: true,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            tipGoalRef: "string",
            tipGoalLabelText: "string",
            tipGoalTargetMills: "mills",
            tipGoalCurrentMills: "mills",
            tipGoalAmountsHidden: "bool",
            lastObservedAt: "timestamp",
            linkedPostCount: "int",
        },
        defaultSort: { field: "lastObservedAt", dir: "desc", nullsLast: false },
        stableKey: ["tipGoalRef"],
    },
    // ── endpoints-cover (WP-S1): the thirteen datasets over what F1-F7 and F4
    // capture. FANSLY ONLY (A28-2) — the catalog's per-dataset `platforms` says
    // so, and no OnlyFans lane writes any of these tables.
    //
    // Every one of them declares a NON-EMPTY `readPlanes` in the SQL mapping,
    // minted by a claim field this initiative added to the matching class.
    // `readPlanes: []` is legal (`sync_streams` uses it honestly) and is
    // FORBIDDEN here: it silently disables the capture-floor epistemics the whole
    // coverage story rests on, and an empty-result answer would then carry no
    // evidence about whether anything was ever captured.
    traffic_daily: {
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            subjectKind: "string",
            subjectRef: "string",
            periodMs: "int",
            bucketStart: "timestamp",
            /** RAW platform code as text (A22-2). Key on THIS. */
            sourceCode: "string",
            /** This build's reading of the code; `unknown:<code>` when it has none. */
            sourceLabel: "string",
            mappingVersion: "int",
            /** `type - (type % 10)` for a profile row; null for the 0/1 media codes,
             *  which are not a family/member structure at all. */
            family: "string",
            /** Member 1 is the creator widget's visit count; anything else is the
             *  dwell-bearing series, whose own view counts differ. */
            measure: "string",
            views: "int",
            previewViews: "int",
            uniqueViewers: "int",
            previewUniqueViewers: "int",
            interactionTimeMs: "int",
            previewInteractionTimeMs: "int",
        },
        defaultSort: { field: "bucketStart", dir: "desc", nullsLast: false },
        stableKey: ["bucketKey"],
    },
    media_stats: {
        // The catalogue head travels with the buckets, so the sale figures make it
        // money-bearing. `salesNetMills` is A12's NET verbatim; the gross beside it
        // is DERIVED and named accordingly, and the two are never summed.
        moneyBearing: true,
        verbatimText: false,
        // Catalogue sale COUNTS are inventory statistics about the creator's own
        // shelf, not a disclosure of who bought what — no fan appears on a row
        // here. The purchase-disclosing dataset is `message_media_sales`.
        disclosesPurchase: false,
        fields: {
            platform: "string",
            mediaOfferRef: "string",
            mediaType: "int",
            mimeType: "string",
            durationMs: "int",
            periodMs: "int",
            bucketStart: "timestamp",
            sourceCode: "string",
            sourceLabel: "string",
            mappingVersion: "int",
            views: "int",
            previewViews: "int",
            uniqueViewers: "int",
            previewUniqueViewers: "int",
            interactionTimeMs: "int",
            previewInteractionTimeMs: "int",
            priceMills: "mills",
            salesCount: "int",
            salesNetMills: "mills",
            /** DERIVED from net at read time (net / 0.8, A12). The name carries the
             *  warning because a wire field cannot carry a footnote. */
            salesGrossMillsDerived: "mills",
        },
        // NO VIDEO FIELDS, and their absence is deliberate: [E5] found all six live
        // per-media responses carrying seven stat keys and no video metrics at all,
        // for a video asset. Declaring always-null columns would promise a metric
        // the route does not serve.
        defaultSort: { field: "bucketStart", dir: "desc", nullsLast: false },
        stableKey: ["mediaBucketKey"],
    },
    top_media: {
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            plane: "string",
            rank: "int",
            mediaOfferRef: "string",
            bundleRef: "string",
            periodMs: "int",
            requestedStart: "timestamp",
            requestedEnd: "timestamp",
            views: "int",
            previewViews: "int",
            interactionTimeMs: "int",
            previewInteractionTimeMs: "int",
            observedAt: "timestamp",
        },
        // The WINDOW is part of a row's identity: rank 2 of one window is not the
        // same fact as rank 2 of the next, so the sort is by window, not by rank.
        defaultSort: { field: "requestedEnd", dir: "desc", nullsLast: false },
        stableKey: ["topMediaKey"],
    },
    top_tags: {
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            plane: "string",
            rank: "int",
            tagRef: "string",
            /** NULL when the response's own `tags[]` join missed — never fabricated
             *  from the id, and never read as "the tag has no name". */
            tagName: "string",
            periodMs: "int",
            requestedStart: "timestamp",
            requestedEnd: "timestamp",
            views: "int",
            previewViews: "int",
            interactionTimeMs: "int",
            previewInteractionTimeMs: "int",
            observedAt: "timestamp",
        },
        defaultSort: { field: "requestedEnd", dir: "desc", nullsLast: false },
        stableKey: ["topTagKey"],
    },
    revenue_mix: {
        moneyBearing: true,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            businessDate: "date",
            /** RAW. ONE visible label maps to TWO live codes, legacy and current
             *  (A22-2), and this ledger reaches back to 2025-03-06 — well into legacy
             *  territory. Group by `typeCode` for the truth, by `typeLabel` for the
             *  grouping the platform's own chart shows. */
            typeCode: "int",
            typeLabel: "string",
            typeEra: "string",
            mappingVersion: "int",
            /** Stored separately, NEVER derived across bases. */
            grossMills: "mills",
            netMills: "mills",
            lastObservedAt: "timestamp",
        },
        defaultSort: { field: "businessDate", dir: "desc", nullsLast: false },
        stableKey: ["revenueMixKey"],
    },
    message_media_sales: {
        // THE SCOPE-PAIRING RULE'S ONE DATASET. It supersedes the planned
        // `purchase_history` key (removed below): that name was a SYNC STREAM with
        // no serving table, while these rows are the real answer to "what was
        // offered and what was bought in DMs".
        moneyBearing: true,
        verbatimText: false,
        disclosesPurchase: true,
        fields: {
            platform: "string",
            messageRef: "string",
            conversationRef: "string",
            offerOrdinal: "int",
            mediaOfferRef: "string",
            bundleRef: "string",
            offerType: "int",
            mimeType: "string",
            durationMs: "int",
            priceMills: "mills",
            /** The archive joins THIS for purchase state (A17-4 variant B); it is not
             *  a column on the message row. `unknown` is a real value, not a null. */
            purchaseState: "string",
            orderRef: "string",
            salesCount: "int",
            salesNetMills: "mills",
            fanPlatformUserId: "string",
            messageCreatedAt: "timestamp",
            lastObservedAt: "timestamp",
        },
        defaultSort: { field: "messageCreatedAt", dir: "desc", nullsLast: true },
        stableKey: ["messageOfferKey"],
    },
    comments: {
        // Fan- and creator-written reply bodies: transcript-grade material, so the
        // whole dataset rides `read:messages` exactly as `posts` does.
        moneyBearing: true,
        verbatimText: true,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            commentRef: "string",
            parentPostRef: "string",
            rootPostRef: "string",
            authorRef: "string",
            authorUsername: "string",
            /** `''` is a REPLY, not a missing one: a fan who replied with only an
             *  attachment still replied, and one of the four live captured replies
             *  had empty content. */
            commentText: "string",
            likeCount: "int",
            /** TWO BASES, never summed. */
            tipTotalMills: "mills",
            attachmentTipMills: "mills",
            attachmentCount: "int",
            occurredAt: "timestamp",
            changedAt: "timestamp",
            discoveredVia: "string",
            /** The walk route has no established pagination, so a suspiciously full
             *  page marks its rows. A true here means per-post completeness is
             *  UNKNOWN for that post — never that the comment is suspect. */
            possiblyTruncated: "bool",
            /** A later FULL walk stopped naming this comment. Never a delete (DP 7). */
            missingSince: "timestamp",
        },
        defaultSort: { field: "occurredAt", dir: "desc", nullsLast: false },
        stableKey: ["commentKey"],
    },
    likes: {
        // SHIPS EMPTY ON FANSLY, and the catalog says so rather than omitting the
        // dataset: no like code is live-confirmed ([E4]), so WP-F2's layer 2 writes
        // nothing here and `captureState` is `not_captured`. An omitted dataset and
        // an empty one are indistinguishable to a reader, which is the confusion
        // this plane exists to remove. The OnlyFans `posts.liked` webhook populates
        // the same table independently.
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            subjectKind: "string",
            subjectRef: "string",
            likerPlatformUserId: "string",
            /** `active` | `undone`. An undo sets the state; it never deletes. */
            state: "string",
            occurredAt: "timestamp",
            discoveredVia: "string",
        },
        defaultSort: { field: "occurredAt", dir: "desc", nullsLast: false },
        stableKey: ["likeKey"],
    },
    vault_media: {
        moneyBearing: false,
        verbatimText: true,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            /** `creator` | `user`. The user vault is the account's OWN Likes and
             *  Purchases and holds OTHER creators' media, so merging the two would
             *  make purchases indistinguishable from inventory. */
            vaultKind: "string",
            albumRef: "string",
            albumTitle: "string",
            lastFullWalkAt: "timestamp",
            fullWalkRef: "string",
            fullWalkObservedCount: "int",
            customFilename: "string",
            filename: "string",
            mimeType: "string",
            durationMs: "int",
            originalWidth: "int",
            originalHeight: "int",
            /** Raw file identity. This is the membership key on the live creator
             *  vault and remains distinct from an optional offer id. */
            mediaRef: "string",
            mediaOfferRef: "string",
            /** The membership row's OWN id — the vault walk's cursor, and NOT the
             *  same value as `mediaOfferRef`. */
            memberRef: "string",
            mediaType: "int",
            bundleRef: "string",
            createdAtPlatform: "timestamp",
            missingSince: "timestamp",
            firstObservedAt: "timestamp",
            lastObservedAt: "timestamp", rowUpdatedAt: "timestamp",
        },
        defaultSort: { field: "firstObservedAt", dir: "desc", nullsLast: false },
        stableKey: ["vaultMemberKey"],
    },
    notifications: {
        moneyBearing: false,
        verbatimText: false,
        // Captured purchase codes 2007/2008 name the buyer through
        // `correlationGroupRef` even when `correlationRef` is null. A buyer plus a
        // purchase code discloses the purchase without needing a price or offer, so
        // this dataset obeys the same read:messages pairing rule as media sales.
        disclosesPurchase: true,
        fields: {
            platform: "string",
            notificationRef: "string",
            /** RAW. The shipped spec was wrong on EIGHT of sixteen codes, including
             *  both purchase events (A22-1) — which is why storage keys on this and
             *  the label below carries its own confidence. */
            typeCode: "int",
            typeLabel: "string",
            /** `confirmed` requires two independent live examples agreeing with a
             *  second source; everything client-derived is `inferred`. */
            typeConfidence: "string",
            mappingVersion: "int",
            correlationRef: "string",
            correlationGroupRef: "string",
            occurredAt: "timestamp",
            acknowledgedAt: "timestamp",
        },
        defaultSort: { field: "occurredAt", dir: "desc", nullsLast: false },
        stableKey: ["notificationKey"],
    },
    subscription_tiers: {
        // ONE ROW PER PLAN, not per tier: `tier.price` is a BASE, not a price (all
        // five observed tiers carried 5 000 while their plans ranged 10 000 …
        // 499 990), so a tier-grained dataset would serve a number no subscriber
        // ever paid as if it were the price.
        moneyBearing: true,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            tierRef: "string",
            tierName: "string",
            tierPos: "int",
            /** The tier HEAD's `price`. A base, never what a subscriber pays. */
            basePriceMills: "mills",
            maxSubscribers: "int",
            planRef: "string",
            planStatus: "int",
            /** Reads `plans[].billingCycle` — verified live; `duration` exists one
             *  level down, on `promos[]`, and is a different thing. */
            durationDays: "int",
            /** THE PRICE TRUTH. */
            priceMills: "mills",
            promoCount: "int",
            missingSince: "timestamp",
            lastObservedAt: "timestamp",
        },
        defaultSort: { field: "lastObservedAt", dir: "desc", nullsLast: false },
        stableKey: ["tierPlanKey"],
    },
    payouts: {
        // RESTRICTED: money OUT. `read:money` comes from the mills fields; the
        // method identity comes back MASKED and the full processor payload stays
        // raw-journal-only under the restricted class — provider 2 (Paxum) returns
        // a plaintext email address and the only sanctioned reader of that field is
        // the WP-F7 canonicalizer that produced the mask.
        moneyBearing: true,
        verbatimText: false,
        // No fan appears on a payout row: this is the agency paying itself, not a
        // purchase, so the pairing rule does not reach it.
        disclosesPurchase: false,
        fields: {
            platform: "string",
            payoutRef: "string",
            /** MILLS with no scaling: the wire unit IS the kernel unit here. */
            amountMills: "mills",
            /** RAW. 8 is the ONLY code ever observed and is never treated as "the
             *  success code" — `statusConfidence` is how a reader learns that. */
            statusCode: "int",
            statusLabel: "string",
            statusConfidence: "string",
            methodRef: "string",
            methodProviderId: "int",
            methodProviderLabel: "string",
            /** OURS, never the provider's. */
            methodMaskedLabel: "string",
            requestedAt: "timestamp",
            updatedAtPlatform: "timestamp",
        },
        defaultSort: { field: "requestedAt", dir: "desc", nullsLast: true },
        stableKey: ["payoutKey"],
    },
    capture_coverage: {
        // The honesty plane as a dataset: the `(status, acquisition_mode, proof)`
        // vocabulary an agent needs to tell "we hold nothing" from "we never
        // looked". It reads CAPTURE-PLANE OPERATIONAL STATE, which no
        // `projection:rebuild` truncates — so the answer survives a repair that
        // wipes and replays every projection beside it.
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            platform: "string",
            plane: "string",
            scopeRef: "string",
            status: "string",
            acquisitionMode: "string",
            proof: "string",
            oldestCapturedAt: "timestamp",
            newestCapturedAt: "timestamp",
            expectedCount: "int",
            observedUniqueCount: "int",
            reasonCode: "string",
            nextProbeAt: "timestamp",
            updatedAt: "timestamp",
        },
        defaultSort: { field: "updatedAt", dir: "desc", nullsLast: false },
        stableKey: ["coverageKey"],
    },
    sync_streams: {
        moneyBearing: false,
        verbatimText: false,
        disclosesPurchase: false,
        fields: {
            stream: "string",
            syncStatus: "string",
            cursorAt: "timestamp",
            succeededAt: "timestamp",
            failedAt: "timestamp",
            consecutiveFailures: "int",
        },
        defaultSort: { field: "stream", dir: "asc", nullsLast: false },
        stableKey: ["pageId", "stream"],
    },
};
/**
 * Datasets the catalog must NAME rather than hide. The plane's whole premise is
 * that an absent answer is distinguishable from an absent capability, so a hole in
 * the data is declared, not omitted.
 *
 * `fan_earnings` stays planned and untouched: `fan_earnings_stats` exists in the
 * database (migration 0061) but not in the Drizzle schema and is read only by raw
 * SQL. The endpoints-cover initiative deliberately did not adopt it.
 *
 * WHAT LEFT THIS LIST, AND WHERE IT WENT (WP-S1):
 *   `vault_media`, `notifications`, `subscription_tiers`, `comments`, `likes`,
 *   `payouts` — PROMOTED to available above, each over the projection its
 *   capture package landed. Reusing the reserved key rather than minting a new
 *   name is deliberate: a caller that read the catalog a year ago and wrote
 *   `--dataset comments` now gets data instead of a 400.
 *
 *   `purchase_history` — SUPERSEDED by `message_media_sales`. It was never a
 *   dataset: it is a SYNC STREAM name whose canonicalization produces
 *   `message.ppv_unlocked` and which has no serving table at all. The question
 *   it stood for — what was offered and what was bought in DMs — is answered by
 *   `message_media_offers`, which `message_media_sales` serves under the
 *   `read:messages` + `read:money` pairing rule. Keeping the stale key beside
 *   its real answer would have advertised a second, better `purchase_history`
 *   that is never coming.
 */
export const AGENT_PLANNED_DATASETS = {
    fan_earnings: {},
    stories: {},
    fan_lists: {},
    livestreams: {},
    campaigns: {},
    polls: {},
    chargebacks: {},
    blocks: {},
};
/** Derived. Anything that needs "which datasets are addressable" reads THIS. */
export const AGENT_DATASET_NAMES = Object.keys(AGENT_DATASETS);
/** Derived. The catalog lists these with `availability: "planned"`. */
export const AGENT_PLANNED_DATASET_NAMES = Object.keys(AGENT_PLANNED_DATASETS);
/**
 * Boundary lookup for an UNVALIDATED dataset name (it arrives in a path).
 *
 * Backed by a Map, not by object indexing: a plain object would answer
 * `"constructor"` or `"toString"` with an inherited function, and a truthy answer
 * to a prototype key is exactly how an allowlist stops being one.
 */
const DEFINITION_BY_NAME = new Map(Object.entries(AGENT_DATASETS));
export function agentDatasetDefinition(dataset) {
    return DEFINITION_BY_NAME.get(dataset);
}
const EQUALITY_AND_ORDER_OPERATORS = [
    "eq",
    "neq",
    "lt",
    "lte",
    "gt",
    "gte",
];
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isCalendarDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const instant = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}
function isRfc3339Timestamp(value) {
    if (typeof value !== "string" || !AGENT_RFC3339_TIMESTAMP_PATTERN.test(value)) {
        return false;
    }
    // Date.parse catches impossible dates/times that the deliberately readable
    // wire regex cannot (for example 2026-02-30 or an hour of 29).
    return isCalendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
/**
 * The semantic filter boundary, keyed by the registry's declared field kind.
 *
 * This is intentionally a small matrix, not a generic query language. Numeric
 * kinds require safe integers (money remains mills); booleans admit equality
 * only; timestamps/dates must be real wire values; and `in` stays limited to
 * textual values because the public scalar union has only `string[]` arrays.
 */
const FILTER_RULE_BY_KIND = {
    string: {
        operators: [...EQUALITY_AND_ORDER_OPERATORS, "in"],
        acceptsValue: (operator, value) => operator === "in"
            ? isStringArray(value)
            : typeof value === "string",
    },
    int: {
        operators: EQUALITY_AND_ORDER_OPERATORS,
        acceptsValue: (_operator, value) => typeof value === "number" && Number.isSafeInteger(value),
    },
    mills: {
        operators: EQUALITY_AND_ORDER_OPERATORS,
        acceptsValue: (_operator, value) => typeof value === "number" && Number.isSafeInteger(value),
    },
    bool: {
        operators: ["eq", "neq"],
        acceptsValue: (_operator, value) => typeof value === "boolean",
    },
    timestamp: {
        operators: EQUALITY_AND_ORDER_OPERATORS,
        acceptsValue: (_operator, value) => isRfc3339Timestamp(value),
    },
    date: {
        operators: [...EQUALITY_AND_ORDER_OPERATORS, "in"],
        acceptsValue: (operator, value) => operator === "in"
            ? isStringArray(value) && value.every(isCalendarDate)
            : isCalendarDate(value),
    },
    // There is no string-array field today and no array operator with honest SQL
    // semantics in v1. Null checks remain available without guessing one.
    string_array: {
        operators: [],
        acceptsValue: () => false,
    },
};
/**
 * Validates a dataset filter after the path/body schemas but before SQL mapping.
 * The issue contains no caller value, so a 400 can be logged or returned without
 * echoing potentially sensitive filter material.
 */
export function agentDatasetFilterIssue(dataset, input) {
    const definition = agentDatasetDefinition(dataset);
    const fields = definition?.fields;
    const kind = fields !== undefined && Object.hasOwn(fields, input.field)
        ? fields[input.field]
        : undefined;
    if (kind === undefined) {
        return { code: "unknown_field" };
    }
    const carriesNoValue = input.op === "is_null" || input.op === "is_not_null";
    if (carriesNoValue) {
        return input.value === undefined ? null : { code: "value_type_mismatch", kind };
    }
    const rule = FILTER_RULE_BY_KIND[kind];
    if (!rule.operators.includes(input.op)) {
        return { code: "operator_not_supported", kind };
    }
    return rule.acceptsValue(input.op, input.value)
        ? null
        : { code: "value_type_mismatch", kind };
}
/**
 * The capabilities a key must hold to query this dataset: `read:datasets` always,
 * plus `read:money` for a money-bearing one and `read:messages` for one that
 * serves free text. Derived from the declaration, so a dataset that gains a money
 * field or a text body cannot keep the narrower requirement.
 */
export function agentDatasetRequiredCapabilities(dataset) {
    const definition = AGENT_DATASETS[dataset];
    const capabilities = ["read:datasets"];
    if (definition.moneyBearing) {
        capabilities.push("read:money");
    }
    if (definition.verbatimText || definition.disclosesPurchase) {
        // The pairing rule and the free-text rule land on the SAME capability, and
        // deliberately so: both disclose the content of a conversation, one as
        // prose and one as the fact that a purchase happened inside it.
        capabilities.push("read:messages");
    }
    return capabilities;
}
/**
 * Free-form content includes `*Text` fields and user-written file/album names.
 *
 * A convention rather than a per-field flag because the scalar KIND cannot tell
 * `noteText` from `username` — both are `string` — and the thing that must not
 * drift is "does this dataset hand over prose", which the field name already says.
 */
export function agentDatasetFieldIsVerbatimText(field) {
    return /Text$/.test(field) || ["filename", "customFilename", "albumTitle"].includes(field);
}
/** Every declared field of a dataset is filterable — the map IS the allowlist. */
export function agentDatasetFieldFilterable() {
    return true;
}
/**
 * Sortable = the kind admits a deterministic order (numbers, money, instants,
 * dates), OR the field is this dataset's default sort. Free text and booleans are
 * deliberately excluded: sorting a page of transcripts by note text buys nothing
 * and costs an unindexable ORDER BY.
 */
export function agentDatasetFieldSortable(dataset, field) {
    const definition = AGENT_DATASETS[dataset];
    const fields = definition.fields;
    // `Object.hasOwn` for the same reason the lookup above uses a Map: a prototype
    // key must not resolve to a real field.
    if (!Object.hasOwn(fields, field)) {
        return false;
    }
    const kind = fields[field];
    if (kind === undefined) {
        return false;
    }
    return ORDERED_FIELD_KINDS.has(kind) || definition.defaultSort.field === field;
}
/** The catalog view of a dataset's fields, in declaration order. */
export function agentDatasetFields(dataset) {
    const definition = AGENT_DATASETS[dataset];
    return Object.entries(definition.fields).map(([field, kind]) => ({
        field,
        kind,
        filterable: agentDatasetFieldFilterable(),
        sortable: agentDatasetFieldSortable(dataset, field),
    }));
}
