// 실행이 단계 사이에서 멈추는 자리 — 순수 판정(steps.ts runWriterSteps 가 쓴다).
//   ① 씬 스토리 확정 게이트(#s3-gate): storyCheck 뒤, 확정 전이면 awaiting_confirmation.
//   ② Artist 완료 게이트(리뉴얼 1차 2026-10-19): Artist 의 [만들기]로 이어 간 실행(input.artistGate)은
//      인물 · 배경 디자인(v2Design — 행 저장 · 그림 초안 발사) 뒤에 멈추고, [완료하기](/api/writer/artist-complete)가
//      _artistCompleted 를 켜면 씬 · 샷 나누기(08~15)로 이어 간다. artistGate 가 없는 예전 실행은 멈추지 않는다.
import type { WriterRunState } from './steps'

export type PauseStatus = 'awaiting_confirmation' | 'awaiting_artist'

export function pauseAfterStep(stepKey: string, state: WriterRunState): PauseStatus | null {
  if (stepKey === 'storyCheck' && state.input?.sceneGate === true && state._gateConfirmed !== true) return 'awaiting_confirmation'
  if (stepKey === 'v2Design' && state.input?.artistGate === true && state._artistCompleted !== true) return 'awaiting_artist'
  return null
}
