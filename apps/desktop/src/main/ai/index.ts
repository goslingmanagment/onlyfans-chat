// AI layer barrel (SPEC §8). The composition root wires:
//   const coordinator = createAiCoordinator({ data, client, settingsStore, keychain });
//   ipc 'ai:start' → coordinator.start, 'ai:cancel' → coordinator.cancel,
//   'cmd:conversation.open/close' → conversationOpened/conversationClosed,
//   coordinator.subscribe(event => webContents.send('ai:event', event)).

export { createAiCoordinator, buildFeatureResult, PERSONALITIES_SETTINGS_KEY } from './coordinator';
export type { AiCoordinator, AiCoordinatorDeps, SummaryHubHooks, UsageEventRecord } from './coordinator';
export { createDirectGateway } from './gateway';
export type { AiGateway, AiGatewayCallbacks, DirectGatewayOptions } from './gateway';
export { createContextLoader } from './context-loader';
export type {
  ContextLoader,
  ContextLoaderOptions,
  FanContextArgs,
  FanContextBlock,
  LoadTranscriptArgs,
} from './context-loader';
export { createStagedTimeouts } from './timeouts';
export type { OperationTimeoutKey, StagedTimeouts, StagedTimeoutsOptions } from './timeouts';
export { createOperationProfiler, NO_OP_PROFILER, PROFILER_STAGE_LABELS } from './profiler';
export type { OperationProfiler, ProfilerStageHandle } from './profiler';
export { routeStream } from './providers/index';
export type { CancelFn, LlmStreamRequest, StreamCallbacks } from './providers/index';
