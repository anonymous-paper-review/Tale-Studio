// 콘티 러프를 그리는 동안 진행 알약 · 대기 줄이 그 일을 "Writer 가 콘티를 그리고 있다"로 말하는지 검사한다 (오너 2026-11-26 O1 — 러프는 Writer 콘티가 그린다)
import { describe, expect, it } from 'vitest'
import { batchWorks, queueWorks, writerRoughWork } from '@/lib/pipeline-progress'
import type { GenerationBatch } from '@/lib/generation-batches'

// 이 시험을 위해 지은 콘티 러프 묶음(2샷 중 0샷 끝남).
const roughBatch = { lane: 'writer-rough', stage: 'writer', done: 0, total: 2, failed: 0 } as unknown as GenerationBatch

describe('콘티 러프 진행 말', () => {
  // 왜(O1 — 러프는 Writer 안의 콘티가 그린다, 리드 통합 2026-11-26): 레일 칸 · 색은 Writer 인데 글만 "Storyboard 가 …"라 하면
  //   아직 열리지도 않은 Storyboard 가 일하는 것으로 읽힌다(m-storyboard 관찰).
  it('콘티 러프 묶음은 어느 화면에서든 Writer 가 콘티를 그리고 있다고 말한다', () => {
    expect(batchWorks([roughBatch], 'ko')[0].label).toBe('Writer가 콘티를 그리고 있습니다')
    expect(batchWorks([roughBatch], 'en')[0].label).toBe('Writer is drawing the rough storyboard')
  })

  // 왜: 화면 상태로 세는 러프 줄(묶음 기록이 없을 때)도 같은 말을 써야 한 화면 안에서 말이 갈리지 않는다.
  it('화면 상태로 센 러프 줄도 Writer 가 콘티를 그리고 있다고 말한다', () => {
    const work = writerRoughWork([{ shotId: 's1', actionDescription: '걷는다', roughStoryboard: { status: 'generating' } }] as never, new Set(), 'ko')
    expect(work?.label).toBe('Writer가 콘티를 그리고 있습니다')
  })

  // 왜: 대기 줄(queue)도 같은 작업 종류의 말을 쓴다.
  it('대기 중인 러프 작업 줄도 Writer 가 콘티를 그리고 있다고 말한다', () => {
    expect(queueWorks({ shot_rough_storyboard: 2 }, 'ko')[0].label).toBe('Writer가 콘티를 그리고 있습니다')
  })
})
