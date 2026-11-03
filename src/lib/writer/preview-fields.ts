// Writer 산문 미리 보기(/api/writer/preview)가 실행 기록 state 에서 읽는 칸 — 이 칸만 DB 에 묻는다(2026-11-03 오너 QA 2번).
//   샷 설계(shotSequence · shotDesign) · 렌더 지시 · 데쿠파주 같은 큰 칸은 산문 화면이 쓰지 않는다 — 운영 3945d1e6 은 942KB 중 23KB 만 쓴다.
//   미리 보기 라우트가 state 에서 새 칸을 읽게 되면 여기에도 더한다(빠뜨리면 그 칸은 늘 비어 보인다). 약속: tests/writer/preview-read.test.ts
export const PREVIEW_STATE_FIELDS = [
  'input',
  'genre',
  '_proseSeed',
  '_proseLocked',
  'scenes',
  '_sceneStoryVersion',
  '_sceneStoryProposal',
  '_sceneStoryUndo',
  'characters',
  'dramaturgy',
  'world',
  'worldVisual',
  'v2Package',
] as const
