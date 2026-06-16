# mimo 실 토큰 배선 — server-side proxy auth injection (2026-06-16)

## 배경
배포된 정적 사이트에서 mimo provider 호출이 `429 {"error":"too_many_failed_auth_attempts"}`로 막혔다.

## 진단 (근거 포함)
- 이 429는 **지역/국가(싱가폴) 차단도, 사용량 쿼터도 아니다.** `too_many_failed_auth_attempts` = **인증 누적 실패 차단**이다. 잘못된 토큰을 반복 전송 → 임계치 초과 → 일정 시간 429.
  - 우리 서버측 한도 근거: `apps/server/src/security/authRateLimiter.ts` (`maxFailures=10`, `windowMs=60_000`).
- **근본 원인 1 — 목업 토큰:** `#557`에서 넣은 `MIMO_MOCK_DEFAULT_TOKEN = "mimo-mock-token"`이 클라이언트 readiness만 통과시키고, 실 업스트림엔 무효 → 인증 실패 누적.
- **근본 원인 2 — 호스트 불일치:** seed/proxy는 업스트림을 `https://token-plan-sgp.xiaomimimo.com`(sgp=싱가폴 token-plan 호스트)로 박아둠. 그러나 동작이 확인된 실제 키는 `https://api.xiaomimimo.com/v1`용. (사용자의 "싱가폴 설정" 의심이 절반은 적중 — 호스트가 실제로 달랐다.)

## 실 토큰 위치 (값은 기록하지 않음)
- 이 Mac의 `~/.config/gio-erp/llm.env`:
  - `MIMO_API_KEY` = `sk-…` (51자) — 실 키 (값 비공개)
  - `MIMO_BASE_URL` = `https://api.xiaomimimo.com/v1`
  - `MIMO_MODEL_FAST` = `mimo-v2.5-pro`, `MIMO_MODEL_MAIN` = `mimo-v2.5`
- dgx-01 / dgx-02 env·파일엔 없음. 이 Mac에만 존재.

## 핵심 보안 원칙
정적 SPA는 클라이언트에 넣은 키(VITE_* env, localStorage)가 **빌드 번들에 박혀 공개 사이트에서 누구나 볼 수 있다** — 깃헙 노출보다 더 나쁨. 따라서 키는 **프록시(서버사이드)에서만** 주입한다.

## 적용 방안 (승인됨)
1. `apps/desktop/functions/_mimoProxy.ts`: `env.MIMO_API_KEY`에서 **서버사이드로 Authorization 헤더 주입**(openai=Bearer, anthropic=x-api-key). 업스트림은 `env.MIMO_UPSTREAM` 설정 가능, 기본 `https://api.xiaomimimo.com`.
2. `apps/desktop/vite.config.ts`: dev 프록시도 동일하게 `process.env.MIMO_API_KEY`를 dev 서버에서만 주입(번들 미노출).
3. 클라이언트의 mock 토큰은 **readiness 센티넬로만 유지** — 프록시가 실 키로 override하므로 클라엔 실 키 0.
4. **키 실값은 owner가 Cloudflare Pages 프로젝트 환경변수(`MIMO_API_KEY`, 선택 `MIMO_UPSTREAM`)에 직접 입력.** 레포·번들·깃헙 어디에도 들어가지 않는다. (Claude는 자격증명 입력 불가 — owner 수행.)

## 부가 룰
- **내부봇 기본 금지:** `provider_dgx02_vllm`(DGX-02 내부 vLLM, 미설정)을 절대 기본/fallback provider로 두지 말 것. 기본은 mimo 유지. (`useProviderRegistryController.ts` 선택 체인 마지막 fallback `providerProfiles[0]`이 현재 내부봇이라 mimo provider 소실 시 샐 위험 — 주의.)

## owner 체크리스트
- [ ] Cloudflare Pages → 프로젝트 환경변수에 `MIMO_API_KEY` 입력(`~/.config/gio-erp/llm.env`에서 복붙).
- [ ] 재배포 후 mimo-v2.5-pro 실응답 확인.
- [ ] 로컬 dev는 `export MIMO_API_KEY=...` 후 `pnpm dev`.
