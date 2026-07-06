// AI layer barrel (SPEC §8; Stage 31: kernel feature-service lane only).
// The composition root wires:
//   const coordinator = createAiCoordinator({ data, client, settingsStore, featureGateway });
//   ipc 'ai:start' → coordinator.start, 'ai:cancel' → coordinator.cancel,
//   coordinator.subscribe(event => webContents.send('ai:event', event)).

export { createAiCoordinator, buildFeatureResult, PERSONALITIES_SETTINGS_KEY } from './coordinator';
export type { AiCoordinator, AiCoordinatorDeps, SummaryHubHooks, UsageEventRecord } from './coordinator';
export type {
  AiFeatureGateway,
  AiFeatureGatewayRequest,
  AiGatewayCallbacks,
  CancelFn,
  StreamCallbacks,
} from './gateway';
export { createStagedTimeouts } from './timeouts';
export type { OperationTimeoutKey, StagedTimeouts, StagedTimeoutsOptions } from './timeouts';
export { createOperationProfiler, NO_OP_PROFILER, PROFILER_STAGE_LABELS } from './profiler';
export type { OperationProfiler, ProfilerStageHandle } from './profiler';
