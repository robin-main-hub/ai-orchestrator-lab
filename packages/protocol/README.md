# Protocol Package

데스크톱 앱, 서버, 에이전트 런타임이 공유하는 타입과 이벤트 스키마를 둡니다.

## 포함할 것

- Session
- Agent
- ProviderProfile
- ModelDescriptor
- DebateRound
- CodingPacket
- MemoryRecord
- RuntimeEvent
- TerminalEvent

모든 장기 저장 데이터와 네트워크 이벤트는 여기서 먼저 정의합니다.

## 현재 구현

- 핵심 타입과 Zod 스키마
- `CodingPacket`
- `ProviderProfile` + `SecretRef`
- `EventEnvelope` + `sourceTrust`
- `PermissionLevel` / `ApprovalState`
- `MemoryAPI` 타입
- `EventStore` 인터페이스
