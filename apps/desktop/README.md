# Desktop App

맥북에서 실행되는 데스크톱 오케스트레이터 앱입니다.

## 역할

- 오케스트레이터 작업판 표시
- 프로바이더 프로파일 관리
- 모델 조회와 선택
- 멀티 에이전트 토론 UI
- 코딩 전달 패킷 UI
- 터미널 슬롯 표시
- DGX 연결 상태와 로컬 폴백 표시

## 후보 스택

- Tauri 또는 Electron
- React
- TypeScript
- Zustand 또는 TanStack Store
- TanStack Query
- WebSocket event stream

초기 구현에서는 UI 반응성과 로컬 시스템 접근성을 우선합니다.

## 현재 구현

- Vite + React + TypeScript 기반 작업판
- 상단 Runtime Status Bar
- 좌측 네비게이션
- Conversation/Debate 중앙 전환
- Provider Profiles stub
- Agent/Memory/Backup 상태 패널
- 실제 명령 실행이 없는 Terminal/Run Log 슬롯
