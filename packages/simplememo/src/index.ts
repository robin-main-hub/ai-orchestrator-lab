export type {
  MemoryAdapter,
  MemoryAdapterContext,
  MemoryAdapterKind,
  MemoryEventPayload,
} from "./adapter";
export { MemoryApiAdapter } from "./adapter.js";
export {
  isMemoryAdapterError,
  MemoryAdapterError,
} from "./errors.js";
export type {
  MemoryAdapterErrorCategory,
  MemoryAdapterErrorMeta,
} from "./errors";
export { MockAdapter } from "./mockAdapter.js";
export type { MockAdapterOptions } from "./mockAdapter";
export { withTrustEnforcement } from "./trustEnforcedAdapter.js";
export type { TrustPolicy } from "./trustEnforcedAdapter";

export { MementoMcpAdapter } from "./mementoAdapter.js";
export type { MementoMcpAdapterOptions, MementoPolicy, RecallSource, RecallTrace } from "./mementoAdapter.js";
export { LocalHeuristicAdapter } from "./localHeuristicAdapter.js";
export { SimpleMemAdapter } from "./simpleMemAdapter.js";

export {
  createBatchRememberAdapter,
  planBatchRemember,
  deriveBatchCandidateId,
  DEFAULT_BATCH_REMEMBER_CONFIG,
} from "./batchRemember.js";
export type {
  BatchRememberAdapter,
  BatchRememberCandidate,
  BatchRememberConfig,
  BatchRememberMode,
  BatchRememberOrigin,
  BatchRememberInitialTrust,
  BatchRememberResult,
  BatchCandidateResult,
  BatchCandidateOutcome,
} from "./batchRemember.js";

export { executeLocalBatchWrite } from "./batchRemember.js";
export type {
  LocalSimpleMemoWriter,
  LocalSimpleMemoWriteResult,
  LocalBatchWriteResult,
  LocalBatchWriteCandidateResult,
  LocalBatchWriteStatus,
} from "./batchRemember.js";

export {
  buildBatchRememberCandidatesFromLearning,
  distilledCandidateToMemoryInput,
  executeLearningBatchRemember,
} from "./learningBatchRemember.js";

export {
  buildBatchRememberCandidatesFromEvidence,
  evidenceToMemoryInput,
  executeEvidenceBatchRemember,
} from "./evidenceBridge.js";
export type { ApprovedEvidence, ApprovedEvidenceStatus } from "./evidenceBridge.js";
