import { existsSync } from "node:fs";
// 서버는 리눅스(dgx-02) 전용 — POSIX 경로로 고정해 Windows에서 도는 테스트도
// 같은 결과를 내게 한다 (win32 resolve는 드라이브 문자를 붙여 어긋난다).
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const { dirname, join, resolve } = posix;

/**
 * tmux 스웜 스크립트(swarm-send.sh / swarm-capture.sh)의 절대 경로를 해석한다.
 *
 * 이게 따로 존재하는 이유: 서버는 `pnpm --filter @ai-orchestrator/server start`로
 * 뜨는데, pnpm이 cwd를 패키지 폴더(apps/server)로 바꿔 실행한다. 기존 코드는
 * `join(process.cwd(), "scripts", ...)`로 경로를 잡아 `apps/server/scripts/...`를
 * 찾았고, 스크립트는 모노레포 루트 `scripts/`에만 있어 capture가 502 ENOENT로
 * 죽었다 — 자율 실행이 "갑자기 먹통"되던 실제 원인.
 *
 * 해석 우선순위 (첫 번째로 실제 존재하는 경로):
 *   1. 명시적 env 오버라이드 (운영자가 박은 절대 경로)
 *   2. 이 모듈 위치 기준 모노레포 루트의 scripts/ (cwd와 무관 — 견고)
 *   3. process.cwd()/scripts/ (하위호환 폴백)
 * 아무 후보도 존재하지 않으면 (2)를 반환해 에러 메시지가 올바른 기대 경로를 가리키게 한다.
 */
export function resolveSwarmScriptPath(
  fileName: string,
  options: {
    envOverride?: string;
    /** dist/index.js의 디렉터리 (기본: 이 모듈 위치). 테스트에서 주입 가능. */
    moduleDir?: string;
    cwd?: string;
    exists?: (path: string) => boolean;
  } = {},
): string {
  const exists = options.exists ?? existsSync;
  const moduleDir = options.moduleDir ?? dirname(fileURLToPath(import.meta.url));
  const cwd = options.cwd ?? process.cwd();

  // 빌드 출력은 apps/server/dist/index.js (rootDir src → outDir dist 평탄).
  // 이 모듈도 같은 dist에 떨어지므로 모노레포 루트는 세 단계 위.
  const repoRootFromModule = resolve(moduleDir, "..", "..", "..");
  const rootCandidate = join(repoRootFromModule, "scripts", fileName);

  const candidates = [options.envOverride, rootCandidate, join(cwd, "scripts", fileName)].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  // 아무것도 존재하지 않으면 모듈 기준 루트 경로로 폴백 — 에러 메시지가 올바른
  // 기대 위치를 가리키게 한다 (cwd/apps-server 경로가 아니라).
  return candidates.find((candidate) => exists(candidate)) ?? rootCandidate;
}

/**
 * 스웜 스크립트를 spawn할 때 쓸 작업 디렉터리(모노레포 루트).
 *
 * 스크립트 내부는 STATE_DIR을 상대경로 `.ai-swarm/`로 잡는다 — 즉 cwd가 루트여야
 * `.ai-swarm/ai-swarm.env`를 찾는다. 서버는 cwd=apps/server로 뜨므로 spawn 시
 * 이 값을 execFile의 cwd로 넘겨야 "Missing swarm env file"을 피한다.
 * 인자로 받은 스크립트 경로(`<root>/scripts/swarm-X.sh`)의 두 단계 위가 루트.
 */
export function swarmScriptCwd(scriptPath: string): string {
  return resolve(dirname(scriptPath), "..");
}
