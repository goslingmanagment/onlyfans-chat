import { type KernelClient, type KernelClientOptions } from "./contracts/index";
export { KernelApiError, SDK_EXCLUDED_OPERATIONS, createKernelClient, type KernelClient, type KernelClientOptions, type KernelErrorCategory, type KernelOperationDef, type KernelOperationKey, type KernelOperationRequest, type KernelOperationResponse, type KernelSdkMethodKey, } from "./contracts/index";
export { decodeDomainEventCursor, ofapiRead, routeSchemas, streamAiFeature, streamAiGateway, subscribeDomainEvents, subscribeSyncEvents, type AiFeatureDebugInputFrame, type AiFeatureStreamFrame, type AiGatewayStreamFrame, type DomainEventFrame, type DomainEventsSnapshotRequired, type KernelStreamHandle, type SyncEvent, type SyncSnapshotRequired, } from "./contracts/index";
export { kernelOperations } from "./operations";
export { KERNEL_CONTRACT_HASH, KERNEL_SDK_VERSION } from "./meta";
export declare function createClient(options: KernelClientOptions): KernelClient;
