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
 * The seven claim classes. A request may declare `claim.fields`; each field maps
 * to exactly one class (pinned by test), and the conclusion is evaluated against
 * the union of the REQUIRED planes of the named fields.
 *
 * Field names are the wire names from the contract appendix §17 — not invented
 * ones. A name that does not exist on the wire makes every real claim resolve to
 * `claim_field_unobservable`, which silently reduces `absenceProvable` to a
 * constant `false`.
 */
export const AGENT_CLAIM_CLASSES = {
    messages: {
        evidentiary: ["page_dm_messages", "page_dm_threads", "observations", "sync_raw_payloads"],
        fields: {
            textPlain: { required: ["message_archive", "dm_message_archive"] },
            textHtml: { required: ["message_archive", "dm_message_archive"] },
            priceMills: { required: ["message_archive", "dm_message_archive"] },
            isOpened: { required: ["message_archive", "dm_message_archive"] },
            isNew: { required: ["message_archive", "dm_message_archive"] },
            isTip: { required: ["message_archive", "dm_message_archive"] },
            tipAmountMills: { required: ["message_archive", "dm_message_archive"] },
            tipTextPlain: { required: ["message_archive", "dm_message_archive"] },
            inReplyToRef: { required: ["message_archive", "dm_message_archive"] },
            replyMetadata: { required: ["message_archive", "dm_message_archive"] },
            mediaMetadata: { required: ["message_archive", "dm_message_archive"] },
            deletedAt: { required: ["message_archive", "dm_message_archive"] },
            conversationRef: { required: ["message_archive", "dm_message_archive"] },
            messageCount: { required: ["message_archive", "dm_message_archive"] },
            coverageStatus: { required: ["message_archive", "dm_message_archive"] },
            purchaseState: { required: ["message_archive", "dm_message_archive"] },
            // Context is served over the active transaction population. The sidecar
            // alone can prove the bytes of one captured note, but it cannot prove
            // which ledger tips are missing context; both planes are authoritative
            // for an all-in-scope claim.
            contextState: { required: ["transactions", "transaction_tip_contexts"] },
            capturedConversationRef: { required: ["transactions", "transaction_tip_contexts"] },
            tipMessageText: { required: ["transactions", "transaction_tip_contexts"] },
            // ── endpoints-cover (WP-S1) ──────────────────────────────────────────
            // What was OFFERED and what was BOUGHT inside a DM. It belongs to the
            // messages class, not to money, because the fact it discloses is about a
            // conversation — the scope-pairing rule (`read:messages` AND
            // `read:money`) is the capability half of the same judgement.
            messageMediaOffer: { required: ["message_media_offers"] },
        },
    },
    money: {
        evidentiary: ["fan_spend_daily"],
        fields: {
            grossMills: { required: ["transactions"] },
            netMills: { required: ["transactions"] },
            feeMills: { required: ["transactions"] },
            amountMills: { required: ["transactions"] },
            currency: { required: ["transactions"] },
            transactionState: { required: ["transactions"] },
            correlationRef: { required: ["transactions"] },
            // Refund/chargeback outcome of a transaction. Declared as its own field
            // because `transactionState` alone reads as observable while neither
            // platform's capture can actually answer "was this refunded": Fansly has
            // no refund/chargeback lane at all (FEAT-004; rows stay `posted`
            // forever), and the OF chargeback capture is not projected into any
            // agent-readable store. The per-platform truth lives in
            // AGENT_PLATFORM_CAPABILITIES, and claiming this field is what routes a
            // "no refunds happened" conclusion through that table.
            refundState: { required: ["transactions"] },
            fanEarning: { required: ["transactions"] },
            // Lifetime totals have their own rollup; reading `transactions` for a
            // window says nothing about a lifetime figure.
            lifetimeSpendMills: { required: ["fan_spend_lifetime"] },
            // ── endpoints-cover (WP-S1) ──────────────────────────────────────────
            // The platform's own earnings breakdown and the money-OUT head. Neither
            // is the ledger: `revenue_mix_daily` is what Fansly says it paid, and
            // `transactions` is what we recorded arriving. Reading one proves nothing
            // about the other, which is exactly why they get separate planes.
            revenueMixDay: { required: ["revenue_mix_daily"] },
            payoutRequest: { required: ["page_payout_requests"] },
            ofapiFinancialMetric: { required: ["ofapi_read_snapshots"] },
            // OnlyFans payout requests live in the same snapshot store; their own
            // field so a payout conclusion names what it rests on.
            ofapiPayoutRequest: { required: ["ofapi_read_snapshots"] },
            payoutMethod: { required: ["page_payout_methods"] },
        },
    },
    identity: {
        evidentiary: [],
        fields: {
            platformUserId: { required: ["fans"] },
            username: { required: ["fans"] },
            displayName: { required: ["fans"] },
            membershipState: { required: ["page_fans"] },
            // Aliases live in their own stores; `fans` alone cannot answer for them.
            pageAlias: { required: ["page_fans", "page_fan_aliases", "fan_username_aliases"] },
        },
    },
    subscription: {
        evidentiary: ["domain_events"],
        fields: {
            subscriptionState: { required: ["page_subscriptions"] },
            subscriptionPriceMills: { required: ["page_subscriptions"] },
            subscriptionExpiresAt: { required: ["page_subscriptions"] },
        },
    },
    audience: {
        evidentiary: ["daily_followers"],
        fields: {
            followed: { required: ["page_follows"] },
            presenceAt: { required: ["page_fans"] },
        },
    },
    crm: {
        evidentiary: [],
        fields: {
            // Each CRM field has a DIFFERENT authoritative store. This is the case
            // that proved class-level `required` unsound: with `required:
            // ["fan_notes"]`, a reader could satisfy the check by reading notes and
            // then assert "no profile body" without ever opening `fan_profiles`.
            noteText: { required: ["fan_notes"] },
            summaryText: { required: ["fan_summaries"] },
            profileBody: { required: ["fan_profiles"] },
            fanFlag: { required: ["fan_flags"] },
        },
    },
    content: {
        // The current-head projections are authoritative for creator-post material
        // and monetization snapshots. Per-tip rows have their own immutable plane;
        // journal rows remain lineage evidence and are not re-read by dataset #10.
        evidentiary: ["observations", "sync_raw_payloads"],
        fields: {
            postRef: { required: ["creator_posts"] },
            postText: { required: ["creator_posts"] },
            publishedAt: { required: ["creator_posts"] },
            firstObservedAt: { required: ["creator_posts"] },
            lastObservedAt: { required: ["creator_posts"] },
            attachmentCount: { required: ["creator_posts"] },
            fypFlags: { required: ["creator_posts"] },
            wallRefs: { required: ["creator_posts"] },
            rawMedia: { required: ["creator_raw_media"] },
            vaultInventory: { required: ["creator_vault_album_members", "creator_vault_album_scans"] },
            postAttachment: { required: ["creator_posts", "creator_media", "creator_media_bundles", "creator_raw_media"] },
            postTargetTipAmountMills: { required: ["creator_posts"] },
            attachmentTipAmountMills: { required: ["creator_posts"] },
            postTipTotalMills: { required: ["creator_posts"] },
            tipGoalLinked: { required: ["creator_posts"] },
            tipGoalRef: { required: ["creator_posts"] },
            tipGoalLabelText: { required: ["creator_posts"] },
            tipGoalTargetMills: { required: ["creator_posts"] },
            tipGoalCurrentMills: { required: ["creator_posts"] },
            tipGoalAmountsHidden: { required: ["creator_posts"] },
            postTipPostRef: { required: ["creator_post_tips"] },
            postTipRef: { required: ["creator_post_tips"] },
            tipSenderPlatformUserId: { required: ["creator_post_tips"] },
            postTipOccurredAt: { required: ["creator_post_tips"] },
            postTipAmountMills: { required: ["creator_post_tips"] },
            receiverTransactionRef: { required: ["creator_post_tips"] },
            postTipGoalRef: { required: ["creator_post_tips"] },
            postTipMessageText: { required: ["creator_post_tips"] },
            linkedPostCount: { required: ["creator_posts"] },
            // ── endpoints-cover (WP-S1) ──────────────────────────────────────────
            // One field per NEW physical store, each minting the plane name the
            // matching dataset then declares. Without these, every one of those
            // datasets would be stuck on the forbidden `readPlanes: []` — legal, and
            // silently fatal to the capture-floor epistemics the coverage story
            // depends on.
            //
            // They live in `content` rather than in a new class because the class
            // vocabulary is CLOSED: a class is a disclosure boundary (money and
            // messages gate capabilities), not a filing cabinet, and inventing an
            // eighth to hold "statistics" would have added a boundary nobody
            // enforces. `capture_coverage` is the one that reads oddly here and it
            // stays: what a page's capture reaches back to is a fact ABOUT the
            // content planes, and no other class answers for it at all.
            trafficBucket: { required: ["stats_traffic_buckets"] },
            topMediaWindow: { required: ["stats_top_media"] },
            topTagWindow: { required: ["stats_top_tags"] },
            mediaTagWindow: { required: ["fansly_media_tag_stats"] },
            platformTagCounter: { required: ["platform_tag_daily"] },
            mediaOffer: { required: ["creator_media"] },
            vaultAlbum: { required: ["creator_vault_albums"] },
            vaultAlbumMember: { required: ["creator_vault_album_members"] },
            subscriptionTier: { required: ["page_subscription_tiers"] },
            // Its OWN store, not the tier's: the tier head carries a base price and
            // the plan carries the price, so reading tiers proves nothing about what
            // plans exist.
            subscriptionTierPlan: { required: ["page_subscription_tier_plans"] },
            postComment: { required: ["post_comments"] },
            postLike: { required: ["post_likes"] },
            platformNotification: { required: ["platform_notifications"] },
            captureCoverageRow: { required: ["capture_coverage"] },
        },
    },
};
export const AGENT_CLAIM_CLASS_NAMES = Object.keys(AGENT_CLAIM_CLASSES);
function classFieldEntries(claimClass) {
    return Object.entries(AGENT_CLAIM_CLASSES[claimClass].fields);
}
/** Every plane name, deduped, in declaration order. Derived — never hand-listed. */
export const AGENT_PLANE_NAMES = (() => {
    const seen = new Set();
    const ordered = [];
    const push = (plane) => {
        if (!seen.has(plane)) {
            seen.add(plane);
            ordered.push(plane);
        }
    };
    for (const name of AGENT_CLAIM_CLASS_NAMES) {
        for (const [, def] of classFieldEntries(name)) {
            for (const plane of def.required) {
                push(plane);
            }
        }
        for (const plane of AGENT_CLAIM_CLASSES[name].evidentiary) {
            push(plane);
        }
    }
    return ordered;
})();
/** Derived count. Anything that needs "how many planes" reads THIS, never a literal. */
export const AGENT_PLANE_COUNT = AGENT_PLANE_NAMES.length;
/** Every declared claim field, deduped. Derived. */
export const AGENT_CLAIM_FIELDS = (() => {
    const seen = new Set();
    const ordered = [];
    for (const name of AGENT_CLAIM_CLASS_NAMES) {
        for (const [field] of classFieldEntries(name)) {
            if (!seen.has(field)) {
                seen.add(field);
                ordered.push(field);
            }
        }
    }
    return ordered;
})();
/** field -> class. Built once; the test pins that no field lands in two classes. */
export const AGENT_CLAIM_FIELD_CLASS = (() => {
    const map = new Map();
    for (const name of AGENT_CLAIM_CLASS_NAMES) {
        for (const [field] of classFieldEntries(name)) {
            const key = field;
            if (!map.has(key)) {
                map.set(key, name);
            }
        }
    }
    return map;
})();
/**
 * Widened view of a class: its evidentiary planes, and the union of the required
 * planes of all its fields.
 *
 * `as const` narrows each array to a literal tuple, which makes `.includes(x)`
 * on a plain `string` a type error. Callers want set membership, so the widening
 * happens once here rather than as casts scattered at every use.
 */
export function agentClassPlanes(claimClass) {
    const required = new Set();
    const fields = [];
    for (const [field, def] of classFieldEntries(claimClass)) {
        fields.push(field);
        for (const plane of def.required) {
            required.add(plane);
        }
    }
    return {
        required: [...required],
        evidentiary: AGENT_CLAIM_CLASSES[claimClass].evidentiary,
        fields,
    };
}
/** plane -> role within a given class. Used to build `capture.planes[]`. */
export function agentPlaneRole(claimClass, plane) {
    const { required, evidentiary } = agentClassPlanes(claimClass);
    if (required.includes(plane)) {
        return "required";
    }
    if (evidentiary.includes(plane)) {
        return "evidentiary";
    }
    return "not_applicable";
}
/**
 * Boundary lookup: accepts an UNVALIDATED field name (it arrives from a request)
 * and resolves its class, or `undefined` when the field is unknown. The map
 * itself stays keyed by the literal union so typed callers keep the compile-time
 * guarantee; only this seam widens.
 */
export function agentClaimFieldClass(field) {
    return AGENT_CLAIM_FIELD_CLASS.get(field);
}
/**
 * The planes that must be `read` before a negative conclusion is permitted for
 * these claim fields — the union of each named field's authoritative stores.
 *
 * Returns `null` (fail closed) when any field is unknown, or when the claim is
 * empty: callers treat `null` as "cannot conclude".
 */
export function requiredPlanesForClaimFields(fields) {
    // An empty claim is epistemically identical to no claim at all: "every
    // required plane was read" is vacuously true over an empty set, which would
    // authorise a negative conclusion nothing was actually read for. The spec
    // (§5.4) says a missing claim yields `absenceProvable: false`; an empty one
    // must take the same branch rather than a different, permissive one.
    if (fields.length === 0) {
        return null;
    }
    const planes = new Set();
    for (const field of fields) {
        const claimClass = agentClaimFieldClass(field);
        if (!claimClass) {
            return null;
        }
        const classFields = AGENT_CLAIM_CLASSES[claimClass].fields;
        const def = classFields[field];
        if (!def) {
            return null;
        }
        for (const plane of def.required) {
            planes.add(plane);
        }
    }
    return [...planes];
}
