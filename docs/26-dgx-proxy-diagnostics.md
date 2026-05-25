# DGX Proxy Diagnostics

데스크탑 → DGX 서버 → vLLM/provider 호출 경로에서 발생하는 에러를 한 코드표로 분류하고, 시운전 버튼이 사용자에게 보여줘야 할 진단 포맷을 정의한다.

배경:
- 브라우저 fetch는 CORS/PNA/DNS/네트워크 차단을 전부 `"TypeError: Failed to fetch"` 한 줄로 뭉뚱그린다. 사용자가 "또 안 되네"로 끝나지 않으려면 코드/계층/응답 위치로 구분해야 한다.
- C1 (Bearer auth)·C2 (Zod 강제) 머지 이후 401/413/400이 새로 생긴다. 사용자가 "전에는 됐는데"가 되지 않게 진단표를 미리 정리한다.

## 1. 호출 경로

```
[Desktop fetch]
  → DGX server   (https://orchestrator.endruin.com 또는 http://dgx-02:4317)
     → vLLM      (http://127.0.0.1:8001)
       또는 provider proxy (DeepSeek/APIKey.fun/Grok/...)
```

각 계층에서 떨어질 수 있는 실패 카테고리:
- L1 데스크탑 측: CORS/PNA preflight, DNS, TLS, browser private network 차단, network offline
- L2 DGX 서버 도달 후: 401 (C1 토큰), 413 (C2 body limit), 400 (C2 Zod), 404 (라우트 없음)
- L3 DGX → vLLM/provider: 502 (upstream 미동작), 504 (upstream timeout), 503 (overload), 401 (provider 키 만료), 429 (rate limit), 모델 id mismatch (404 from upstream)

## 2. 에러 코드표

| Code | 신호 (status / body / network layer) | 의미 | 가능한 원인 | 사용자 액션 |
|---|---|---|---|---|
| `NETWORK_OFFLINE` | fetch throw `TypeError`, `navigator.onLine === false` | 데스크탑이 네트워크 자체에 안 붙음 | Wi-Fi/이더넷 끊김 | 네트워크 연결 확인 |
| `DNS_FAILED` | fetch throw, `navigator.onLine === true`, 호스트가 IP가 아닌 경우 | DNS 해석 실패 | DNS 서버 장애, `orchestrator.endruin.com` 미등록, hosts 파일 충돌 | LAN base URL (`http://dgx-02:4317`)로 fallback, DNS 점검 |
| `TLS_INVALID` | fetch throw, 또는 브라우저 콘솔에 `ERR_CERT_*` | TLS 인증서 거부 | endruin.com 인증서 만료/오류, 자체 서명 미신뢰 | 인증서 갱신, 또는 LAN HTTP fallback |
| `CORS_PREFLIGHT_BLOCKED` | OPTIONS 응답 누락 또는 Access-Control-Allow-Origin mismatch (콘솔에 `CORS policy: ...`) | 브라우저가 본 요청 전에 차단 | C1 이후 origin whitelist에 데스크탑 origin 미포함 | server의 ALLOWED_ORIGINS에 origin 추가, 또는 데스크탑이 잘못된 origin (file://) |
| `PNA_BLOCKED` | OPTIONS 응답에 `Access-Control-Allow-Private-Network: true` 누락 | 브라우저 Private Network Access 차단 (Chrome) | LAN IP(`http://dgx-02:4317`) 호출 시, server 응답에 PNA 헤더 빠짐 | server `createCorsHeaders`가 이미 `true` 반환 → 빠진다면 응답 헤더 검증 |
| `UNAUTHORIZED_MISSING_TOKEN` | HTTP 401 + body `{"error":"unauthorized"}` | C1 이후 Bearer 헤더 누락 또는 잘못 | desktop이 `VITE_ORCHESTRATOR_API_TOKEN` 미부착 (압축 후 작업 예정) | 클라이언트 측 fetch에 `Authorization: Bearer ${VITE_ORCHESTRATOR_API_TOKEN}` 추가 |
| `UNAUTHORIZED_BAD_TOKEN` | HTTP 401 + body `{"error":"unauthorized"}`, 토큰은 보냈음 | 서버 expected 토큰과 불일치 | `.env`의 `ORCHESTRATOR_API_TOKEN`과 desktop `VITE_ORCHESTRATOR_API_TOKEN` 다름 | 두 env 동기화, 또는 server 재시작 후 새 토큰 |
| `PAYLOAD_TOO_LARGE` | HTTP 413 + body `{"error":"payload_too_large","limit":1048576}` | C2의 1MB body limit 초과 | 매우 긴 대화/첨부, 또는 events sync push가 한 번에 너무 많은 이벤트 | 클라이언트가 chunk로 쪼개 보내거나, MAX_JSON_BODY_BYTES 상향 (보안 영향 검토) |
| `BAD_REQUEST_SCHEMA` | HTTP 400 + body `{"error":"invalid_provider_completion_payload","message":"..."}` 또는 `invalid_remote_execution_payload` / `invalid_event_sync_payload` | C2의 Zod 검증 실패 | payload field 누락/타입 오류/길이 초과 | message에 zod path가 있음 — 그 필드 수정 |
| `ROUTE_NOT_FOUND` | HTTP 404 + body `{"error":"not_found"}` | 미등록 라우트 호출 | 클라이언트가 잘못된 URL, 또는 서버 버전 mismatch | pathname 확인, 서버 빌드 갱신 |
| `DGX_UNREACHABLE` | HTTP 502, body에 `endpoint`/`error` 포함 | DGX 서버는 응답했지만 upstream vLLM/provider 도달 실패 | vLLM 미실행, 포트 충돌, 잘못된 baseUrl | DGX-02에서 vLLM 헬스 확인 (`curl http://127.0.0.1:8001/v1/models`) |
| `UPSTREAM_TIMEOUT` | HTTP 504 또는 응답 body의 `error`에 `timeout` 키워드 | upstream 응답 지연이 timeout 초과 | 모델 로딩 중, 긴 generation, vLLM concurrency 한계 | timeoutMs 상향, concurrency 줄임, 모델 warm-up |
| `UPSTREAM_OVERLOADED` | HTTP 503, 또는 provider response에 `overloaded_error` | upstream이 일시 과부하 | 동시 요청 폭주, Anthropic overloaded_error | retry with backoff |
| `RATE_LIMITED` | HTTP 429, header `Retry-After: <sec>` | upstream rate limit | provider 분당 요청/토큰 limit 초과 | Retry-After 기다림, 라우팅 분산 |
| `PROVIDER_AUTH_EXPIRED` | HTTP 401 from upstream, response body의 `error`에 `authentication_error` 또는 `expired` | provider API key/OAuth 만료 | OAuth refresh 토큰 만료, key revoke | 키 갱신 (~/.grok/auth.json 등), provider registry에 `secretAvailability: "expired"` 표시 |
| `MODEL_ID_MISMATCH` | HTTP 404 from upstream, body에 `model` 또는 `not_found_error` | 요청한 modelId가 upstream에 없음 | 모델 이름 오타, 모델 deprecate, profile defaultModelIds 옛 값 | provider registry에서 모델 목록 확인, 모델 id 정정 |
| `CONTENT_BLOCKED` | HTTP 200이지만 response가 빈 content + safety flag, 또는 Anthropic의 `stop_reason: "refusal"` (향후) | 모델이 content policy로 거부 | 입력에 policy 위반 내용 | 입력 다듬기 |
| `UNKNOWN_ERROR` | 위 어디에도 안 맞음 | 분류 실패 | response shape이 예상과 다름 | raw response 캡처 + 이 표 업데이트 |

## 3. "Failed to fetch" 분해 가이드

브라우저는 다음 케이스를 모두 같은 `TypeError: Failed to fetch`로 throw한다. 구분 신호:

| 케이스 | 구분 신호 |
|---|---|
| `NETWORK_OFFLINE` | `navigator.onLine === false` |
| `DNS_FAILED` | `navigator.onLine === true`, URL 호스트가 IP 아님, browser devtools Network 탭에 `(failed) net::ERR_NAME_NOT_RESOLVED` |
| `TLS_INVALID` | devtools에 `net::ERR_CERT_*` |
| `CORS_PREFLIGHT_BLOCKED` | devtools console에 `Access to fetch at ... has been blocked by CORS policy: ...` |
| `PNA_BLOCKED` | devtools에 `net::ERR_FAILED` + `Private Network Access prevented this request` (Chrome) |
| 서버 immediate crash | devtools에 `(failed) net::ERR_CONNECTION_REFUSED` |

desktop 코드(`apps/desktop/src/runtime/stage12DgxProvider.ts`, `stage13DgxServer.ts`)가 fetch를 try/catch할 때, 위 신호 일부는 코드에서 직접 못 본다 (브라우저 콘솔에만 표시). 진단 버튼은 이 한계를 명시하고 "네트워크 탭/콘솔을 추가로 보세요" 안내를 줘야 한다.

## 4. 진단 페이로드 포맷

시운전 버튼이 server `/health` + 시도한 호출을 합쳐 만들 진단 객체.

```ts
type DgxProxyDiagnostic = {
  code: DgxProxyErrorCode;     // 위 표의 code
  layer: "L1_browser" | "L2_dgx_server" | "L3_upstream";
  httpStatus?: number;          // 있을 때만
  endpoint?: string;            // 시도한 URL
  message: string;              // 사람이 읽는 한 줄 (이미 redactSecretsForLog 처리됨)
  expectedAction: string;       // 사용자가 취할 액션
  serverHealth?: {              // /health 호출 결과 (가능했다면)
    status: "online" | "degraded" | "offline" | "syncing";
    dgxStatus?: string;
    capabilities?: string[];
    eventStorage?: object;
  };
  rawSnippet?: string;          // upstream raw response의 redacted 240자
  retryAfterSec?: number;       // 429 시
  ts: string;                   // ISO timestamp
};
```

UI에서 표시할 항목:
- 큰 배지: `code` (예: `UNAUTHORIZED_MISSING_TOKEN`)
- `layer` (L1/L2/L3)와 `httpStatus` (있으면)
- `expectedAction` (가장 큰 글씨)
- 접힌 섹션: endpoint, rawSnippet, serverHealth 전체
- `code`별 도움말 페이지로 deep link (`docs/26-dgx-proxy-diagnostics.md#error-<code>`)

## 5. 분류 알고리즘 (의사 코드)

```ts
async function diagnoseDgxCall(
  endpoint: string,
  doRequest: () => Promise<Response>,
): Promise<DgxProxyDiagnostic> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { code: "NETWORK_OFFLINE", layer: "L1_browser", ... };
  }

  let response: Response;
  try {
    response = await doRequest();
  } catch (err) {
    // L1 분류 — 브라우저는 세부 사유 가림. message로 추정
    const msg = String(err);
    if (/CORS/i.test(msg)) return { code: "CORS_PREFLIGHT_BLOCKED", ... };
    if (/Private Network/i.test(msg)) return { code: "PNA_BLOCKED", ... };
    if (/certificate|cert/i.test(msg)) return { code: "TLS_INVALID", ... };
    if (/name_not_resolved/i.test(msg)) return { code: "DNS_FAILED", ... };
    // 나머지 대부분은 "Failed to fetch" — 콘솔 보라고 안내
    return { code: "UNKNOWN_ERROR", layer: "L1_browser", message: msg, ... };
  }

  // L2/L3 분류 — status code 기반
  if (response.status === 401) {
    const body = await safeJson(response);
    return body?.error === "unauthorized"
      ? { code: "UNAUTHORIZED_MISSING_TOKEN", layer: "L2_dgx_server", ... }
      : { code: "PROVIDER_AUTH_EXPIRED", layer: "L3_upstream", ... };
  }
  if (response.status === 413) return { code: "PAYLOAD_TOO_LARGE", layer: "L2_dgx_server", ... };
  if (response.status === 400) return { code: "BAD_REQUEST_SCHEMA", layer: "L2_dgx_server", ... };
  if (response.status === 404) return { code: "ROUTE_NOT_FOUND", layer: "L2_dgx_server", ... };
  if (response.status === 502) return { code: "DGX_UNREACHABLE", layer: "L3_upstream", ... };
  if (response.status === 504) return { code: "UPSTREAM_TIMEOUT", layer: "L3_upstream", ... };
  if (response.status === 503) return { code: "UPSTREAM_OVERLOADED", layer: "L3_upstream", ... };
  if (response.status === 429) return { code: "RATE_LIMITED", layer: "L3_upstream", retryAfterSec: ... };
  // 200 OK 안에서도 분류 필요한 케이스: 빈 content + safety flag → CONTENT_BLOCKED
  ...
}
```

server 응답 body가 항상 JSON임을 가정 (현재 server는 `writeJson` 일관). 비-JSON이면 `UNKNOWN_ERROR`.

## 6. 시운전 버튼 시나리오

| 시나리오 | 결과 |
|---|---|
| 모든 게 정상 | `code: undefined`, 초록 "정상" 배지 |
| dev 모드에서 `VITE_ORCHESTRATOR_API_TOKEN` 미설정 | `UNAUTHORIZED_MISSING_TOKEN` + 액션: ".env에 토큰 넣기" |
| C1 머지 후 클라이언트가 헤더 미부착 (압축 후 작업 영역) | `UNAUTHORIZED_MISSING_TOKEN` |
| LAN base URL (`http://dgx-02:4317`)에서 PNA 차단 | `PNA_BLOCKED` + 액션: "Chrome PNA 정책 확인" |
| DGX 서버는 살았지만 vLLM 꺼짐 | `DGX_UNREACHABLE` + 액션: "DGX-02 vLLM 헬스 확인" |
| 모델 id 오타 | `MODEL_ID_MISMATCH` + 액션: "provider registry 모델 목록 확인" |
| Grok OAuth expired | `PROVIDER_AUTH_EXPIRED` + 액션: "~/.grok/auth.json 갱신" |

각 액션 옆에 "DGX 서버 헬스 다시 확인" 버튼을 노출해서 사용자가 한 번에 재진단할 수 있게.

## 7. 코드 도입 위치

| 영역 | 변경 |
|---|---|
| `packages/protocol` | `DgxProxyErrorCode` enum + `DgxProxyDiagnostic` 타입 (zod schema 포함) |
| `apps/desktop/src/runtime/stage12DgxProvider.ts` | `diagnoseDgxCall` wrapper 추가, 호출 실패 시 `DgxProxyDiagnostic` 이벤트 발행 |
| `apps/desktop/src/runtime/stage13DgxServer.ts` | server probe 실패도 같은 wrapper로 통일 |
| `apps/desktop/src/components/...` (Codex 영역) | 시운전 버튼에서 diagnostic 객체 시각화 |
| `apps/server/src/index.ts` | 응답 body shape이 위 가정과 일치하는지 점검 — 이미 일치 (C1·C2 PR 기준) |

실제 구현 PR은 C3·C4 (desktop race fix)와 같은 압축 후 단계에서 진행한다. 이 문서는 시운전 UX 합의가 먼저인 reference.

## 8. 결정 필요

1. **L1 (브라우저) 분류 신호 한계**: 브라우저가 가려서 안 보이는 사유는 "Network 탭 보세요" 안내로 충분한가, 또는 desktop이 native fetch (Tauri) 쓰면 더 정확해지므로 21번 `tauri-desktop-shell` 결정과 묶일까?
2. **`DgxProxyDiagnostic`를 event log에 저장**: trust level별로 raw snippet 저장 정책 — `trusted` provider만 raw 저장, `untrusted`는 code+message만? 이건 `13-event-store-permission-redaction` 정책과 정렬 필요.
3. **자동 fallback**: `DNS_FAILED`/`TLS_INVALID` 시 자동으로 LAN URL로 fallback할지 vs 사용자 액션 요구. (Claude 추천: 후자, 자동 fallback은 다른 호스트로 가는 의미라 보안 검증 필요)
4. **진단 캐싱**: 같은 code가 1분 안에 반복되면 묶어서 표시할지 (UI 폭주 방지).

---

## 9. Implementation status (post-merge)

이 명세는 [PR #19](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/19) (Codex)로 실 구현되어 main에 머지됨. 코덱스가 `stage32DgxRouteDiagnostics` 모듈로 base URL별 분리 진단 + Systems 패널 상태 카드까지 구현.

### 실 구현이 발견한 첫 사용 사례

`Probe DGX` 버튼이 base URL별 응답을 따로 기록하면서, 같은 도메인이라도 진단 결과가 다음과 같이 분리됨이 드러남:

- `dgx-02:4317` (LAN): `health ok/200`, `provider ok/204`
- `orchestrator.endruin.com` (Cloudflare): `network_error`

이게 §3 "Failed to fetch 분해 가이드"의 `DNS_FAILED` 시나리오와 정확히 매핑됨 (DNS에서 NXDOMAIN). docs/26의 분류표가 실제 진단으로 검증된 첫 사례.

→ 해결 경로: orchestrator 서브도메인을 Cloudflare에 위임 + Cloudflare Tunnel로 노출 (별도 인프라 단계, 그 작업도 완료). 진단 표가 코드 작업이 아닌 도메인/라우팅 작업으로 좁혀줌 — 이게 docs/26 §4 "DgxProxyDiagnostic 페이로드 포맷"의 핵심 가치.

### 코덱스 구현이 docs와 매칭되는 지점

| Docs/26 명세 | stage32 실 구현 |
|---|---|
| §1 호출 경로 (L1/L2/L3 분리) | base URL별 별도 진단 — 같은 layer 내에서도 호스트별 분리 |
| §2 에러 코드표 17개 | 구현에서는 첫 라운드로 `health`/`provider` 분리 + status code 매핑부터 시작. 17개 코드 전체는 점진 확장 |
| §3 "Failed to fetch" 분해 가이드 | `network_error` 분류로 시작 (DNS/TLS/CORS/PNA 추가 분리는 후속) |
| §4 `DgxProxyDiagnostic` 페이로드 | Systems 패널 상태 카드 UI로 직접 노출 + Event Storage 기록 |
| §6 시운전 시나리오 | 6개 중 "endruin DNS 미등록" 시나리오가 첫 실증 검증 |

### Open / 후속

- 17개 에러 코드 풀 커버리지 — 현재는 `network_error` / HTTP status 매핑 위주. `CORS_PREFLIGHT_BLOCKED` / `PNA_BLOCKED` / `TLS_INVALID` 분리는 별도 PR.
- `DgxProxyErrorCode` enum + `DgxProxyDiagnostic` zod schema를 `packages/protocol`에 정식 등록 — 현재는 desktop runtime 내부 타입.
- §8 결정 사항 4개는 미해결: L1 분류 정확도 (Tauri shell 결정과 연관), event log 저장 정책 (`docs/13` redaction 정렬), 자동 fallback, 진단 캐싱.
- AdapterError category와 `DgxProxyErrorCode` 매핑 표준화 — adapter 계층 에러와 진단 계층 에러가 같은 카테고리 용어 사용하도록 (별도 PR).
