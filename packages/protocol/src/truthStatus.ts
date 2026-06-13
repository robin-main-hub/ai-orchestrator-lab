import { z } from "zod";

/**
 * TruthStatus — 이 프로젝트의 정직성 원칙의 핵심 타입.
 *   observed   : 실제 runner/verifier 출력 기반 (실측)
 *   configured : 파생/구성값 (실측 아님)
 *   planned    : 의도했으나 아직 실행 전
 *   simulated  : 시뮬레이션/극장 — observed로 위장 금지
 *
 * productKernel에서 분리한 이유: sandboxErrorCard/confidenceSignal이 이 스키마만
 * 필요로 하는데, productKernel이 거꾸로 그 모듈들을 import하면 순환이 된다. 이 작은
 * 기반 모듈을 양쪽이 import해 순환을 끊는다. (productKernel은 하위호환을 위해 re-export.)
 */
export const truthStatusSchema = z.enum(["observed", "configured", "planned", "simulated"]);
export type TruthStatus = z.infer<typeof truthStatusSchema>;
