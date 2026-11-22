// 원본 그대로(대본 보존) 실행인가 — 실행 입력의 "그대로 쓰기" 표시, 또는 대본에서 옮긴 씬(provenance source 'script')이 있으면 그렇다.
//   산문 고치기 막기(api/writer/scene-gate)와 [대사 다시 생성] 막기(api/writer/dialogue, D15 오너 2026-11-22)가 같은 규칙을 쓴다.
//   약속: tests/writer/preserved-dialogue-route.test.ts
import type { WriterRunState } from '@/lib/writer/pipeline/steps'

/** 화면 쪽 판별 — 그대로 쓰기를 고른 대본이 있다(산문 화면 features/prose/use-prose 의 showOriginal 과 같다). 프로듀서 스토어 값으로 본다. */
export function scriptKeptAsWritten(input: { preserveScript: boolean | null | undefined; storyText: string | null | undefined }): boolean {
  return input.preserveScript === true && (input.storyText ?? '').trim().length > 0
}

export function isPreservedScriptRun(state: Pick<WriterRunState, 'input' | 'scenes'> | null | undefined): boolean {
  if (!state) return false
  // 씬 목록이 빠진 실행(옛 실행 · 시험 자료)도 있다 — 없으면 대본에서 옮긴 씬이 없는 것으로 본다.
  const scenes = (state.scenes as { scenes?: Array<{ provenance?: { source?: string } }> } | undefined)?.scenes ?? []
  return state.input?.preserveScript === true || scenes.some((scene) => scene.provenance?.source === 'script')
}
