import { z } from "zod";
export declare const ofapiMarketingActionSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    action: z.ZodLiteral<"smart_link_create">;
    pageId: z.ZodNumber;
    name: z.ZodString;
    link_type: z.ZodEnum<{
        free_trial: "free_trial";
        tracking_link: "tracking_link";
    }>;
    free_trial_days: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"smart_link_delete">;
    pageId: z.ZodNumber;
    linkId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"tags_add">;
    pageId: z.ZodNumber;
    linkId: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"tags_remove">;
    pageId: z.ZodNumber;
    linkId: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    pixel_id: z.ZodString;
    pixel_access_token: z.ZodString;
    event_click: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_new_subscriber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_first_transaction: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_new_transaction: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_message_received_from_fan: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_fan_sent_1_message: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_fan_sent_3_messages: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    label: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_source_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    action: z.ZodLiteral<"pixel_create">;
    pageId: z.ZodNumber;
    linkId: z.ZodString;
    platform: z.ZodEnum<{
        meta: "meta";
        snapchat: "snapchat";
        tiktok: "tiktok";
        creatortraffic: "creatortraffic";
    }>;
}, z.core.$strict>, z.ZodObject<{
    event_click: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_new_subscriber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_first_transaction: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_new_transaction: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_message_received_from_fan: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_fan_sent_1_message: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    event_fan_sent_3_messages: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    label: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    pixel_id: z.ZodOptional<z.ZodString>;
    pixel_access_token: z.ZodOptional<z.ZodString>;
    event_source_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    action: z.ZodLiteral<"pixel_update">;
    pageId: z.ZodNumber;
    linkId: z.ZodString;
    pixelId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"pixel_disconnect">;
    pageId: z.ZodNumber;
    linkId: z.ZodString;
    pixelId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"pixel_test">;
    pageId: z.ZodNumber;
    linkId: z.ZodString;
    pixelId: z.ZodNumber;
    test_event_code: z.ZodOptional<z.ZodString>;
    event_type: z.ZodEnum<{
        event_click: "event_click";
        event_new_subscriber_free: "event_new_subscriber_free";
        event_new_subscriber_paid: "event_new_subscriber_paid";
        event_first_transaction: "event_first_transaction";
        event_new_transaction: "event_new_transaction";
        event_message_received_from_fan: "event_message_received_from_fan";
        event_fan_sent_1_message: "event_fan_sent_1_message";
        event_fan_sent_3_messages: "event_fan_sent_3_messages";
    }>;
}, z.core.$strict>, z.ZodObject<{
    url: z.ZodString;
    http_method: z.ZodOptional<z.ZodEnum<{
        GET: "GET";
        POST: "POST";
    }>>;
    body: z.ZodOptional<z.ZodString>;
    headers: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        value: z.ZodString;
    }, z.core.$strict>>>;
    smart_link_scope: z.ZodEnum<{
        global: "global";
        campaign_specific: "campaign_specific";
    }>;
    conversion_types: z.ZodArray<z.ZodEnum<{
        new_subscriber: "new_subscriber";
        new_transaction: "new_transaction";
        message_received: "message_received";
        fan_sent_1_message: "fan_sent_1_message";
        fan_sent_3_messages: "fan_sent_3_messages";
    }>>;
    smart_link_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    action: z.ZodLiteral<"postback_create">;
}, z.core.$strict>, z.ZodObject<{
    url: z.ZodString;
    http_method: z.ZodOptional<z.ZodEnum<{
        GET: "GET";
        POST: "POST";
    }>>;
    body: z.ZodOptional<z.ZodString>;
    headers: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        value: z.ZodString;
    }, z.core.$strict>>>;
    smart_link_scope: z.ZodEnum<{
        global: "global";
        campaign_specific: "campaign_specific";
    }>;
    conversion_types: z.ZodArray<z.ZodEnum<{
        new_subscriber: "new_subscriber";
        new_transaction: "new_transaction";
        message_received: "message_received";
        fan_sent_1_message: "fan_sent_1_message";
        fan_sent_3_messages: "fan_sent_3_messages";
    }>>;
    smart_link_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    action: z.ZodLiteral<"postback_update">;
    postbackId: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"postback_delete">;
    postbackId: z.ZodNumber;
}, z.core.$strict>], "action">;
export type OfapiMarketingAction = z.infer<typeof ofapiMarketingActionSchema>;
export declare const ofapiMarketingResourceSchema: z.ZodObject<{
    pageId: z.ZodNullable<z.ZodNumber>;
    nativeAccountRef: z.ZodNullable<z.ZodString>;
    kind: z.ZodEnum<{
        smart_link: "smart_link";
        tracking: "tracking";
        trial: "trial";
        pixel: "pixel";
        postback: "postback";
    }>;
    id: z.ZodString;
    shared: z.ZodBoolean;
    parentId: z.ZodNullable<z.ZodString>;
    name: z.ZodNullable<z.ZodString>;
    observedAt: z.ZodString;
    linkType: z.ZodNullable<z.ZodString>;
    platform: z.ZodNullable<z.ZodString>;
    platformPixelId: z.ZodNullable<z.ZodString>;
    publicUrl: z.ZodNullable<z.ZodString>;
    httpMethod: z.ZodNullable<z.ZodEnum<{
        GET: "GET";
        POST: "POST";
    }>>;
    status: z.ZodNullable<z.ZodString>;
    destination: z.ZodNullable<z.ZodString>;
    clicks: z.ZodNullable<z.ZodNumber>;
    conversions: z.ZodNullable<z.ZodNumber>;
    subscribers: z.ZodNullable<z.ZodNumber>;
    spenders: z.ZodNullable<z.ZodNumber>;
    revenueMills: z.ZodNullable<z.ZodString>;
    revenueBasis: z.ZodEnum<{
        net: "net";
        gross: "gross";
        unspecified: "unspecified";
    }>;
    cost: z.ZodNullable<z.ZodObject<{
        inputMode: z.ZodNullable<z.ZodString>;
        inputValue: z.ZodNullable<z.ZodString>;
        currency: z.ZodNullable<z.ZodString>;
        unit: z.ZodString;
        source: z.ZodLiteral<"provider_campaign_configuration">;
    }, z.core.$strip>>;
    tags: z.ZodArray<z.ZodString>;
    eventNames: z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodString>>;
    conversionTypes: z.ZodArray<z.ZodString>;
    scope: z.ZodNullable<z.ZodString>;
    linkIds: z.ZodArray<z.ZodString>;
    templateVariables: z.ZodArray<z.ZodString>;
    headerNames: z.ZodArray<z.ZodString>;
    hasBodyTemplate: z.ZodBoolean;
}, z.core.$strip>;
export type OfapiMarketingResource = z.infer<typeof ofapiMarketingResourceSchema>;
export declare const ofapiMarketingPreviewValueSchema: z.ZodObject<{
    field: z.ZodEnum<{
        name: "name";
        tags: "tags";
        platform: "platform";
        link_type: "link_type";
        free_trial_days: "free_trial_days";
        pixel_id: "pixel_id";
        event_type: "event_type";
        event_click: "event_click";
        event_first_transaction: "event_first_transaction";
        event_new_transaction: "event_new_transaction";
        event_message_received_from_fan: "event_message_received_from_fan";
        event_fan_sent_1_message: "event_fan_sent_1_message";
        event_fan_sent_3_messages: "event_fan_sent_3_messages";
        event_new_subscriber: "event_new_subscriber";
        label: "label";
        http_method: "http_method";
        body_change: "body_change";
        headers_change: "headers_change";
        pixel_token_change: "pixel_token_change";
        test_event_code_change: "test_event_code_change";
        event_source_url_change: "event_source_url_change";
    }>;
    value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodArray<z.ZodString>, z.ZodNull]>;
}, z.core.$strip>;
export type OfapiMarketingPreviewValue = z.infer<typeof ofapiMarketingPreviewValueSchema>;
export declare const ofapiMarketingIntentSchema: z.ZodObject<{
    id: z.ZodString;
    action: z.ZodString;
    state: z.ZodString;
    errorCode: z.ZodNullable<z.ZodString>;
    remoteId: z.ZodNullable<z.ZodString>;
    accountingState: z.ZodEnum<{
        pending: "pending";
        complete: "complete";
    }>;
    projectionState: z.ZodEnum<{
        pending: "pending";
        complete: "complete";
    }>;
    createdAt: z.ZodString;
    responseObservationId: z.ZodNullable<z.ZodNumber>;
    preview: z.ZodObject<{
        pageId: z.ZodNullable<z.ZodNumber>;
        pageLabel: z.ZodNullable<z.ZodString>;
        accountId: z.ZodNullable<z.ZodString>;
        values: z.ZodArray<z.ZodObject<{
            field: z.ZodEnum<{
                name: "name";
                tags: "tags";
                platform: "platform";
                link_type: "link_type";
                free_trial_days: "free_trial_days";
                pixel_id: "pixel_id";
                event_type: "event_type";
                event_click: "event_click";
                event_first_transaction: "event_first_transaction";
                event_new_transaction: "event_new_transaction";
                event_message_received_from_fan: "event_message_received_from_fan";
                event_fan_sent_1_message: "event_fan_sent_1_message";
                event_fan_sent_3_messages: "event_fan_sent_3_messages";
                event_new_subscriber: "event_new_subscriber";
                label: "label";
                http_method: "http_method";
                body_change: "body_change";
                headers_change: "headers_change";
                pixel_token_change: "pixel_token_change";
                test_event_code_change: "test_event_code_change";
                event_source_url_change: "event_source_url_change";
            }>;
            value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodArray<z.ZodString>, z.ZodNull]>;
        }, z.core.$strip>>;
        destination: z.ZodNullable<z.ZodString>;
        templateVariables: z.ZodArray<z.ZodString>;
        headerNames: z.ZodArray<z.ZodString>;
        targetId: z.ZodNullable<z.ZodString>;
        changedFields: z.ZodArray<z.ZodString>;
        conversionTypes: z.ZodArray<z.ZodString>;
        scope: z.ZodNullable<z.ZodString>;
        affectedLinkIds: z.ZodArray<z.ZodString>;
        affectedLinksComplete: z.ZodBoolean;
        effect: z.ZodString;
        externalTest: z.ZodBoolean;
        estimatedCredits: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ofapiMarketingMetricSchema: z.ZodObject<{
    nativeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    period: z.ZodOptional<z.ZodEnum<{
        summary: "summary";
        daily: "daily";
        monthly: "monthly";
        row: "row";
        cohort: "cohort";
    }>>;
    timestamp: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    occurredAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fanId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    conversionType: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    country: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isBot: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    isDuplicate: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    organic: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    previouslySubscribed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    subscribedUsingPromo: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    currentSubscriptionFromSmartLink: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    clicks: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    subscribers: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    spenders: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    messagesSentByFan: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    revenueMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    tipsNetMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    amountGrossMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    amountNetMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    revenueBasis: z.ZodOptional<z.ZodEnum<{
        net: "net";
        gross: "gross";
        unspecified: "unspecified";
    }>>;
    metricPath: z.ZodOptional<z.ZodString>;
    providerValue: z.ZodOptional<z.ZodString>;
    attributionOnly: z.ZodLiteral<true>;
}, z.core.$strip>;
export type OfapiMarketingMetric = z.infer<typeof ofapiMarketingMetricSchema>;
export declare const ofapiMarketingAnalyticsSchema: z.ZodObject<{
    pageId: z.ZodNumber;
    operation: z.ZodString;
    linkId: z.ZodString;
    observedAt: z.ZodString;
    window: z.ZodObject<{
        from: z.ZodNullable<z.ZodString>;
        to: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    requestedRevenueBasis: z.ZodNullable<z.ZodEnum<{
        net: "net";
        gross: "gross";
    }>>;
    coverage: z.ZodObject<{
        state: z.ZodEnum<{
            unknown: "unknown";
            complete: "complete";
            partial: "partial";
        }>;
        reason: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    rows: z.ZodArray<z.ZodObject<{
        nativeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        period: z.ZodOptional<z.ZodEnum<{
            summary: "summary";
            daily: "daily";
            monthly: "monthly";
            row: "row";
            cohort: "cohort";
        }>>;
        timestamp: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        occurredAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fanId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        conversionType: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        country: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        isBot: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        isDuplicate: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        organic: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        previouslySubscribed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        subscribedUsingPromo: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        currentSubscriptionFromSmartLink: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        clicks: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        subscribers: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        spenders: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        messagesSentByFan: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        revenueMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        tipsNetMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        amountGrossMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        amountNetMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        revenueBasis: z.ZodOptional<z.ZodEnum<{
            net: "net";
            gross: "gross";
            unspecified: "unspecified";
        }>>;
        metricPath: z.ZodOptional<z.ZodString>;
        providerValue: z.ZodOptional<z.ZodString>;
        attributionOnly: z.ZodLiteral<true>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ofapiMarketingDashboardSchema: z.ZodObject<{
    resources: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNullable<z.ZodNumber>;
        nativeAccountRef: z.ZodNullable<z.ZodString>;
        kind: z.ZodEnum<{
            smart_link: "smart_link";
            tracking: "tracking";
            trial: "trial";
            pixel: "pixel";
            postback: "postback";
        }>;
        id: z.ZodString;
        shared: z.ZodBoolean;
        parentId: z.ZodNullable<z.ZodString>;
        name: z.ZodNullable<z.ZodString>;
        observedAt: z.ZodString;
        linkType: z.ZodNullable<z.ZodString>;
        platform: z.ZodNullable<z.ZodString>;
        platformPixelId: z.ZodNullable<z.ZodString>;
        publicUrl: z.ZodNullable<z.ZodString>;
        httpMethod: z.ZodNullable<z.ZodEnum<{
            GET: "GET";
            POST: "POST";
        }>>;
        status: z.ZodNullable<z.ZodString>;
        destination: z.ZodNullable<z.ZodString>;
        clicks: z.ZodNullable<z.ZodNumber>;
        conversions: z.ZodNullable<z.ZodNumber>;
        subscribers: z.ZodNullable<z.ZodNumber>;
        spenders: z.ZodNullable<z.ZodNumber>;
        revenueMills: z.ZodNullable<z.ZodString>;
        revenueBasis: z.ZodEnum<{
            net: "net";
            gross: "gross";
            unspecified: "unspecified";
        }>;
        cost: z.ZodNullable<z.ZodObject<{
            inputMode: z.ZodNullable<z.ZodString>;
            inputValue: z.ZodNullable<z.ZodString>;
            currency: z.ZodNullable<z.ZodString>;
            unit: z.ZodString;
            source: z.ZodLiteral<"provider_campaign_configuration">;
        }, z.core.$strip>>;
        tags: z.ZodArray<z.ZodString>;
        eventNames: z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodString>>;
        conversionTypes: z.ZodArray<z.ZodString>;
        scope: z.ZodNullable<z.ZodString>;
        linkIds: z.ZodArray<z.ZodString>;
        templateVariables: z.ZodArray<z.ZodString>;
        headerNames: z.ZodArray<z.ZodString>;
        hasBodyTemplate: z.ZodBoolean;
    }, z.core.$strip>>;
    analytics: z.ZodArray<z.ZodObject<{
        pageId: z.ZodNumber;
        operation: z.ZodString;
        linkId: z.ZodString;
        observedAt: z.ZodString;
        window: z.ZodObject<{
            from: z.ZodNullable<z.ZodString>;
            to: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        requestedRevenueBasis: z.ZodNullable<z.ZodEnum<{
            net: "net";
            gross: "gross";
        }>>;
        coverage: z.ZodObject<{
            state: z.ZodEnum<{
                unknown: "unknown";
                complete: "complete";
                partial: "partial";
            }>;
            reason: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        rows: z.ZodArray<z.ZodObject<{
            nativeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            period: z.ZodOptional<z.ZodEnum<{
                summary: "summary";
                daily: "daily";
                monthly: "monthly";
                row: "row";
                cohort: "cohort";
            }>>;
            timestamp: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            occurredAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            fanId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            conversionType: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            country: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            isBot: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            isDuplicate: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            organic: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            previouslySubscribed: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            subscribedUsingPromo: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            currentSubscriptionFromSmartLink: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            clicks: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            subscribers: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            spenders: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            messagesSentByFan: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            revenueMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            tipsNetMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            amountGrossMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            amountNetMills: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            revenueBasis: z.ZodOptional<z.ZodEnum<{
                net: "net";
                gross: "gross";
                unspecified: "unspecified";
            }>>;
            metricPath: z.ZodOptional<z.ZodString>;
            providerValue: z.ZodOptional<z.ZodString>;
            attributionOnly: z.ZodLiteral<true>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    intents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        action: z.ZodString;
        state: z.ZodString;
        errorCode: z.ZodNullable<z.ZodString>;
        remoteId: z.ZodNullable<z.ZodString>;
        accountingState: z.ZodEnum<{
            pending: "pending";
            complete: "complete";
        }>;
        projectionState: z.ZodEnum<{
            pending: "pending";
            complete: "complete";
        }>;
        createdAt: z.ZodString;
        responseObservationId: z.ZodNullable<z.ZodNumber>;
        preview: z.ZodObject<{
            pageId: z.ZodNullable<z.ZodNumber>;
            pageLabel: z.ZodNullable<z.ZodString>;
            accountId: z.ZodNullable<z.ZodString>;
            values: z.ZodArray<z.ZodObject<{
                field: z.ZodEnum<{
                    name: "name";
                    tags: "tags";
                    platform: "platform";
                    link_type: "link_type";
                    free_trial_days: "free_trial_days";
                    pixel_id: "pixel_id";
                    event_type: "event_type";
                    event_click: "event_click";
                    event_first_transaction: "event_first_transaction";
                    event_new_transaction: "event_new_transaction";
                    event_message_received_from_fan: "event_message_received_from_fan";
                    event_fan_sent_1_message: "event_fan_sent_1_message";
                    event_fan_sent_3_messages: "event_fan_sent_3_messages";
                    event_new_subscriber: "event_new_subscriber";
                    label: "label";
                    http_method: "http_method";
                    body_change: "body_change";
                    headers_change: "headers_change";
                    pixel_token_change: "pixel_token_change";
                    test_event_code_change: "test_event_code_change";
                    event_source_url_change: "event_source_url_change";
                }>;
                value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodArray<z.ZodString>, z.ZodNull]>;
            }, z.core.$strip>>;
            destination: z.ZodNullable<z.ZodString>;
            templateVariables: z.ZodArray<z.ZodString>;
            headerNames: z.ZodArray<z.ZodString>;
            targetId: z.ZodNullable<z.ZodString>;
            changedFields: z.ZodArray<z.ZodString>;
            conversionTypes: z.ZodArray<z.ZodString>;
            scope: z.ZodNullable<z.ZodString>;
            affectedLinkIds: z.ZodArray<z.ZodString>;
            affectedLinksComplete: z.ZodBoolean;
            effect: z.ZodString;
            externalTest: z.ZodBoolean;
            estimatedCredits: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    attributionWindowHours: z.ZodLiteral<6>;
    revenueIsAdditive: z.ZodLiteral<false>;
}, z.core.$strip>;
