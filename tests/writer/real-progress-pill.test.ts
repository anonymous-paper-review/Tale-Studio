// 채팅 진행 알약이 Storyboard 화면에서는 실사 그림 묶음을 "Storyboard 가 실사 그림을 만들고 있다"로 말하고, Director 화면에서는 지금 그대로인지 검사한다
import { describe, expect, it } from 'vitest'
import { batchWorks, screenBatchLabels } from '@/lib/pipeline-progress'
import type { GenerationBatch } from '@/lib/generation-batches'

// 이 시험을 위해 지은 실사 묶음(4샷 중 1샷 끝남).
const realBatch = { lane: 'director-storyboard', stage: 'director', done: 1, total: 4, failed: 0 } as unknown as GenerationBatch
const roughBatch = { lane: 'writer-rough', stage: 'writer', done: 0, total: 2, failed: 0 } as unknown as GenerationBatch

describe('채팅 진행 알약의 실사 그림 묶음', () => {
  // 왜(리드 2026-11-26 — Storyboard [시작] · 채팅 다시 그리기도 실사를 만든다): Storyboard 에서 만드는데 "Director 가 …"라고 하면 다른 화면에서 도는 일로 읽힌다.
  it('Storyboard 화면에서는 실사 그림 묶음을 Storyboard 가 실사 그림을 만들고 있다고 말하고 Storyboard 색을 쓴다', () => {
    const [ko] = screenBatchLabels(batchWorks([realBatch], 'ko'), 'writer', 'ko')
    expect(ko).toMatchObject({ label: 'Storyboard가 실사 그림을 만들고 있습니다', done: 1, total: 4, stage: 'writer' })
    const [en] = screenBatchLabels(batchWorks([realBatch], 'en'), 'writer', 'en')
    expect(en.label).toBe('Storyboard is making real images')
  })

  // 왜(정상 경로 고정): Director 화면 · 화면을 모르는 곳에서는 지금 그대로 Director 의 일로 말한다.
  it('Director 화면이나 화면을 모를 때는 실사 그림 묶음을 지금처럼 Director 의 일로 말한다', () => {
    expect(screenBatchLabels(batchWorks([realBatch], 'ko'), 'director', 'ko')[0]).toMatchObject({ label: 'Director가 촬영용 이미지를 생성하고 있습니다', stage: 'director' })
    expect(screenBatchLabels(batchWorks([realBatch], 'ko'), undefined, 'ko')[0].label).toBe('Director가 촬영용 이미지를 생성하고 있습니다')
  })

  // 왜(정상 경로 고정): 다른 묶음(콘티 러프 등)은 Storyboard 화면에서도 지금 그대로다.
  it('Storyboard 화면에서도 실사 그림이 아닌 묶음의 말은 그대로다', () => {
    expect(screenBatchLabels(batchWorks([roughBatch], 'ko'), 'writer', 'ko')[0]).toEqual(batchWorks([roughBatch], 'ko')[0])
  })
})
