// Producer 씬 스토리 문서(트리트먼트)가 보여 줄 내용 고르기(2026-10-01 오너 "writer의 생성 중 파이프라인에서 보이는
//   scene 스토리를 합치고 싶어", "읽기 전용 문서야", 대본 보존 프로젝트는 "원본 보여줘"). 화면(scene-story-section)은
//   이 결과를 그리기만 한다.
export type SceneStoryView =
  | { kind: 'original'; text: string }
  | { kind: 'scenes'; paragraphs: string[] }
  | { kind: 'writing' }
  | { kind: 'empty' }

export function sceneStoryView(input: {
  preserveScript: boolean | null
  storyText: string
  /** Writer 로 넘긴 프로젝트(= Producer 잠김). */
  locked: boolean
  /** Writer 생성 화면과 같은 씬별 줄글(실행 기록에서). */
  streamed: string[]
  /** 저장된 씬 요약 — 실행 기록이 없는 옛 프로젝트의 대신. */
  saved: string[]
}): SceneStoryView {
  if (input.preserveScript === true && input.storyText.trim()) return { kind: 'original', text: input.storyText }
  // 넘기기 전에는 씬이 없다 — 남아 있는 옛 줄글·요약을 보이면 지금 이야기와 어긋난다.
  if (!input.locked) return { kind: 'empty' }
  if (input.streamed.length > 0) return { kind: 'scenes', paragraphs: input.streamed }
  if (input.saved.length > 0) return { kind: 'scenes', paragraphs: input.saved }
  return { kind: 'writing' }
}

/** 씬 스토리 칸이 트리트먼트 미리 보기를 불러올지. 보존 대본은 원본을 보여 주지만, 넘기기 전 초안이면
 *  트리트먼트가 만든 인물 · 장소를 카드로 옮기고 바탕이 바뀌었는지 견주려고 불러온다(2026-10-06 운영 제보). */
export function sceneStoryNeedsPreview(input: { hasTreatment: boolean; showOriginal: boolean; draftLive: boolean }): boolean {
  return input.hasTreatment && (input.draftLive || !input.showOriginal)
}
