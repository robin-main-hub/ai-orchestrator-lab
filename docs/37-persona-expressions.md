# Persona Expressions (표정)

실시간 대화/작업 상태에 따라 페르소나 프로필 사진의 표정을 바꾸는 시스템. 표정
키는 **SillyTavern 표준 28종(go_emotions)** 과 동일하므로, 준비한 이미지는
SillyTavern에서도 그대로 쓸 수 있다. 이미지가 없으면 기본 아바타로 graceful
fallback 하므로, 표정 시트는 나중에 채워도 된다.

## 파일 규칙

```
agents/<슬러그>/avatar.png                 # 기본 아바타 (표정 없을 때 폴백)
agents/<슬러그>/expressions/<emotion>.png   # 표정 스프라이트 (png/jpg/jpeg/webp)
```

빌드 시 Vite가 번들하며 `personaSprites[슬러그][emotion]` 으로 노출된다.
해상도/비율은 자유지만 정사각 권장(원형 크롭됨).

## 준비 티어 (크롤링/생성 우선순위)

- **Tier 0 — 필수 8**: `neutral` `joy` `curiosity` `surprise` `sadness` `anger`
  `embarrassment` `pride`
- **Tier 1 — 권장 +8**: `amusement` `confusion` `nervousness` `disappointment`
  `love` `relief` `excitement` `annoyance`
- **Tier 2 — 풀세트 28**: 위 + `admiration` `approval` `caring` `desire`
  `disapproval` `disgust` `fear` `gratitude` `grief` `optimism` `realization`
  `remorse`

(정본은 `apps/desktop/src/lib/expressionTaxonomy.ts` — 키 추가/변경은 거기서.)

## 자동 매핑

### 작업 중 (closed-loop 상태 → 표정)

| 상태 | 표정 |
|---|---|
| idle / 대기 | neutral |
| progressing / running | curiosity |
| awaiting_input | confusion |
| needs_approval / blocked / awaiting_human | nervousness |
| completed | pride |
| failed | sadness |

### 일상 대화 (메시지 감정 → 표정)

가벼운 키워드 분류(`expressionClassifier.ts`)로 최신 메시지에서 추정:
웃음(ㅋㅋ/하하)→amusement, 감사→gratitude, 사랑→love, 부끄→embarrassment,
짜증→annoyance, 화남→anger, 미안→remorse, 슬픔(ㅠㅠ)→sadness,
놀람(헐/대박)→surprise, 기쁨→joy, 두려움→fear, 질문(?)→curiosity, 그 외 neutral.

작업 컨텍스트가 일상 감정보다 우선한다(실행 중엔 얼굴이 작업을 따라간다).

## 폴백 체인

`expression 스프라이트 → neutral 스프라이트 → 기본 avatar → 봇 아이콘`

표정 시트가 일부만 있어도 동작한다(없는 표정은 neutral로).
