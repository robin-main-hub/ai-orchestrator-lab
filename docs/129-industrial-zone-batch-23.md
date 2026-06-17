# Batch 23 (구현 핸드오프) — Generic Source Pack Demo

> **상태**: 구현 완료 · PR #623 #624 · 선행 Batch 22 docs/128 · forward-loop iter 5
> **목표**: 번들된 source pack(선언적 manifest + provider 결과 + evidence)이 OS를 **도메인 의존 없이** 먹이는 방식을 Source Dock에 보이게. 실행/원격 로딩 0.

## 한 줄 요약
generic example source pack을 정의하고(매니페스트 + provider 결과 + evidence), PREVIEW Source Dock에
**선언적 manifest(이름/버전/kind + capability 칩) + WorkItemLite 행 + evidence 후보**로 렌더. 그동안 안 보이던
manifest/capability 레이어를 가시화 — pack→OS 경로가 read-only이고 도메인 독립임을 증명.

## PR 트랙
| PR | 내용 |
| --- | --- |
| #623 | `exampleSourcePack.ts`(SourcePack 타입 + EXAMPLE_SOURCE_PACK + projectSourcePack) + `SourcePackCard`(PREVIEW 전용) |
| #624 | 본 핸드오프(docs/129) + 체크리스트 §23 |

## 무엇이 보이게 됐나
- `SourcePack` = { manifest, sources(provider 결과), evidence } 번들 객체. `EXAMPLE_SOURCE_PACK`은 generic,
  sourceKind="static"(원격 로딩 없음), capabilities=[inbox_source_provider, workitem_lite_provider, evidence_provider].
- `projectSourcePack`(순수): manifest + capabilities + 활성 행(projectPluginWorkItems) + evidence 후보
  (projectPluginEvidenceCandidates) — 기존 순수 투영 재사용, 중복 0.
- `SourcePackCard`(PREVIEW 전용): manifest 배너(이름/버전/kind/"declarative · read-only") + capability 칩 +
  `[plugin]` WorkItemLite 행 + evidence 후보. 표시 전용, 버튼 0.

## 안전 불변식 (0 유지)
```text
plugin 실행 0 · remote loading 0 (sourceKind static) · source sync 0 · server/EventStorage write 0
projectSourcePack 순수 · SourcePackCard 표시 전용(버튼 0) · PREVIEW 전용(LIVE 누수 0)
generic only(도메인 용어 0) · manifest는 validatePluginManifest 통과 · SANDBOX 실행 0
```

## 검증
신규 테스트: `exampleSourcePack.test.ts`(3 — manifest 유효/선언적 · 순수 투영 · 도메인 용어 0) ·
`AssistantInboxSourcePack.test.tsx`(4 — manifest/caps/rows/evidence PREVIEW 가시 · PREVIEW 전용 · read-only).
인박스+plugins 로컬 269 green · typecheck clean · build green · CI green.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
- BATCH H — Evidence Draft / Footnote Surface(draft card · evidence footnotes · freshness/staleness chip · ask placeholder).
- BATCH J — Command Palette Power Pass · BATCH K — Visual Style Pass · BATCH I — Launch Key / Commit Point UX(라벨링).
- 보류 유지: BATCH B(patch queue 통합, docs/125 설계 노트).
