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
import { type AgentCapability } from "./agent-read-capabilities";
/**
 * The closed scalar union a dataset row may carry. There is no nested structure
 * and no free JSON: `components.schemas` is empty in the generated OpenAPI (every
 * schema inlines), so a recursive JSON value expands forever. A dataset that needs
 * structure needs a real operation instead.
 */
export declare const AGENT_DATASET_FIELD_KINDS: readonly ["string", "int", "mills", "bool", "timestamp", "date", "string_array"];
export type AgentDatasetFieldKind = (typeof AGENT_DATASET_FIELD_KINDS)[number];
/**
 * The closed filter-operator vocabulary. The route schema and the kind-aware
 * validator below both derive from this value so an operator cannot be accepted
 * on the wire but forgotten by the semantic boundary (or vice versa).
 */
export declare const AGENT_DATASET_FILTER_OPS: readonly ["eq", "neq", "lt", "lte", "gt", "gte", "in", "is_null", "is_not_null"];
export type AgentDatasetFilterOperator = (typeof AGENT_DATASET_FILTER_OPS)[number];
/** Shared by the window contract and timestamp filter validation. */
export declare const AGENT_RFC3339_TIMESTAMP_PATTERN: RegExp;
export type AgentDatasetSort = {
    readonly field: string;
    readonly dir: "asc" | "desc";
    /** NULLS LAST on a nullable sort column, so a row with no value never leads. */
    readonly nullsLast: boolean;
};
export type AgentDatasetDefinition = {
    /**
     * Money-bearing datasets additionally require the `read:money` capability.
     *
     * A dataset carrying ANY field of kind `mills` is money-bearing by definition
     * — pinned by test, because the appendix declared one such dataset otherwise
     * and that quietly put a fan's lifetime spend behind a read:datasets-only key.
     */
    readonly moneyBearing: boolean;
    /**
     * Datasets carrying operator- or fan-written FREE TEXT additionally require
     * `read:messages`.
     *
     * `fan_notes` selects the note body verbatim, which is the same disclosure
     * class as a transcript — and the person operation puts exactly that material
     * behind `read:messages`. Without this flag a `read:datasets`-only key read the
     * notes through the dataset route instead, so the capability was a door with a
     * window next to it. Declared here rather than as a list at the handler, and
     * pinned by test against the field map, so a future dataset that adds a text
     * body cannot inherit the narrower requirement.
     */
    readonly verbatimText: boolean;
    /**
     * Datasets whose ROWS DISCLOSE A PURCHASE additionally require
     * `read:messages` — the endpoints-cover scope-pairing rule.
     *
     * The rule exists because a purchase is a fact about a CONVERSATION as much
     * as about money: a row saying "this fan bought offer 3 of message X" tells a
     * `read:money`-only key who was talking to whom and what they bought, which
     * is exactly the disclosure `read:messages` guards. A buyer identity or a
     * per-message sale count discloses a purchase on its own — there is no
     * threshold below which it does not.
     *
     * Declared rather than inferred: unlike `verbatimText`, no field NAME or
     * scalar KIND can tell `salesCount` on a message offer (a purchase) from
     * `salesCount` on a catalogue item (an inventory statistic). The flag is
     * REQUIRED on every dataset so the question has to be answered rather than
     * defaulted, and a test pins the derivation.
     */
    readonly disclosesPurchase: boolean;
    /** Wire field -> scalar kind. This map IS the filter/sort allowlist. */
    readonly fields: Readonly<Record<string, AgentDatasetFieldKind>>;
    readonly defaultSort: AgentDatasetSort;
    /**
     * Physical row identifier(s) completing the keyset cursor `{sortValue,
     * stableKey}`. These are NOT wire fields and are never returned or filtered on;
     * they exist so pagination is total-ordered even when the sort column ties.
     * Resolved to real columns by the slice-A mapping.
     */
    readonly stableKey: readonly string[];
};
/**
 * Datasets addressable TODAY. The path enum is built from exactly these keys, so a
 * planned dataset is caught by Zod at the boundary as a static 400 — visible in the
 * catalog, not addressable in the query.
 */
export declare const AGENT_DATASETS: {
    readonly fan_memberships: {
        readonly moneyBearing: true;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly platformUserId: "string";
            readonly username: "string";
            readonly displayName: "string";
            readonly membershipState: "string";
            readonly firstSeenAt: "timestamp";
            readonly lastSeenAt: "timestamp";
            readonly lifetimeSpendMills: "mills";
        };
        readonly defaultSort: {
            readonly field: "lastSeenAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["fanId"];
    };
    readonly dm_threads: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly platformUserId: "string";
            readonly conversationRef: "string";
            readonly lastMessageAt: "timestamp";
            readonly messageCount: "int";
            readonly unreadCount: "int";
            readonly coverageStatus: "string";
        };
        readonly defaultSort: {
            readonly field: "lastMessageAt";
            readonly dir: "desc";
            readonly nullsLast: true;
        };
        readonly stableKey: readonly ["threadId"];
    };
    readonly subscriptions: {
        readonly moneyBearing: true;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly platformUserId: "string";
            readonly subscriptionRef: "string";
            readonly subscriptionState: "string";
            readonly startedAt: "timestamp";
            readonly expiresAt: "timestamp";
            readonly priceMills: "mills";
            readonly currency: "string";
        };
        readonly defaultSort: {
            readonly field: "startedAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["subscriptionId"];
    };
    readonly subscription_events: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly occurredAt: "timestamp";
            readonly fanId: "string";
            readonly phase: "string";
            readonly subType: "string";
        };
        readonly defaultSort: {
            readonly field: "occurredAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["domainEventId"];
    };
    readonly transactions: {
        readonly moneyBearing: true;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly platformUserId: "string";
            readonly transactionRef: "string";
            readonly transactionType: "string";
            readonly transactionState: "string";
            readonly occurredAt: "timestamp";
            readonly grossMills: "mills";
            readonly netMills: "mills";
            readonly feeMills: "mills";
            readonly currency: "string";
            /** Backward-compatible legacy name. The provider value is a generic
             * correlation key and is not guaranteed to identify a message. */
            readonly relatedMessageRef: "string";
            readonly correlationRef: "string";
        };
        readonly defaultSort: {
            readonly field: "occurredAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["transactionId"];
    };
    readonly tip_transactions: {
        readonly moneyBearing: true;
        readonly verbatimText: true;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly platformUserId: "string";
            readonly transactionRef: "string";
            readonly transactionType: "string";
            readonly transactionState: "string";
            readonly occurredAt: "timestamp";
            readonly grossMills: "mills";
            readonly netMills: "mills";
            readonly feeMills: "mills";
            readonly currency: "string";
            readonly correlationRef: "string";
            readonly contextState: "string";
            readonly capturedConversationRef: "string";
            readonly tipMessageText: "string";
        };
        readonly defaultSort: {
            readonly field: "occurredAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["transactionId"];
    };
    readonly fan_spend_daily: {
        readonly moneyBearing: true;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly platformUserId: "string";
            readonly businessDate: "date";
            readonly grossMills: "mills";
            readonly netMills: "mills";
            readonly transactionCount: "int";
            readonly currency: "string";
        };
        readonly defaultSort: {
            readonly field: "businessDate";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["fanId", "canonicalType", "transactionState"];
    };
    readonly follows: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly platformUserId: "string";
            readonly followed: "bool";
            readonly followedAt: "timestamp";
            readonly unfollowedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "followedAt";
            readonly dir: "desc";
            readonly nullsLast: true;
        };
        readonly stableKey: readonly ["followId"];
    };
    readonly followers_daily: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly businessDate: "date";
            readonly followersCount: "int";
        };
        readonly defaultSort: {
            readonly field: "businessDate";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["pageId"];
    };
    readonly fan_aliases: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly platformUserId: "string";
            readonly aliasKind: "string";
            readonly aliasValue: "string";
            readonly firstSeenAt: "timestamp";
            readonly lastSeenAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "lastSeenAt";
            readonly dir: "desc";
            readonly nullsLast: true;
        };
        readonly stableKey: readonly ["aliasId"];
    };
    readonly fan_notes: {
        readonly moneyBearing: false;
        readonly verbatimText: true;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly platformUserId: "string";
            readonly noteRef: "string";
            readonly noteText: "string";
            readonly createdAt: "timestamp";
            readonly updatedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "createdAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["noteId"];
    };
    readonly posts: {
        readonly moneyBearing: false;
        readonly verbatimText: true;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly postRef: "string";
            readonly postText: "string";
            readonly publishedAt: "timestamp";
            readonly firstObservedAt: "timestamp";
            readonly lastObservedAt: "timestamp";
            readonly rowUpdatedAt: "timestamp";
            readonly attachmentCount: "int";
            readonly fypFlags: "int";
            readonly inReplyToRef: "string";
            readonly wallRefs: "string_array";
        };
        readonly defaultSort: {
            readonly field: "publishedAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["postId"];
    };
    readonly raw_media: {
        readonly moneyBearing: false;
        readonly verbatimText: true;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly mediaRef: "string";
            readonly ownerAccountRef: "string";
            readonly filename: "string";
            readonly mimeType: "string";
            readonly mediaType: "int";
            readonly providerType: "string";
            readonly durationMs: "int";
            readonly width: "int";
            readonly height: "int";
            readonly originalWidth: "int";
            readonly originalHeight: "int";
            readonly frameRateMilli: "int";
            readonly createdAtPlatform: "timestamp";
            readonly updatedAtPlatform: "timestamp";
            readonly firstOrigin: "string";
            readonly sourceKind: "string";
            readonly firstObservedAt: "timestamp";
            readonly lastObservedAt: "timestamp";
            readonly rowUpdatedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "firstObservedAt";
            readonly dir: "asc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["mediaRef"];
    };
    readonly post_attachments: {
        readonly moneyBearing: false;
        readonly verbatimText: true;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly postRef: "string";
            readonly publishedAt: "timestamp";
            readonly attachmentIndex: "int";
            readonly pos: "int";
            readonly contentType: "int";
            readonly contentRef: "string";
            readonly role: "string";
            readonly memberIndex: "int";
            readonly bundleRef: "string";
            readonly mediaOfferRef: "string";
            readonly previewRef: "string";
            readonly mediaRef: "string";
            readonly linkState: "string";
            readonly filename: "string";
            readonly mimeType: "string";
            readonly durationMs: "int";
            readonly originalWidth: "int";
            readonly originalHeight: "int";
            readonly lastObservedAt: "timestamp";
            readonly rowUpdatedAt: "timestamp";
            readonly postObservationRef: "int";
            readonly offerObservationRef: "int";
            readonly bundleObservationRef: "int";
            readonly fileObservationRef: "int";
        };
        readonly defaultSort: {
            readonly field: "publishedAt";
            readonly dir: "asc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["postAttachmentKey"];
    };
    readonly post_monetization: {
        readonly moneyBearing: true;
        readonly verbatimText: true;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly postRef: "string";
            readonly publishedAt: "timestamp";
            readonly lastObservedAt: "timestamp";
            readonly postTargetTipAmountMills: "mills";
            readonly attachmentTipAmountMills: "mills";
            readonly postTipTotalMills: "mills";
            readonly tipGoalLinked: "bool";
            readonly tipGoalRef: "string";
            readonly tipGoalLabelText: "string";
            readonly tipGoalTargetMills: "mills";
            readonly tipGoalCurrentMills: "mills";
            readonly tipGoalAmountsHidden: "bool";
        };
        readonly defaultSort: {
            readonly field: "publishedAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["postId"];
    };
    readonly post_tips: {
        readonly moneyBearing: true;
        readonly verbatimText: true;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly postTipPostRef: "string";
            readonly postTipRef: "string";
            readonly tipSenderPlatformUserId: "string";
            readonly postTipOccurredAt: "timestamp";
            readonly postTipAmountMills: "mills";
            readonly receiverTransactionRef: "string";
            readonly postTipGoalRef: "string";
            readonly postTipMessageText: "string";
        };
        readonly defaultSort: {
            readonly field: "postTipOccurredAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["postTipId"];
    };
    readonly tip_goals: {
        readonly moneyBearing: true;
        readonly verbatimText: true;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly tipGoalRef: "string";
            readonly tipGoalLabelText: "string";
            readonly tipGoalTargetMills: "mills";
            readonly tipGoalCurrentMills: "mills";
            readonly tipGoalAmountsHidden: "bool";
            readonly lastObservedAt: "timestamp";
            readonly linkedPostCount: "int";
        };
        readonly defaultSort: {
            readonly field: "lastObservedAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["tipGoalRef"];
    };
    readonly traffic_daily: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly subjectKind: "string";
            readonly subjectRef: "string";
            readonly periodMs: "int";
            readonly bucketStart: "timestamp";
            /** RAW platform code as text (A22-2). Key on THIS. */
            readonly sourceCode: "string";
            /** This build's reading of the code; `unknown:<code>` when it has none. */
            readonly sourceLabel: "string";
            readonly mappingVersion: "int";
            /** `type - (type % 10)` for a profile row; null for the 0/1 media codes,
             *  which are not a family/member structure at all. */
            readonly family: "string";
            /** Member 1 is the creator widget's visit count; anything else is the
             *  dwell-bearing series, whose own view counts differ. */
            readonly measure: "string";
            readonly views: "int";
            readonly previewViews: "int";
            readonly uniqueViewers: "int";
            readonly previewUniqueViewers: "int";
            readonly interactionTimeMs: "int";
            readonly previewInteractionTimeMs: "int";
        };
        readonly defaultSort: {
            readonly field: "bucketStart";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["bucketKey"];
    };
    readonly media_stats: {
        readonly moneyBearing: true;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly mediaOfferRef: "string";
            readonly mediaType: "int";
            readonly mimeType: "string";
            readonly durationMs: "int";
            readonly periodMs: "int";
            readonly bucketStart: "timestamp";
            readonly sourceCode: "string";
            readonly sourceLabel: "string";
            readonly mappingVersion: "int";
            readonly views: "int";
            readonly previewViews: "int";
            readonly uniqueViewers: "int";
            readonly previewUniqueViewers: "int";
            readonly interactionTimeMs: "int";
            readonly previewInteractionTimeMs: "int";
            readonly priceMills: "mills";
            readonly salesCount: "int";
            readonly salesNetMills: "mills";
            /** DERIVED from net at read time (net / 0.8, A12). The name carries the
             *  warning because a wire field cannot carry a footnote. */
            readonly salesGrossMillsDerived: "mills";
        };
        readonly defaultSort: {
            readonly field: "bucketStart";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["mediaBucketKey"];
    };
    readonly top_media: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly plane: "string";
            readonly rank: "int";
            readonly mediaOfferRef: "string";
            readonly bundleRef: "string";
            readonly periodMs: "int";
            readonly requestedStart: "timestamp";
            readonly requestedEnd: "timestamp";
            readonly views: "int";
            readonly previewViews: "int";
            readonly interactionTimeMs: "int";
            readonly previewInteractionTimeMs: "int";
            readonly observedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "requestedEnd";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["topMediaKey"];
    };
    readonly top_tags: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly plane: "string";
            readonly rank: "int";
            readonly tagRef: "string";
            /** NULL when the response's own `tags[]` join missed — never fabricated
             *  from the id, and never read as "the tag has no name". */
            readonly tagName: "string";
            readonly periodMs: "int";
            readonly requestedStart: "timestamp";
            readonly requestedEnd: "timestamp";
            readonly views: "int";
            readonly previewViews: "int";
            readonly interactionTimeMs: "int";
            readonly previewInteractionTimeMs: "int";
            readonly observedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "requestedEnd";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["topTagKey"];
    };
    readonly revenue_mix: {
        readonly moneyBearing: true;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly businessDate: "date";
            /** RAW. ONE visible label maps to TWO live codes, legacy and current
             *  (A22-2), and this ledger reaches back to 2025-03-06 — well into legacy
             *  territory. Group by `typeCode` for the truth, by `typeLabel` for the
             *  grouping the platform's own chart shows. */
            readonly typeCode: "int";
            readonly typeLabel: "string";
            readonly typeEra: "string";
            readonly mappingVersion: "int";
            /** Stored separately, NEVER derived across bases. */
            readonly grossMills: "mills";
            readonly netMills: "mills";
            readonly lastObservedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "businessDate";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["revenueMixKey"];
    };
    readonly message_media_sales: {
        readonly moneyBearing: true;
        readonly verbatimText: false;
        readonly disclosesPurchase: true;
        readonly fields: {
            readonly platform: "string";
            readonly messageRef: "string";
            readonly conversationRef: "string";
            readonly offerOrdinal: "int";
            readonly mediaOfferRef: "string";
            readonly bundleRef: "string";
            readonly offerType: "int";
            readonly mimeType: "string";
            readonly durationMs: "int";
            readonly priceMills: "mills";
            /** The archive joins THIS for purchase state (A17-4 variant B); it is not
             *  a column on the message row. `unknown` is a real value, not a null. */
            readonly purchaseState: "string";
            readonly orderRef: "string";
            readonly salesCount: "int";
            readonly salesNetMills: "mills";
            readonly fanPlatformUserId: "string";
            readonly messageCreatedAt: "timestamp";
            readonly lastObservedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "messageCreatedAt";
            readonly dir: "desc";
            readonly nullsLast: true;
        };
        readonly stableKey: readonly ["messageOfferKey"];
    };
    readonly comments: {
        readonly moneyBearing: true;
        readonly verbatimText: true;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly commentRef: "string";
            readonly parentPostRef: "string";
            readonly rootPostRef: "string";
            readonly authorRef: "string";
            readonly authorUsername: "string";
            /** `''` is a REPLY, not a missing one: a fan who replied with only an
             *  attachment still replied, and one of the four live captured replies
             *  had empty content. */
            readonly commentText: "string";
            readonly likeCount: "int";
            /** TWO BASES, never summed. */
            readonly tipTotalMills: "mills";
            readonly attachmentTipMills: "mills";
            readonly attachmentCount: "int";
            readonly occurredAt: "timestamp";
            readonly changedAt: "timestamp";
            readonly discoveredVia: "string";
            /** The walk route has no established pagination, so a suspiciously full
             *  page marks its rows. A true here means per-post completeness is
             *  UNKNOWN for that post — never that the comment is suspect. */
            readonly possiblyTruncated: "bool";
            /** A later FULL walk stopped naming this comment. Never a delete (DP 7). */
            readonly missingSince: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "occurredAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["commentKey"];
    };
    readonly likes: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly subjectKind: "string";
            readonly subjectRef: "string";
            readonly likerPlatformUserId: "string";
            /** `active` | `undone`. An undo sets the state; it never deletes. */
            readonly state: "string";
            readonly occurredAt: "timestamp";
            readonly discoveredVia: "string";
        };
        readonly defaultSort: {
            readonly field: "occurredAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["likeKey"];
    };
    readonly vault_media: {
        readonly moneyBearing: false;
        readonly verbatimText: true;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            /** `creator` | `user`. The user vault is the account's OWN Likes and
             *  Purchases and holds OTHER creators' media, so merging the two would
             *  make purchases indistinguishable from inventory. */
            readonly vaultKind: "string";
            readonly albumRef: "string";
            readonly albumTitle: "string";
            readonly lastFullWalkAt: "timestamp";
            readonly fullWalkRef: "string";
            readonly fullWalkObservedCount: "int";
            readonly customFilename: "string";
            readonly filename: "string";
            readonly mimeType: "string";
            readonly durationMs: "int";
            readonly originalWidth: "int";
            readonly originalHeight: "int";
            /** Raw file identity. This is the membership key on the live creator
             *  vault and remains distinct from an optional offer id. */
            readonly mediaRef: "string";
            readonly mediaOfferRef: "string";
            /** The membership row's OWN id — the vault walk's cursor, and NOT the
             *  same value as `mediaOfferRef`. */
            readonly memberRef: "string";
            readonly mediaType: "int";
            readonly bundleRef: "string";
            readonly createdAtPlatform: "timestamp";
            readonly missingSince: "timestamp";
            readonly firstObservedAt: "timestamp";
            readonly lastObservedAt: "timestamp";
            readonly rowUpdatedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "firstObservedAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["vaultMemberKey"];
    };
    readonly notifications: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: true;
        readonly fields: {
            readonly platform: "string";
            readonly notificationRef: "string";
            /** RAW. The shipped spec was wrong on EIGHT of sixteen codes, including
             *  both purchase events (A22-1) — which is why storage keys on this and
             *  the label below carries its own confidence. */
            readonly typeCode: "int";
            readonly typeLabel: "string";
            /** `confirmed` requires two independent live examples agreeing with a
             *  second source; everything client-derived is `inferred`. */
            readonly typeConfidence: "string";
            readonly mappingVersion: "int";
            readonly correlationRef: "string";
            readonly correlationGroupRef: "string";
            readonly occurredAt: "timestamp";
            readonly acknowledgedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "occurredAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["notificationKey"];
    };
    readonly subscription_tiers: {
        readonly moneyBearing: true;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly tierRef: "string";
            readonly tierName: "string";
            readonly tierPos: "int";
            /** The tier HEAD's `price`. A base, never what a subscriber pays. */
            readonly basePriceMills: "mills";
            readonly maxSubscribers: "int";
            readonly planRef: "string";
            readonly planStatus: "int";
            /** Reads `plans[].billingCycle` — verified live; `duration` exists one
             *  level down, on `promos[]`, and is a different thing. */
            readonly durationDays: "int";
            /** THE PRICE TRUTH. */
            readonly priceMills: "mills";
            readonly promoCount: "int";
            readonly missingSince: "timestamp";
            readonly lastObservedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "lastObservedAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["tierPlanKey"];
    };
    readonly payouts: {
        readonly moneyBearing: true;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly payoutRef: "string";
            /** MILLS with no scaling: the wire unit IS the kernel unit here. */
            readonly amountMills: "mills";
            /** RAW. 8 is the ONLY code ever observed and is never treated as "the
             *  success code" — `statusConfidence` is how a reader learns that. */
            readonly statusCode: "int";
            readonly statusLabel: "string";
            readonly statusConfidence: "string";
            readonly methodRef: "string";
            readonly methodProviderId: "int";
            readonly methodProviderLabel: "string";
            /** OURS, never the provider's. */
            readonly methodMaskedLabel: "string";
            readonly requestedAt: "timestamp";
            readonly updatedAtPlatform: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "requestedAt";
            readonly dir: "desc";
            readonly nullsLast: true;
        };
        readonly stableKey: readonly ["payoutKey"];
    };
    readonly capture_coverage: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly platform: "string";
            readonly plane: "string";
            readonly scopeRef: "string";
            readonly status: "string";
            readonly acquisitionMode: "string";
            readonly proof: "string";
            readonly oldestCapturedAt: "timestamp";
            readonly newestCapturedAt: "timestamp";
            readonly expectedCount: "int";
            readonly observedUniqueCount: "int";
            readonly reasonCode: "string";
            readonly nextProbeAt: "timestamp";
            readonly updatedAt: "timestamp";
        };
        readonly defaultSort: {
            readonly field: "updatedAt";
            readonly dir: "desc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["coverageKey"];
    };
    readonly sync_streams: {
        readonly moneyBearing: false;
        readonly verbatimText: false;
        readonly disclosesPurchase: false;
        readonly fields: {
            readonly stream: "string";
            readonly syncStatus: "string";
            readonly cursorAt: "timestamp";
            readonly succeededAt: "timestamp";
            readonly failedAt: "timestamp";
            readonly consecutiveFailures: "int";
        };
        readonly defaultSort: {
            readonly field: "stream";
            readonly dir: "asc";
            readonly nullsLast: false;
        };
        readonly stableKey: readonly ["pageId", "stream"];
    };
};
export type AgentDataset = keyof typeof AGENT_DATASETS;
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
export declare const AGENT_PLANNED_DATASETS: {
    readonly fan_earnings: {};
    readonly stories: {};
    readonly fan_lists: {};
    readonly livestreams: {};
    readonly campaigns: {};
    readonly polls: {};
    readonly chargebacks: {};
    readonly blocks: {};
};
export type AgentPlannedDataset = keyof typeof AGENT_PLANNED_DATASETS;
/** Derived. Anything that needs "which datasets are addressable" reads THIS. */
export declare const AGENT_DATASET_NAMES: readonly AgentDataset[];
/** Derived. The catalog lists these with `availability: "planned"`. */
export declare const AGENT_PLANNED_DATASET_NAMES: readonly AgentPlannedDataset[];
export declare function agentDatasetDefinition(dataset: string): AgentDatasetDefinition | undefined;
export type AgentDatasetFilterIssue = {
    readonly code: "unknown_field";
} | {
    readonly code: "operator_not_supported" | "value_type_mismatch";
    readonly kind: AgentDatasetFieldKind;
};
/**
 * Validates a dataset filter after the path/body schemas but before SQL mapping.
 * The issue contains no caller value, so a 400 can be logged or returned without
 * echoing potentially sensitive filter material.
 */
export declare function agentDatasetFilterIssue(dataset: string, input: {
    readonly field: string;
    readonly op: AgentDatasetFilterOperator;
    readonly value?: unknown;
}): AgentDatasetFilterIssue | null;
/**
 * The capabilities a key must hold to query this dataset: `read:datasets` always,
 * plus `read:money` for a money-bearing one and `read:messages` for one that
 * serves free text. Derived from the declaration, so a dataset that gains a money
 * field or a text body cannot keep the narrower requirement.
 */
export declare function agentDatasetRequiredCapabilities(dataset: AgentDataset): readonly AgentCapability[];
/**
 * Free-form content includes `*Text` fields and user-written file/album names.
 *
 * A convention rather than a per-field flag because the scalar KIND cannot tell
 * `noteText` from `username` — both are `string` — and the thing that must not
 * drift is "does this dataset hand over prose", which the field name already says.
 */
export declare function agentDatasetFieldIsVerbatimText(field: string): boolean;
/** Every declared field of a dataset is filterable — the map IS the allowlist. */
export declare function agentDatasetFieldFilterable(): boolean;
/**
 * Sortable = the kind admits a deterministic order (numbers, money, instants,
 * dates), OR the field is this dataset's default sort. Free text and booleans are
 * deliberately excluded: sorting a page of transcripts by note text buys nothing
 * and costs an unindexable ORDER BY.
 */
export declare function agentDatasetFieldSortable(dataset: AgentDataset, field: string): boolean;
export type AgentDatasetFieldView = {
    readonly field: string;
    readonly kind: AgentDatasetFieldKind;
    readonly filterable: boolean;
    readonly sortable: boolean;
};
/** The catalog view of a dataset's fields, in declaration order. */
export declare function agentDatasetFields(dataset: AgentDataset): readonly AgentDatasetFieldView[];
