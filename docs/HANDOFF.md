# ai-orchestrator-lab — 다른 컴퓨터 작업 핸드오프

## 0. 프로젝트 한 줄 요약
캐릭터 기반 멀티에이전트 코딩 오케스트레이터. 두 축으로 개발:
- **A축**: 코딩 도구 프로덕션 레디(편집 무결성, tmux 수명관리, repo-map, 검증/자가수정, 스냅샷 롤백, 대화 워크벤치 OpenCode급 14항목)
- **B축(서브컬처 축)**: 페르소나 일관성, 멀티캐릭터 토론, 표정, 캐릭터 음성(TTS)
  ※ 용어 주의: B축은 반드시 **"서브컬처 축"** 으로 부를 것.

## 1. 저장소
- Git: `https://github.com/robin-main-hub/ai-orchestrator-lab.git`
- 브랜치: `main` (모든 작업 푸시 완료)
- 모노레포: pnpm workspace (apps/desktop, apps/server, apps/mobile, packages/*)

## 2. 런타임 (버전 고정)
- Node `v24.x` (검증: 24.14.1)
- pnpm `10.11.0` (package.json `packageManager`로 고정 → `corepack enable` 권장)
```bash
corepack enable
corepack prepare pnpm@10.11.0 --activate
```
※ Windows에서는 Git Bash로 작업했고 pnpm이 `~/.local/bin` corepack shim이라
   매 셸에서 `export PATH="$HOME/.local/bin:$PATH"` 선행이 필요했음.

## 3. 클론 & 설치 & 검증
```bash
git clone https://github.com/robin-main-hub/ai-orchestrator-lab.git
cd ai-orchestrator-lab
pnpm install
pnpm -r typecheck      # 8개 패키지 클린이어야 정상
pnpm -r test           # 전부 그린: desktop 1019 · agents 208 · providers 190 ·
                       #            server 125 · memory 171 · protocol 33 · mcp 9
pnpm --filter desktop dev   # 데스크톱 GUI 스모크
```
한 패키지만: `pnpm --filter desktop exec vitest run <경로>`,
타입만: `pnpm --filter desktop exec tsc --noEmit`

## 4. DGX-02 서버 접근 (★ Tailscale 필수)
dgx-02는 **Tailscale 테일넷**으로만 해석됨(LAN IP 아님).
- 새 컴퓨터를 같은 테일넷에 가입 → MagicDNS로 `dgx-02` 자동 해석.
  (수동이면 hosts에 `100.71.215.84  dgx-02` 추가. 테일넷 IP는 바뀔 수 있으니 MagicDNS 우선)
- SSH: `ssh robin@dgx-02`  ← **사용자명은 robin** (choim 아님; 틀리면 publickey 거부)
  - 새 머신의 `~/.ssh/id_ed25519.pub`를 dgx의 `robin@dgx-02:~/.ssh/authorized_keys`에 등록해야 함
    (기존 머신에서 `ssh-copy-id robin@dgx-02` 또는 비번 1회로)
- 서비스: user systemd `ai-orchestrator-server.service`
  (`ssh robin@dgx-02 'systemctl --user restart ai-orchestrator-server.service'`)
  WorkingDir `/home/robin/ai-orchestrator-lab`, EnvFile 같은 경로 `.env` (PORT=4317)

### 엔드포인트
| 용도 | 주소 | 인증 |
|---|---|---|
| 오케스트레이터 서버 | `http://dgx-02:4317` | `ORCHESTRATOR_API_TOKEN` |
| vLLM 추론 | `http://dgx-02:8001/v1` | 무인증, 모델 `qwen36-gio-lora-v5-prisma`(262K ctx) |
| Kokoro TTS (서브컬처 축) | `http://dgx-02:8880` | 무인증, OpenAI 호환 |

## 5. 로컬 시크릿/설정 (저장소에 없음 — 새 머신에서 생성)
### a) `apps/desktop/.env.local` (없으면 생성)
```
VITE_DGX_SERVER_BASE_URL=http://dgx-02:4317
VITE_ORCHESTRATOR_API_TOKEN=<dgx .env의 ORCHESTRATOR_API_TOKEN 값>
```
토큰 값 가져오기:
```bash
ssh robin@dgx-02 'grep ORCHESTRATOR_API_TOKEN ~/ai-orchestrator-lab/.env'
```
※ 데스크톱 `.env.local`의 토큰과 dgx `.env`의 토큰이 **불일치하면** 서버가
   실패 10회/60초 시 `429 too_many_failed_auth_attempts`로 60초 잠금. 값 일치부터 확인.

### b) MiMo Token Plan 키
- dgx: `/home/robin/.mimo-key` (`.env`의 `MIMO_API_KEY_FILE`로 등록)
- 로컬 사본 필요: `~/.mimo-key` (기존 머신 `C:\Users\choim\.mimo-key`에서 복사)

## 6. Kokoro TTS (서브컬처 축, 이미 설치·검증됨)
- dgx-02 컨테이너 `ghcr.io/remsky/kokoro-fastapi-cpu:latest`, `--restart unless-stopped`(재부팅 생존), aarch64
- 호출(OpenAI 호환, **본문 UTF-8 필수**):
```bash
curl -s -o out.mp3 -H "content-type: application/json" --data-binary \
  '{"model":"kokoro","voice":"af_bella","input":"안녕하세요","response_format":"mp3","speed":0.92}' \
  http://dgx-02:8880/v1/audio/speech
# voice 목록: curl http://dgx-02:8880/v1/audio/voices   (af_sky/af_bella/am_adam 등 전부 유효)
```
- 데스크톱 배선: `ttsSynthesizer.ts`(createLocalTtsSynthesizer) → `useTtsSpeaker` 훅
  → `AutonomyRunPanel` "말하기" 버튼. Orpheus(감정엔진)는 미설치 → Kokoro 우회 중.

## 7. 완료 상태 (전부 푸시됨)
- KIMI 브리프 9개(P0-1~P2-9) + 후속 2개(토론 합의 활성화, 전체 repo 사전인덱싱)
- 대화 워크벤치 OpenCode급 14항목 (커밋 `84086fb`; 도구루프는 `130c7a0`)
- TTS 실합성 백엔드 + 말하기 UI (커밋 `1850ec2`)
- → **남은 미착수 작업 없음.** 전 워크스페이스 typecheck/test 그린.

## 8. 작업 규칙
- 항목별로 커밋 분리, main에 푸시. 변경은 순수 모듈+vitest로, App.tsx엔 배선만.
- 모든 도구 실행은 승인 게이트(dispatch→approve→replay) 통과. 게이트 우회 금지.
- 원격 아키텍처(tmux/git) 의존 기능은 dgx-02에서 검증.
