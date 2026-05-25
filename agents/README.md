# Agent Profile Files

이 디렉터리는 AI Orchestrator Lab이 OpenClaw 방식과 비슷하게 불러올 수 있는 에이전트별 기본 프로필 파일을 둔다.

현재는 기본 지휘자 프로필만 제공한다.

```text
agents/
  orchestrator/
    AGENTS.md
    SOUL.md
```

앱 내부에서는 구조화된 `AgentProfile`과 persona 설정으로 관리하고, 파일 기반 설정을 선택하면 이 Markdown 파일을 prompt assembly의 입력으로 사용할 수 있다.

중요한 규칙:

- `SOUL.md`는 말투, 판단 기준, 장기 성향을 다룬다.
- `AGENTS.md`는 운영 규칙, 권한 경계, 산출물 형식을 다룬다.
- 두 파일은 동시에 저장할 수 있지만 한 번의 실행에는 `internal`, `markdown`, `off` 중 하나의 설정 소스만 주입한다.
- API key, bearer token, OAuth token, `.env` 값은 이 파일에 쓰지 않는다.

## 시각 정체성 (avatar + background)

페르소나의 얼굴/배경 이미지를 SOUL.md 와 같은 디렉터리에 두면, 데스크톱 swarm 썸네일 / 모바일 메시지 작성자 아바타 / 모바일 채팅 배경 셋이 하나의 출처를 본다. 사람이 일하는 느낌을 만들기 위한 단일 정체성.

### 파일 규약

```text
agents/<persona>/
  SOUL.md            # 말투 / 판단
  AGENTS.md          # 운영 규칙
  avatar.svg         # 프로필 이미지 (svg/png/jpg/jpeg/webp 모두 인식)
  background.png     # 선택 — 채팅창 기본 배경 (svg/png/jpg/jpeg/webp)
```

`packages/agents` 의 `loadPersona()` 가 `avatar.*` / `background.*` 를 자동 탐지해 `LoadedPersona.avatarPath` / `chatBackgroundPath` 로 노출한다. 확장자 우선순위는 SVG → PNG → JPG → JPEG → WEBP. 실제 인물 사진을 쓰고 싶으면 placeholder SVG 옆에 `avatar.jpg` 만 떨궈도 자동으로 그게 우선 (SVG 보다 PNG/JPG 같은 raster 가 늦지만, SVG 가 아예 없으면 raster 가 바로 잡힘 — 즉 placeholder 를 지우거나 같은 이름으로 덮어쓰면 됨).

### 정체성 → UI 매핑

| UI 위치 | 보는 소스 | 폴백 |
|---|---|---|
| 데스크톱 agent swarm 썸네일 | `AgentProfile.avatarPath` | 역할 아이콘 (generic) |
| 모바일 메시지 말풍선의 작성자 아바타 | `AgentProfile.avatarPath` | 역할 첫 글자 + 색상 원 |
| 모바일 채팅창 배경 | (1) `localStorage["mobile.chatBackgroundDataUrl.soul.<id>"]` (사용자 업로드) → (2) `AgentProfile.chatBackgroundPath` → (3) 테마 단색 | (단계별 폴백) |
| 데스크톱 페르소나 설정 패널 | 같은 `avatarPath` | 동일 |

키 포인트:
- **모바일 채팅 배경은 SOUL 단위로 keyed** — 같은 SOUL 의 모든 세션은 같은 배경. localStorage 키 `mobile.chatBackgroundDataUrl.soul.<soulId>` 이며 사용자가 모바일 설정에서 업로드.
- **`background.<ext>` 는 선택**. 사용자가 자기 사진을 안 올린 SOUL 만 이 default 가 폴백 역할. 사용자 업로드가 있으면 default 는 무시.
- **`avatar.<ext>` 는 모든 페르소나에 권장**. 없으면 UI 가 generic 으로 떨어져 몰입감이 깨짐.

### Placeholder 교체

기본 제공되는 6 개 SVG (orchestrator / architect / reviewer / skeptic / verifier / memory_curator) 는 한글 단일자 + 색상 조합의 placeholder 다. 실제 인물 / 일러스트로 바꾸려면:

1. 같은 디렉터리에 `avatar.png` (또는 .jpg / .webp) 를 저장
2. SVG placeholder 를 지울지 그대로 둘지는 자유 — raster 확장자가 살아 있는 한 loader 가 그쪽을 선택
3. 권장 사양: 정사각형, 최소 256×256, 가급적 256×256 이상의 JPG (50KB 미만) 또는 PNG. 동일한 인물의 다양한 표정/각도 시리즈를 시간순 회전할 일이 있으면 별도 메타 파일로 분리 (현재는 단일 정적 이미지 합의)
4. 보안: 이 디렉터리의 이미지는 secret 이 아니지만, 인물 사진이면 사용자 본인이 명시 허용한 것만 둘 것

### 추가 페르소나 / 커스텀 이미지 가이드

- 새 페르소나 디렉터리를 만들면 `SOUL.md` + `AGENTS.md` 와 함께 `avatar.svg` 를 같이 두는 게 일관성
- 실제 인물 시리즈를 쓰는 운영 환경에서는 사용자 환경별 (개인 / 회사) 디렉터리를 갈라서 별도 `agents-personal/` 로 격리하는 패턴도 가능 (loader 에 다른 `repoRoot` 주입)
- `chatBackgroundPath` 는 페르소나가 "공간"을 가진 느낌을 주고 싶을 때만 채움. default 가 없는 게 더 깔끔할 때도 있음 (예: 회의자 = 검토 분위기 = 무배경)

