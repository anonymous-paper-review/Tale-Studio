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

/** 원작 그대로면 콘티 채팅(api/writer/chat)에 싣는 지시 — 사용자가 짚은 줄 · 새로 준 글만 고치고 대사를 통째로 새로 쓰지 않는다(D15, 리드 2026-11-22).
 *  원작 그대로가 아니면 빈 글(지시 없음). LLM 프롬프트라 한국어로 둔다. 약속: tests/writer/preserved-dialogue-chat.test.ts */
export function preservedScriptChatDirective(preserved: boolean): string {
  if (!preserved) return ''
  return '\n\n[원작 그대로] 이 작품은 원작 대본의 대사를 그대로 쓴다. 대사(dialogueLines)는 사용자가 짚은 줄 · 새로 준 글만 고친다 — 다른 줄의 글은 그대로 두고, 대사를 통째로 새로 쓰지 않는다. 사용자가 대사를 새로 지어 달라고 하면 고치지 말고, 원작 대사를 지키는 작품이라 AI가 대사를 새로 쓰지 않으며 줄을 눌러 직접 고칠 수 있다고 알려라.' // i18n-ok: LLM 프롬프트 디렉티브
}
