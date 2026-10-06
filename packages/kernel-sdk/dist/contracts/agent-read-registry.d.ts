/**
 * Agent Read Plane — the single source of truth for the claim/plane vocabulary.
 *
 * WHY THIS FILE EXISTS (do not "simplify" it back into prose):
 * the design spec restated the same vocabulary in a dozen places — an enum here,
 * a count there, a matrix in the appendix, a pinned number in a test. Three
 * adversarial review rounds each found real defects caused purely by those
 * restatements drifting apart (plane enum said 19 while four other sites still
 * pinned 13; six claim classes in the architecture against four in the contract
 * appendix). The vocabulary is therefore declared ONCE, here, and the enums,
 * counts and required-plane sets are DERIVED. A drift becomes a compile error
 * instead of a silent lie in a response body.
 *
 * SCOPE: this module owns the claim/plane vocabulary only. Per-operation
 * membership (which operation may speak to which fields) lands together with the
 * operations themselves and must be declared HERE when it does — hand-listing it
 * at each route is exactly the drift this file exists to prevent.
 *
 * Design reference: `investigations/agent-read-api-design-2026-07-31.md` §5.
 */
/**
 * A physical store the read plane can consult.
 *
 * `required` planes decide `conclusion.absenceProvable`: if one of them is not
 * `read`, no negative conclusion is possible. `evidentiary` planes are reported
 * in `capture.planes[]` for provenance but never block a conclusion.
 *
 * The split exists because an earlier revision required EVERY plane of a class
 * to be `read`, which included the capture journal — and the journal only
 * begins 2026-07-05 in production, so `absenceProvable` was structurally `false`
 * on every historical window, on both platforms, even with a valid OnlyFans
 * continuity proof. `message_archive` is authoritative for reads; the journal is
 * provenance evidence, already expressed through `fieldStates`/`provenance`.
 */
export type AgentPlaneRole = "required" | "evidentiary";
/**
 * Required planes are declared PER FIELD, not per class.
 *
 * A class-level `required` set is unsound whenever the class groups fields with
 * different authoritative stores: with `crm.required = ["fan_notes"]`, a reader
 * could satisfy the check by reading notes and then claim "this fan has no
 * profile body" without ever touching `fan_profiles`. The question
 * "what must I have read to assert this is absent?" belongs to the field.
 */
export type AgentClaimFieldDefinition = {
    /** Authoritative store(s). ALL must be `read` before absence may be asserted. */
    readonly required: readonly string[];
};
export type AgentClaimClassDefinition = {
    /** Stores reported for provenance; never gate a conclusion. */
    readonly evidentiary: readonly string[];
    /** Wire field -> the store(s) that authoritatively answer for it. */
    readonly fields: Readonly<Record<string, AgentClaimFieldDefinition>>;
};
/**
 * The seven claim classes. A request may declare `claim.fields`; each field maps
 * to exactly one class (pinned by test), and the conclusion is evaluated against
 * the union of the REQUIRED planes of the named fields.
 *
 * Field names are the wire names from the contract appendix §17 — not invented
 * ones. A name that does not exist on the wire makes every real claim resolve to
 * `claim_field_unobservable`, which silently reduces `absenceProvable` to a
 * constant `false`.
 */
export declare const AGENT_CLAIM_CLASSES: {
    readonly messages: {
        readonly evidentiary: readonly ["page_dm_messages", "page_dm_threads", "observations", "sync_raw_payloads"];
        readonly fields: {
            readonly textPlain: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly textHtml: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly priceMills: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly isOpened: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly isNew: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly isTip: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly tipAmountMills: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly tipTextPlain: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly inReplyToRef: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly replyMetadata: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly mediaMetadata: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly deletedAt: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly conversationRef: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly messageCount: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly coverageStatus: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly purchaseState: {
                readonly required: readonly ["message_archive", "dm_message_archive"];
            };
            readonly contextState: {
                readonly required: readonly ["transactions", "transaction_tip_contexts"];
            };
            readonly capturedConversationRef: {
                readonly required: readonly ["transactions", "transaction_tip_contexts"];
            };
            readonly tipMessageText: {
                readonly required: readonly ["transactions", "transaction_tip_contexts"];
            };
            readonly messageMediaOffer: {
                readonly required: readonly ["message_media_offers"];
            };
        };
    };
    readonly money: {
        readonly evidentiary: readonly ["fan_spend_daily"];
        readonly fields: {
            readonly grossMills: {
                readonly required: readonly ["transactions"];
            };
            readonly netMills: {
                readonly required: readonly ["transactions"];
            };
            readonly feeMills: {
                readonly required: readonly ["transactions"];
            };
            readonly amountMills: {
                readonly required: readonly ["transactions"];
            };
            readonly currency: {
                readonly required: readonly ["transactions"];
            };
            readonly transactionState: {
                readonly required: readonly ["transactions"];
            };
            readonly correlationRef: {
                readonly required: readonly ["transactions"];
            };
            readonly refundState: {
                readonly required: readonly ["transactions"];
            };
            readonly fanEarning: {
                readonly required: readonly ["transactions"];
            };
            readonly lifetimeSpendMills: {
                readonly required: readonly ["fan_spend_lifetime"];
            };
            readonly revenueMixDay: {
                readonly required: readonly ["revenue_mix_daily"];
            };
            readonly payoutRequest: {
                readonly required: readonly ["page_payout_requests"];
            };
            readonly ofapiFinancialMetric: {
                readonly required: readonly ["ofapi_read_snapshots"];
            };
            readonly ofapiPayoutRequest: {
                readonly required: readonly ["ofapi_read_snapshots"];
            };
            readonly payoutMethod: {
                readonly required: readonly ["page_payout_methods"];
            };
        };
    };
    readonly identity: {
        readonly evidentiary: readonly [];
        readonly fields: {
            readonly platformUserId: {
                readonly required: readonly ["fans"];
            };
            readonly username: {
                readonly required: readonly ["fans"];
            };
            readonly displayName: {
                readonly required: readonly ["fans"];
            };
            readonly membershipState: {
                readonly required: readonly ["page_fans"];
            };
            readonly pageAlias: {
                readonly required: readonly ["page_fans", "page_fan_aliases", "fan_username_aliases"];
            };
        };
    };
    readonly subscription: {
        readonly evidentiary: readonly ["domain_events"];
        readonly fields: {
            readonly subscriptionState: {
                readonly required: readonly ["page_subscriptions"];
            };
            readonly subscriptionPriceMills: {
                readonly required: readonly ["page_subscriptions"];
            };
            readonly subscriptionExpiresAt: {
                readonly required: readonly ["page_subscriptions"];
            };
        };
    };
    readonly audience: {
        readonly evidentiary: readonly ["daily_followers"];
        readonly fields: {
            readonly followed: {
                readonly required: readonly ["page_follows"];
            };
            readonly presenceAt: {
                readonly required: readonly ["page_fans"];
            };
        };
    };
    readonly crm: {
        readonly evidentiary: readonly [];
        readonly fields: {
            readonly noteText: {
                readonly required: readonly ["fan_notes"];
            };
            readonly summaryText: {
                readonly required: readonly ["fan_summaries"];
            };
            readonly profileBody: {
                readonly required: readonly ["fan_profiles"];
            };
            readonly fanFlag: {
                readonly required: readonly ["fan_flags"];
            };
        };
    };
    readonly content: {
        readonly evidentiary: readonly ["observations", "sync_raw_payloads"];
        readonly fields: {
            readonly postRef: {
                readonly required: readonly ["creator_posts"];
            };
            readonly postText: {
                readonly required: readonly ["creator_posts"];
            };
            readonly publishedAt: {
                readonly required: readonly ["creator_posts"];
            };
            readonly firstObservedAt: {
                readonly required: readonly ["creator_posts"];
            };
            readonly lastObservedAt: {
                readonly required: readonly ["creator_posts"];
            };
            readonly attachmentCount: {
                readonly required: readonly ["creator_posts"];
            };
            readonly fypFlags: {
                readonly required: readonly ["creator_posts"];
            };
            readonly wallRefs: {
                readonly required: readonly ["creator_posts"];
            };
            readonly rawMedia: {
                readonly required: readonly ["creator_raw_media"];
            };
            readonly vaultInventory: {
                readonly required: readonly ["creator_vault_album_members", "creator_vault_album_scans"];
            };
            readonly postAttachment: {
                readonly required: readonly ["creator_posts", "creator_media", "creator_media_bundles", "creator_raw_media"];
            };
            readonly postTargetTipAmountMills: {
                readonly required: readonly ["creator_posts"];
            };
            readonly attachmentTipAmountMills: {
                readonly required: readonly ["creator_posts"];
            };
            readonly postTipTotalMills: {
                readonly required: readonly ["creator_posts"];
            };
            readonly tipGoalLinked: {
                readonly required: readonly ["creator_posts"];
            };
            readonly tipGoalRef: {
                readonly required: readonly ["creator_posts"];
            };
            readonly tipGoalLabelText: {
                readonly required: readonly ["creator_posts"];
            };
            readonly tipGoalTargetMills: {
                readonly required: readonly ["creator_posts"];
            };
            readonly tipGoalCurrentMills: {
                readonly required: readonly ["creator_posts"];
            };
            readonly tipGoalAmountsHidden: {
                readonly required: readonly ["creator_posts"];
            };
            readonly postTipPostRef: {
                readonly required: readonly ["creator_post_tips"];
            };
            readonly postTipRef: {
                readonly required: readonly ["creator_post_tips"];
            };
            readonly tipSenderPlatformUserId: {
                readonly required: readonly ["creator_post_tips"];
            };
            readonly postTipOccurredAt: {
                readonly required: readonly ["creator_post_tips"];
            };
            readonly postTipAmountMills: {
                readonly required: readonly ["creator_post_tips"];
            };
            readonly receiverTransactionRef: {
                readonly required: readonly ["creator_post_tips"];
            };
            readonly postTipGoalRef: {
                readonly required: readonly ["creator_post_tips"];
            };
            readonly postTipMessageText: {
                readonly required: readonly ["creator_post_tips"];
            };
            readonly linkedPostCount: {
                readonly required: readonly ["creator_posts"];
            };
            readonly trafficBucket: {
                readonly required: readonly ["stats_traffic_buckets"];
            };
            readonly topMediaWindow: {
                readonly required: readonly ["stats_top_media"];
            };
            readonly topTagWindow: {
                readonly required: readonly ["stats_top_tags"];
            };
            readonly mediaTagWindow: {
                readonly required: readonly ["fansly_media_tag_stats"];
            };
            readonly platformTagCounter: {
                readonly required: readonly ["platform_tag_daily"];
            };
            readonly mediaOffer: {
                readonly required: readonly ["creator_media"];
            };
            readonly vaultAlbum: {
                readonly required: readonly ["creator_vault_albums"];
            };
            readonly vaultAlbumMember: {
                readonly required: readonly ["creator_vault_album_members"];
            };
            readonly subscriptionTier: {
                readonly required: readonly ["page_subscription_tiers"];
            };
            readonly subscriptionTierPlan: {
                readonly required: readonly ["page_subscription_tier_plans"];
            };
            readonly postComment: {
                readonly required: readonly ["post_comments"];
            };
            readonly postLike: {
                readonly required: readonly ["post_likes"];
            };
            readonly platformNotification: {
                readonly required: readonly ["platform_notifications"];
            };
            readonly captureCoverageRow: {
                readonly required: readonly ["capture_coverage"];
            };
        };
    };
};
export type AgentClaimClass = keyof typeof AGENT_CLAIM_CLASSES;
export declare const AGENT_CLAIM_CLASS_NAMES: readonly AgentClaimClass[];
/**
 * Literal unions derived from the declaration. These make the header's promise
 * real: a typo in a plane or field name is a COMPILE error, and Zod enums built
 * from these stay narrow instead of degrading to `string`.
 */
export type AgentClaimField = {
    [C in AgentClaimClass]: keyof (typeof AGENT_CLAIM_CLASSES)[C]["fields"];
}[AgentClaimClass];
type RequiredPlaneOf<C extends AgentClaimClass> = {
    [F in keyof (typeof AGENT_CLAIM_CLASSES)[C]["fields"]]: (typeof AGENT_CLAIM_CLASSES)[C]["fields"][F] extends {
        required: readonly (infer P)[];
    } ? P : never;
}[keyof (typeof AGENT_CLAIM_CLASSES)[C]["fields"]];
export type AgentPlaneName = (typeof AGENT_CLAIM_CLASSES)[AgentClaimClass]["evidentiary"][number] | {
    [C in AgentClaimClass]: RequiredPlaneOf<C>;
}[AgentClaimClass];
/** Every plane name, deduped, in declaration order. Derived — never hand-listed. */
export declare const AGENT_PLANE_NAMES: readonly AgentPlaneName[];
/** Derived count. Anything that needs "how many planes" reads THIS, never a literal. */
export declare const AGENT_PLANE_COUNT: number;
/** Every declared claim field, deduped. Derived. */
export declare const AGENT_CLAIM_FIELDS: readonly AgentClaimField[];
/** field -> class. Built once; the test pins that no field lands in two classes. */
export declare const AGENT_CLAIM_FIELD_CLASS: ReadonlyMap<AgentClaimField, AgentClaimClass>;
/**
 * Widened view of a class: its evidentiary planes, and the union of the required
 * planes of all its fields.
 *
 * `as const` narrows each array to a literal tuple, which makes `.includes(x)`
 * on a plain `string` a type error. Callers want set membership, so the widening
 * happens once here rather than as casts scattered at every use.
 */
export declare function agentClassPlanes(claimClass: AgentClaimClass): {
    readonly required: readonly string[];
    readonly evidentiary: readonly string[];
    readonly fields: readonly string[];
};
/** plane -> role within a given class. Used to build `capture.planes[]`. */
export declare function agentPlaneRole(claimClass: AgentClaimClass, plane: string): AgentPlaneRole | "not_applicable";
/**
 * Boundary lookup: accepts an UNVALIDATED field name (it arrives from a request)
 * and resolves its class, or `undefined` when the field is unknown. The map
 * itself stays keyed by the literal union so typed callers keep the compile-time
 * guarantee; only this seam widens.
 */
export declare function agentClaimFieldClass(field: string): AgentClaimClass | undefined;
/**
 * The planes that must be `read` before a negative conclusion is permitted for
 * these claim fields — the union of each named field's authoritative stores.
 *
 * Returns `null` (fail closed) when any field is unknown, or when the claim is
 * empty: callers treat `null` as "cannot conclude".
 */
export declare function requiredPlanesForClaimFields(fields: readonly string[]): readonly string[] | null;
export {};
