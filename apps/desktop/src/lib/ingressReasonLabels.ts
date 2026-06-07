export function ingressReasonLabel(reason: string): string {
  const direct: Record<string, string> = {
    "bot/manager author would create response loop": "봇/관리자 작성자는 응답 루프를 만들 수 있어 차단했습니다.",
    "dangerous actions require desktop/mobile approval": "위험 작업은 데스크톱/모바일 승인이 필요합니다.",
    "external user author accepted": "외부 사용자 작성자를 허용했습니다.",
    "external-agent checklist attached before session handoff": "세션 인계 전에 외부 에이전트 체크리스트를 붙였습니다.",
    "external channels are restricted from write, run, or secret access capabilities": "외부 채널은 파일 수정, 명령 실행, 비밀 접근 권한을 사용할 수 없습니다.",
    "external source marked untrusted": "외부 소스를 신뢰하지 않는 입력으로 표시했습니다.",
    "high confidence external input accepted": "신뢰도 높은 외부 입력을 허용했습니다.",
    "memory candidate stays quarantined until pinned": "기억 후보는 고정되기 전까지 격리 상태로 유지됩니다.",
    "message event kept": "메시지 이벤트를 유지했습니다.",
    "no prohibited external capability request detected": "금지된 외부 권한 요청이 감지되지 않았습니다.",
    "no sensitive request detected": "민감 요청이 감지되지 않았습니다.",
    "redacted event goes to Event Store; raw payload stays out of normal log": "원문은 일반 로그에 남기지 않고 마스킹 이벤트만 저장합니다.",
    "secret-like text redacted and approval required": "비밀값처럼 보이는 텍스트를 마스킹했고 승인이 필요합니다.",
    "sensitive action waits for approval": "민감 작업은 승인 대기 상태입니다.",
    "single message; merge window clear": "단일 메시지이며 병합 창은 비어 있습니다.",
    "system/noise event skipped before model wakeup": "시스템/노이즈 이벤트는 모델 호출 전에 건너뜁니다.",
    "terminal/write/secret capabilities stay denied for External Agent": "외부 에이전트의 터미널/쓰기/비밀 접근 권한은 계속 거부됩니다.",
  };

  if (direct[reason]) {
    return direct[reason];
  }

  const confidenceMatch = reason.match(/^(high|medium|low) confidence external input queued for approval$/);
  if (confidenceMatch) {
    const confidence = confidenceMatch[1] === "high" ? "높은" : confidenceMatch[1] === "medium" ? "중간" : "낮은";
    return `${confidence} 신뢰도의 외부 입력을 승인 대기열에 넣었습니다.`;
  }

  const payloadMatch = reason.match(/^(.+) payload normalized into IngressEvent$/);
  if (payloadMatch) {
    const channel = payloadMatch[1] ?? "외부";
    return `${channel.toUpperCase()} 페이로드를 인입 이벤트로 정규화했습니다.`;
  }

  const mergedMatch = reason.match(/^(\d+) messages merged in (\d+)ms window$/);
  if (mergedMatch) {
    return `${mergedMatch[1]}개 메시지를 ${mergedMatch[2]}ms 병합 창에서 합쳤습니다.`;
  }

  return reason;
}
