// 리뉴얼 1차: Artist 에서 만든 실행은 인물 · 배경 디자인 뒤 멈추고, 완료하기를 눌러야 씬 · 샷을 나눈다 (2026-10-19)
import { describe, expect, it } from 'vitest'
import { pauseAfterStep } from '@/lib/writer/pipeline/pause'
import { continueDraftState } from '@/lib/writer/treatment-draft'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'

const base = { input: { story: 's', sceneGate: true } } as unknown as WriterRunState

describe('실행이 멈추는 자리', () => {
  // 왜: 정상 경로 고정 — 씬 스토리 확정을 기다리는 예전 멈춤은 그대로다.
  it('씬 스토리 확정 전에는 이야기 점검 뒤 확정을 기다린다', () => {
    expect(pauseAfterStep('storyCheck', base)).toBe('awaiting_confirmation')
    expect(pauseAfterStep('storyCheck', { ...base, _gateConfirmed: true } as WriterRunState)).toBeNull()
  })

  // 왜: 리뉴얼에서는 Artist 가 인물 · 배경 그림을 만들고 [완료하기]를 눌러야 Storyboard(씬 · 샷 · 러프)로 간다.
  it('Artist 넘김으로 이어 간 실행은 인물 · 배경 디자인이 끝나면 완료하기를 기다린다', () => {
    const state = { ...base, _gateConfirmed: true, input: { ...base.input, artistGate: true } } as unknown as WriterRunState
    expect(pauseAfterStep('v2Design', state)).toBe('awaiting_artist')
    expect(pauseAfterStep('visualFormat', state)).toBeNull()
  })

  // 왜: [완료하기]를 누른 뒤에는 같은 자리에서 다시 멈추지 않고 씬 · 샷을 나눈다.
  it('완료하기를 누른 실행은 인물 · 배경 디자인 뒤에 멈추지 않는다', () => {
    const state = { ...base, _gateConfirmed: true, _artistCompleted: true, input: { ...base.input, artistGate: true } } as unknown as WriterRunState
    expect(pauseAfterStep('v2Design', state)).toBeNull()
  })

  // 왜: 배포 전에 시작한 예전 실행은 지금처럼 끝까지 이어 간다.
  it('Artist 넘김이 없는 예전 실행은 인물 · 배경 디자인 뒤에 멈추지 않는다', () => {
    expect(pauseAfterStep('v2Design', { ...base, _gateConfirmed: true } as WriterRunState)).toBeNull()
  })

  // 왜: Artist 의 [만들기]가 트리트먼트 초안을 이어 갈 때 멈춤 표시가 실행 입력에 실려야 한다.
  it('Artist 넘김 표시를 실어 이어 가면 실행 입력에 남는다', () => {
    const draft = { input: { story: '씨앗', treatmentDraft: true, sceneGate: true } } as unknown as WriterRunState
    const next = continueDraftState(draft, { story: '씨앗', sceneGate: true, artistGate: true } as never)
    expect(next.input.artistGate).toBe(true)
    expect(next._gateConfirmed).toBe(true)
  })
})
