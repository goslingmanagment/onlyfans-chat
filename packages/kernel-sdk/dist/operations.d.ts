export declare const kernelOperations: {
    readonly adminAiPersonaArchive: {
        readonly method: "DELETE";
        readonly path: "/api/v1/admin/ai/personas/:key";
    };
    readonly adminAiPersonaCreate: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ai/personas";
    };
    readonly adminAiPersonaUpdate: {
        readonly method: "PUT";
        readonly path: "/api/v1/admin/ai/personas/:key";
    };
    readonly adminAiPersonasList: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ai/personas";
    };
    readonly adminAssignPage: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/users/:username/pages";
    };
    readonly adminChatterUsage: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/usage/chatters";
    };
    readonly adminConfig: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/config";
    };
    readonly adminConfigClear: {
        readonly method: "DELETE";
        readonly path: "/api/v1/admin/config/:key";
    };
    readonly adminConfigStaged: {
        readonly method: "PATCH";
        readonly path: "/api/v1/admin/config/staged";
    };
    readonly adminConfigUpdate: {
        readonly method: "PATCH";
        readonly path: "/api/v1/admin/config";
    };
    readonly adminConnections: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/connections";
    };
    readonly adminCreateModel: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/models";
    };
    readonly adminCreatePage: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/pages";
    };
    readonly adminCreateUser: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/users";
    };
    readonly adminDbStats: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/db/stats";
    };
    readonly adminDeactivateUser: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/users/:username/deactivate";
    };
    readonly adminDeleteModel: {
        readonly method: "DELETE";
        readonly path: "/api/v1/admin/models/:modelSlug";
    };
    readonly adminDeletePage: {
        readonly method: "DELETE";
        readonly path: "/api/v1/admin/pages/:pageLabel";
    };
    readonly adminDeviceTokenAdoption: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/device-token-adoption";
    };
    readonly adminFollowersReconcileOverrideApply: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/sync/followers-reconcile/blast-radius/apply";
    };
    readonly adminFollowersReconcileOverridePreview: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/sync/followers-reconcile/blast-radius/preview";
    };
    readonly adminFollowersReconcileReset: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/sync/followers-reconcile/reset";
    };
    readonly adminGrantModel: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/users/:username/models";
    };
    readonly adminIncidents: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/incidents";
    };
    readonly adminIssueApiKey: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/users/:username/api-keys";
    };
    readonly adminIssueDeviceToken: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/users/:username/device-tokens";
    };
    readonly adminListApiKeys: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/users/:username/api-keys";
    };
    readonly adminListDeviceTokens: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/users/:username/device-tokens";
    };
    readonly adminListUserGrants: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/users/:username/grants";
    };
    readonly adminListUsers: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/users";
    };
    readonly adminLogs: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/logs";
    };
    readonly adminModels: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/models";
    };
    readonly adminOfapiBindingRefresh: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/webhook/bindings";
    };
    readonly adminOfapiCaptureAttemptResolve: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/capture/attempts/:attemptId/resolve";
    };
    readonly adminOfapiCaptureControl: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/capture/controls";
    };
    readonly adminOfapiCaptureJobCancel: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/capture/jobs/:jobId/cancel";
    };
    readonly adminOfapiCaptureJobReplay: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/capture/jobs/:jobId/replay";
    };
    readonly adminOfapiCaptureJobsSeed: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/capture-jobs/seed";
    };
    readonly adminOfapiCaptureOperatorStatus: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/capture/operator";
    };
    readonly adminOfapiCoverageRevoke: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/capture/coverage/:pageId/:chatId/revoke";
    };
    readonly adminOfapiCredentialPreflight: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/webhook/preflight";
    };
    readonly adminOfapiCreditsDaily: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/credits/daily";
    };
    readonly adminOfapiCreditsLedger: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/credits/ledger";
    };
    readonly adminOfapiCreditsLedgerCsv: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/credits/ledger.csv";
    };
    readonly adminOfapiCreditsSummary: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/credits/summary";
    };
    readonly adminOfapiDmColdArchiveStatus: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/dm-archive/status";
    };
    readonly adminOfapiExportArtifactCapture: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/export-quotes/:jobId/capture-artifact";
    };
    readonly adminOfapiExportCreateReconcile: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/export-quotes/:jobId/reconcile-create";
    };
    readonly adminOfapiExportPilotApprove: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/export-quotes/:jobId/approve-pilot";
    };
    readonly adminOfapiExportQuoteCancel: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/export-quotes/:jobId/cancel";
    };
    readonly adminOfapiExportQuoteStatus: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/export-quotes/:jobId";
    };
    readonly adminOfapiExportQuotesCreate: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/export-quotes";
    };
    readonly adminOfapiSpendComparison: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/spend/comparison";
    };
    readonly adminOfapiWebhookCollectionPolicy: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/webhook/collection-policy";
    };
    readonly adminOfapiWebhookCollectionPolicyApply: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/webhook/collection-policy/apply";
    };
    readonly adminOfapiWebhookCollectionPolicySave: {
        readonly method: "PUT";
        readonly path: "/api/v1/admin/ofapi/webhook/collection-policy";
    };
    readonly adminOfapiWebhookDeliveries: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/webhook/deliveries";
    };
    readonly adminOfapiWebhookDeliverySync: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/webhook/deliveries/sync";
    };
    readonly adminOfapiWebhookEventCatalog: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/webhook/event-catalog";
    };
    readonly adminOfapiWebhookEventCatalogRefresh: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/webhook/event-catalog/refresh";
    };
    readonly adminOfapiWebhookReconcile: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/webhook/reconcile";
    };
    readonly adminOfapiWebhookRedeliver: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/webhook/deliveries/redeliver";
    };
    readonly adminOfapiWebhookRegister: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/webhook";
    };
    readonly adminOfapiWebhookReplay: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/webhook/replay";
    };
    readonly adminOfapiWebhookStatus: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/webhook";
    };
    readonly adminPages: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/pages";
    };
    readonly adminQueueJobs: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/queue/jobs";
    };
    readonly adminReactivateUser: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/users/:username/reactivate";
    };
    readonly adminRevokeApiKeys: {
        readonly method: "DELETE";
        readonly path: "/api/v1/admin/users/:username/api-keys";
    };
    readonly adminRevokeDeviceTokens: {
        readonly method: "DELETE";
        readonly path: "/api/v1/admin/users/:username/device-tokens";
    };
    readonly adminRevokeModel: {
        readonly method: "DELETE";
        readonly path: "/api/v1/admin/users/:username/models/:modelSlug";
    };
    readonly adminSetDeviceTokenHarvestCapability: {
        readonly method: "PATCH";
        readonly path: "/api/v1/admin/users/:username/device-tokens/:tokenId/harvest-capability";
    };
    readonly adminSetPassword: {
        readonly method: "PATCH";
        readonly path: "/api/v1/admin/users/:username/password";
    };
    readonly adminSyncBlockPause: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/sync/blocks/pause";
    };
    readonly adminSyncBlockReset: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/sync/blocks/reset";
    };
    readonly adminSyncBlockResume: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/sync/blocks/resume";
    };
    readonly adminSyncBlockTrigger: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/sync/blocks/trigger";
    };
    readonly adminSyncRunDetail: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/sync/runs/:runId";
    };
    readonly adminSyncRuns: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/sync/runs";
    };
    readonly adminSyncTrigger: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/sync/trigger";
    };
    readonly adminSyncTriggerAll: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/sync/trigger-all";
    };
    readonly adminTestProxy: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/proxy/test";
    };
    readonly adminUnassignPage: {
        readonly method: "DELETE";
        readonly path: "/api/v1/admin/users/:username/pages/:pageLabel";
    };
    readonly adminUpdateCredentials: {
        readonly method: "PATCH";
        readonly path: "/api/v1/admin/pages/:pageLabel/credentials";
    };
    readonly adminUpdateModel: {
        readonly method: "PATCH";
        readonly path: "/api/v1/admin/models/:modelSlug";
    };
    readonly adminUpdatePage: {
        readonly method: "PATCH";
        readonly path: "/api/v1/admin/pages/:pageLabel";
    };
    readonly adminVerifyCredentials: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/credentials/verify";
    };
    readonly adminVerifyPage: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/pages/:pageLabel/verify";
    };
    readonly agentCapabilities: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/capabilities";
    };
    readonly agentCoverage: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/coverage";
    };
    readonly agentDatasetQuery: {
        readonly method: "POST";
        readonly path: "/api/v1/agent/pages/:pageLabel/datasets/:dataset/query";
    };
    readonly agentHydrationRequestCreate: {
        readonly method: "POST";
        readonly path: "/api/v1/agent/pages/:pageLabel/threads/:conversationRef/hydration-requests";
    };
    readonly agentHydrationRequestDecide: {
        readonly method: "POST";
        readonly path: "/api/v1/agent/hydration-requests/:requestRef/decision";
    };
    readonly agentHydrationRequestGet: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/hydration-requests/:requestRef";
    };
    readonly agentHydrationRequestList: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/hydration-requests";
    };
    readonly agentKeyCreate: {
        readonly method: "POST";
        readonly path: "/api/v1/agent/keys";
    };
    readonly agentKeyList: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/keys";
    };
    readonly agentKeyRevoke: {
        readonly method: "POST";
        readonly path: "/api/v1/agent/keys/:id/revoke";
    };
    readonly agentObservationPayload: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/observations/:observationRef/payload";
    };
    readonly agentObservations: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/observations";
    };
    readonly agentPerson: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/people/:platform/:platformUserId";
    };
    readonly agentPersonTimeline: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/people/:platform/:platformUserId/timeline";
    };
    readonly agentResolve: {
        readonly method: "POST";
        readonly path: "/api/v1/agent/resolve";
    };
    readonly agentSearchMessages: {
        readonly method: "POST";
        readonly path: "/api/v1/agent/search/messages";
    };
    readonly agentThreadMessages: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/pages/:pageLabel/threads/:conversationRef/messages";
    };
    readonly agentThreads: {
        readonly method: "GET";
        readonly path: "/api/v1/agent/threads";
    };
    readonly aiFeatureStream: {
        readonly method: "POST";
        readonly path: "/api/v1/ai/features/:feature";
    };
    readonly aiGatewayStream: {
        readonly method: "POST";
        readonly path: "/api/v1/ai/gateway/stream";
    };
    readonly aiPersonaArchive: {
        readonly method: "DELETE";
        readonly path: "/api/v1/ai/personas/:key";
    };
    readonly aiPersonaCatalog: {
        readonly method: "GET";
        readonly path: "/api/v1/ai/persona-catalog";
    };
    readonly aiPersonaUpsert: {
        readonly method: "PUT";
        readonly path: "/api/v1/ai/personas/:key";
    };
    readonly aiPersonasList: {
        readonly method: "GET";
        readonly path: "/api/v1/ai/personas";
    };
    readonly aiRecapStatus: {
        readonly method: "GET";
        readonly path: "/api/v1/ai/recap-status";
    };
    readonly aiRestrictedGenerationDetail: {
        readonly method: "GET";
        readonly path: "/api/v1/ai/restricted/generations/:generationRef";
    };
    readonly aiRestrictedGenerations: {
        readonly method: "GET";
        readonly path: "/api/v1/ai/restricted/generations";
    };
    readonly aiUsageBatch: {
        readonly method: "POST";
        readonly path: "/api/v1/ai-usage/batch";
    };
    readonly archiveConversationMessages: {
        readonly method: "GET";
        readonly path: "/api/v1/archive/conversations/:ref/messages";
    };
    readonly archiveSearch: {
        readonly method: "GET";
        readonly path: "/api/v1/archive/search";
    };
    readonly authActivateDeviceToken: {
        readonly method: "POST";
        readonly path: "/api/v1/auth/device-tokens/activate";
    };
    readonly authChangePassword: {
        readonly method: "POST";
        readonly path: "/api/v1/auth/change-password";
    };
    readonly authIssueDeviceToken: {
        readonly method: "POST";
        readonly path: "/api/v1/auth/device-tokens";
    };
    readonly authReserveDeviceToken: {
        readonly method: "POST";
        readonly path: "/api/v1/auth/device-tokens/reservations";
    };
    readonly authRevokeCurrentDeviceToken: {
        readonly method: "DELETE";
        readonly path: "/api/v1/auth/device-tokens/current";
    };
    readonly cancelOfapiCommand: {
        readonly method: "POST";
        readonly path: "/api/v1/ofapi/commands/:commandId/cancel";
    };
    readonly contentComments: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/content/comments";
    };
    readonly contentMedia: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/content/media";
    };
    readonly createFanNote: {
        readonly method: "POST";
        readonly path: "/api/v1/pages/:pageLabel/fans/:platformUserId/notes";
    };
    readonly createOfapiCommand: {
        readonly method: "POST";
        readonly path: "/api/v1/ofapi/commands";
    };
    readonly crossPageFanDetail: {
        readonly method: "GET";
        readonly path: "/api/v1/fans/:platform/:platformUserId";
    };
    readonly crossPageFanTransactions: {
        readonly method: "GET";
        readonly path: "/api/v1/fans/:platform/:platformUserId/transactions";
    };
    readonly crossPageTransactions: {
        readonly method: "GET";
        readonly path: "/api/v1/transactions";
    };
    readonly eventsSnapshot: {
        readonly method: "GET";
        readonly path: "/api/v1/events/snapshot";
    };
    readonly eventsStream: {
        readonly method: "GET";
        readonly path: "/api/v1/events/stream";
    };
    readonly eventsV2Snapshot: {
        readonly method: "GET";
        readonly path: "/api/v1/events/v2/snapshot";
    };
    readonly eventsV2Stream: {
        readonly method: "GET";
        readonly path: "/api/v1/events/v2/stream";
    };
    readonly fansSearch: {
        readonly method: "GET";
        readonly path: "/api/v2/fans/search";
    };
    readonly getOfapiCommand: {
        readonly method: "GET";
        readonly path: "/api/v1/ofapi/commands/:commandId";
    };
    readonly health: {
        readonly method: "GET";
        readonly path: "/api/v1/health";
    };
    readonly healthSync: {
        readonly method: "GET";
        readonly path: "/api/v1/health/sync";
    };
    readonly ingestObservations: {
        readonly method: "POST";
        readonly path: "/api/v1/ingest/observations";
    };
    readonly login: {
        readonly method: "POST";
        readonly path: "/api/v1/auth/login";
    };
    readonly logout: {
        readonly method: "POST";
        readonly path: "/api/v1/auth/logout";
    };
    readonly me: {
        readonly method: "GET";
        readonly path: "/api/v1/auth/me";
    };
    readonly modelRevenue: {
        readonly method: "GET";
        readonly path: "/api/v1/models/:modelSlug/revenue";
    };
    readonly modelRevenueDaily: {
        readonly method: "GET";
        readonly path: "/api/v1/models/:modelSlug/revenue/daily";
    };
    readonly models: {
        readonly method: "GET";
        readonly path: "/api/v1/models";
    };
    readonly moneyPayouts: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/money/payouts";
    };
    readonly moneyRevenueMix: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/money/revenue-mix";
    };
    readonly notificationsDiscoverChats: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/notifications/discover-chats";
    };
    readonly notificationsIncidents: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/notifications/incidents";
    };
    readonly notificationsReportHistory: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/notifications/reports/history";
    };
    readonly notificationsReportPreview: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/notifications/reports/preview";
    };
    readonly notificationsReportSend: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/notifications/reports/send";
    };
    readonly notificationsResolveIncident: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/notifications/incidents/:incidentId/resolve";
    };
    readonly notificationsSettings: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/notifications/settings";
    };
    readonly notificationsSettingsUpdate: {
        readonly method: "PATCH";
        readonly path: "/api/v1/admin/notifications/settings";
    };
    readonly notificationsTestMessage: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/notifications/test";
    };
    readonly ofapiActionCancel: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/actions/:id/cancel";
    };
    readonly ofapiActionDispatch: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/actions/:id/dispatch";
    };
    readonly ofapiActionGet: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/actions/:id";
    };
    readonly ofapiActionList: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/actions";
    };
    readonly ofapiActionPrepare: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/actions";
    };
    readonly ofapiActionRepair: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/actions/:id/repair";
    };
    readonly ofapiBannedWordsAdminGet: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/banned-words";
    };
    readonly ofapiBannedWordsGet: {
        readonly method: "GET";
        readonly path: "/api/v1/ofapi/banned-words";
    };
    readonly ofapiBannedWordsPreview: {
        readonly method: "POST";
        readonly path: "/api/v1/ofapi/banned-words/preview";
    };
    readonly ofapiBannedWordsRefresh: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/banned-words/refresh";
    };
    readonly ofapiCollectionApply: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/collection/apply";
    };
    readonly ofapiCollectionGet: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/collection";
    };
    readonly ofapiCollectionJobCreate: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/collection/jobs";
    };
    readonly ofapiCollectionJobResume: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/collection/jobs/:id/resume";
    };
    readonly ofapiCollectionPreview: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/collection/preview";
    };
    readonly ofapiContentEventsGet: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/content/events";
    };
    readonly ofapiCreditsChatterSummary: {
        readonly method: "GET";
        readonly path: "/api/v1/ofapi/credits/summary";
    };
    readonly ofapiExportInventoryGet: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/export-inventory";
    };
    readonly ofapiExportInventoryRefresh: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/export-inventory/refresh";
    };
    readonly ofapiKeyScopeApply: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/key-scope";
    };
    readonly ofapiKeyScopeGet: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/key-scope";
    };
    readonly ofapiMarketingDispatch: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/marketing/intents/:id/dispatch";
    };
    readonly ofapiMarketingGet: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/marketing";
    };
    readonly ofapiMarketingPostbacksRefresh: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/marketing/postbacks/refresh";
    };
    readonly ofapiMarketingPrepare: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/marketing/intents";
    };
    readonly ofapiMarketingRebuild: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/marketing/rebuild";
    };
    readonly ofapiMediaGet: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/media";
    };
    readonly ofapiMediaHandoff: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/media/handoff";
    };
    readonly ofapiMediaSourceCreate: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/media/sources";
    };
    readonly ofapiMediaUploadCreate: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/media/uploads";
    };
    readonly ofapiMediaUploadResume: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/media/uploads/:jobId/resume";
    };
    readonly ofapiProfileVisitorsGet: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/profile-visitors";
    };
    readonly ofapiReadCollectionsGet: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/collection/results";
    };
    readonly ofapiReadGateway: {
        readonly method: "GET";
        readonly path: "/api/v1/ofapi/read/*";
    };
    readonly ofapiTypedExportApprove: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/exports/:jobId/approve";
    };
    readonly ofapiTypedExportArtifact: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/exports/:jobId/artifact";
    };
    readonly ofapiTypedExportControl: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/exports/:jobId/control";
    };
    readonly ofapiTypedExportCreate: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/exports";
    };
    readonly ofapiTypedExportList: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/exports";
    };
    readonly ofapiTypedExportResume: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/exports/:jobId/resume";
    };
    readonly ofapiTypedExportRows: {
        readonly method: "GET";
        readonly path: "/api/v1/admin/ofapi/exports/:jobId/rows";
    };
    readonly ofapiVendorUsageRefresh: {
        readonly method: "POST";
        readonly path: "/api/v1/admin/ofapi/vendor-usage";
    };
    readonly ofapiWebhookReceive: {
        readonly method: "POST";
        readonly path: "/api/v1/ofapi/webhook";
    };
    readonly openApiJson: {
        readonly method: "GET";
        readonly path: "/api/v1/openapi.json";
    };
    readonly opsMetrics: {
        readonly method: "GET";
        readonly path: "/api/v1/ops/metrics";
    };
    readonly overview: {
        readonly method: "GET";
        readonly path: "/api/v1/overview";
    };
    readonly overviewGrowth: {
        readonly method: "GET";
        readonly path: "/api/v1/overview/growth";
    };
    readonly overviewRevenue: {
        readonly method: "GET";
        readonly path: "/api/v1/overview/revenue";
    };
    readonly overviewRevenueByModel: {
        readonly method: "GET";
        readonly path: "/api/v1/overview/revenue/by-model";
    };
    readonly overviewRevenueDaily: {
        readonly method: "GET";
        readonly path: "/api/v1/overview/revenue/daily";
    };
    readonly pageConversationMessages: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/conversations/:conversationId/messages";
    };
    readonly pageConversationPreview: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/conversations/:platformConversationId/preview";
    };
    readonly pageConversationProfile: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/conversations/:conversationId/profile";
    };
    readonly pageDeletedFans: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/deleted-fans";
    };
    readonly pageFanDetail: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/fans/:platformUserId";
    };
    readonly pageFanProfile: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/fans/:platformUserId/profile";
    };
    readonly pageFanProfileVersion: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/fans/:platformUserId/profile/versions/:version";
    };
    readonly pageFanProfileVersions: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/fans/:platformUserId/profile/versions";
    };
    readonly pageFanTransactions: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/fans/:platformUserId/transactions";
    };
    readonly pageFans: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/fans";
    };
    readonly pageFollowers: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/followers";
    };
    readonly pageFollowersDaily: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/followers/daily";
    };
    readonly pageMessagesBlock: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/sync/blocks/messages";
    };
    readonly pageRevenue: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/revenue";
    };
    readonly pageRevenueDaily: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/revenue/daily";
    };
    readonly pageSpenderAutoListDetail: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/spender-autolists/:bucketKey";
    };
    readonly pageSpenderAutoLists: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/spender-autolists";
    };
    readonly pageSubscribers: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/subscribers";
    };
    readonly pageSubscribersDaily: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/subscribers/daily";
    };
    readonly pageSyncBlocks: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/sync/blocks";
    };
    readonly pageTopSpenders: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/top-spenders";
    };
    readonly pageTransactions: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/transactions";
    };
    readonly pages: {
        readonly method: "GET";
        readonly path: "/api/v1/pages";
    };
    readonly setFanFlags: {
        readonly method: "PATCH";
        readonly path: "/api/v1/fans/:platform/:platformUserId/flags";
    };
    readonly spenderBatch: {
        readonly method: "POST";
        readonly path: "/api/v2/spenders:batch";
    };
    readonly spenderDetail: {
        readonly method: "GET";
        readonly path: "/api/v2/spenders/:platform/:platformUserId";
    };
    readonly spenderSeries: {
        readonly method: "GET";
        readonly path: "/api/v2/spenders/:platform/:platformUserId/series";
    };
    readonly spenders: {
        readonly method: "GET";
        readonly path: "/api/v2/spenders";
    };
    readonly statsCoverage: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/stats/coverage";
    };
    readonly statsMedia: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/stats/media";
    };
    readonly statsTags: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/stats/tags";
    };
    readonly statsTraffic: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/stats/traffic";
    };
    readonly syncOverview: {
        readonly method: "GET";
        readonly path: "/api/v1/sync/overview";
    };
    readonly syncRequests: {
        readonly method: "GET";
        readonly path: "/api/v1/sync/requests";
    };
    readonly syncStatus: {
        readonly method: "GET";
        readonly path: "/api/v1/sync/status";
    };
    readonly upsertFanProfile: {
        readonly method: "PUT";
        readonly path: "/api/v1/pages/:pageLabel/fans/:platformUserId/profile";
    };
    readonly voiceNoteAudio: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/voice-notes/:id/audio";
    };
    readonly voiceNoteCreate: {
        readonly method: "POST";
        readonly path: "/api/v1/pages/:pageLabel/voice-notes";
    };
    readonly voiceNoteStatus: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/voice-notes/:id";
    };
    readonly workboardV2: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2";
    };
    readonly workboardV2Ai: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/ai";
    };
    readonly workboardV2AiClassify: {
        readonly method: "POST";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/ai/classify";
    };
    readonly workboardV2AiRuns: {
        readonly method: "GET";
        readonly path: "/api/v1/workboard/ai/runs";
    };
    readonly workboardV2AiSettings: {
        readonly method: "PUT";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/ai/settings";
    };
    readonly workboardV2Claim: {
        readonly method: "POST";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/claim";
    };
    readonly workboardV2Contact: {
        readonly method: "POST";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/contact";
    };
    readonly workboardV2Lists: {
        readonly method: "GET";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/lists";
    };
    readonly workboardV2Recompute: {
        readonly method: "POST";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/recompute";
    };
    readonly workboardV2Snooze: {
        readonly method: "POST";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/snooze";
    };
    readonly workboardV2Unclaim: {
        readonly method: "DELETE";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/claim/:fanId";
    };
    readonly workboardV2UndoContact: {
        readonly method: "DELETE";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/contact/:fanId";
    };
    readonly workboardV2Unsnooze: {
        readonly method: "DELETE";
        readonly path: "/api/v1/pages/:pageLabel/workboard/v2/snooze/:fanId";
    };
};
