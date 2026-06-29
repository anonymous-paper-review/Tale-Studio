// safe-mode(#A) 재시도 상한 — 서버(generate-sheet 라우트)와 클라(UI 버튼 비활성) lockstep 공유.
//   client-safe(서버 전용 import 없음)라 컴포넌트에서 직접 쓸 수 있다.
export const SAFE_RETRY_CAP = 2
