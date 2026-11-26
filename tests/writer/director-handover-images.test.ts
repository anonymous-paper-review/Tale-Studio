// Storyboard → Director 넘기기 창(D0): 실사는 Storyboard [시작]이 만들어(오너 2026-11-26 m1126 S2 · 리드 결정) 창에 "넘어가면서 이미지 만들기" 고르기가 없고, 실사가 없는 샷 수를 알린다.
//   창에서 더는 고를 수 없던 "넘어가면서 이미지 만들기" 예전 길(handOverToDirector makeImages · entry-images-intent)은 지웠다(오너 2026-11-27 N5) — 남지 않았는지도 본다.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { directorConfirmView, directorHandoffSummary } from '@/lib/writer/board-summary'
import { realImageBatchMinutes } from '@/lib/director/generation-estimate'
import type { RoughStoryboardImage, Shot } from '@/types'

// 이 시험을 위해 지은 보드 — 씬 둘, 샷 셋(4초 · 2초 · 4초), 모두 러프가 있다.
const manifest = { scenes: [{ sceneId: 's1' }, { sceneId: 's2' }] }
const drawn = (shotId: string): RoughStoryboardImage => ({ status: 'completed', url: `https://x/${shotId}.png`, generatedAt: 1, frames: { start: 'a', direction: 'b', end: 'c' } }) as RoughStoryboardImage
const board = () => [
  { shotId: 'a1', sceneId: 's1', durationSeconds: 4, actionDescription: 'run', roughStoryboard: drawn('a1') },
  { shotId: 'a2', sceneId: 's1', durationSeconds: 2, actionDescription: 'stop', roughStoryboard: drawn('a2') },
  { shotId: 'b1', sceneId: 's2', durationSeconds: 4, actionDescription: 'look', roughStoryboard: drawn('b1') },
] as unknown as Shot[]
const extra = { characters: 2, backgrounds: 1, imagesToMake: 3, takesPerShot: 5 }

describe('Director 넘기기 창 — 실사는 Storyboard 에서', () => {
  // 왜(오너 2026-11-26 S2 · 리드 결정): 실사는 Storyboard [시작]이 만든다 — 넘기는 창에서 또 만들기를 고르게 하면 같은 일을 두 곳에서 고른다.
  it('넘기기 창에는 "넘어가면서 이미지 만들기" 고르기가 없다 — 실사는 Storyboard [시작]이 만든다', () => {
    const view = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', extra)
    expect(view).not.toHaveProperty('makeImages')
    expect(view).not.toHaveProperty('pickYourself')
    expect(view).not.toHaveProperty('defaultChoice')
    expect(view.description).toBeNull()
  })

  // 왜: 시안 D0 · 오너 답 11번(Take 값은 지금 계산 그대로) — 무엇이 넘어가고, 실사가 아직 없는 샷이 몇 개인지, 그다음에 Take 가 얼마 드는지 넘기기 전에 본다.
  //   실사가 없는 샷은 Director 에서도 만들 수 있다(오너 2026-11-26 S2 — 실사는 Storyboard [시작]이 만들고, 남은 것은 Director 의 [이미지 만들기]).
  it('넘기기 창은 넘어가는 것 · 다음 · 그다음 세 줄에 샷 · 초 · 인물 · 배경 · 러프 수, 실사 그림이 없는 샷 수, 샷마다 Takes 를 보인다', () => {
    const view = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', extra)
    expect(view.title).toBe('Director로 넘어갈까요?')
    expect(view.rows).toEqual([
      { label: '넘어가는 것', value: '샷 3 · 10초 · 인물 2 · 배경 1 · 콘티 3장' },
      { label: '다음', value: '실사 그림이 없는 샷 3개 · Director에서도 만들 수 있어요' },
      { label: '그다음', value: '이미지를 확인하고 영상을 만들어요 · 샷마다 5 Take' },
    ])
  })

  // 왜(정상 경로 고정): 실사가 다 있으면 넘어가서 바로 영상 차례다.
  it('실사 그림이 다 있으면 넘기기 창의 다음 줄은 "실사 이미지는 이미 다 있어요"다', () => {
    const view = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', { ...extra, imagesToMake: 0 })
    expect(view.rows[1].value).toBe('실사 이미지는 이미 다 있어요')
  })

  // 왜(검토 b 낮음 5): Take 과금이 꺼진 때는 노드의 Take 값도 숨긴다(#payments-phase-2) — 넘기기 창도 같은 규칙. 꺼진 때 보이라는 오너 답은 없다.
  it('Take 과금이 꺼져 있으면 Director 넘기기 창에 Take 값을 보이지 않는다', () => {
    const view = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', { ...extra, takesPerShot: null })
    expect(view.rows.slice(1)).toEqual([
      { label: '다음', value: '실사 그림이 없는 샷 3개 · Director에서도 만들 수 있어요' },
      { label: '그다음', value: '이미지를 확인하고 영상을 만들어요' },
    ])
  })

  // 왜(검토 b 낮음 7): 저장된 실사를 다 읽기 전이나 읽기에 실패했을 때 샷 전부를 실사 없는 수로 보였다 — 모르는 것은 모른다고, 아는 만큼만 보인다.
  it('Director 넘기기 창은 저장된 실사 그림을 다 읽기 전엔 실사 그림이 없는 샷 수를 "세는 중"으로, 읽기에 실패하면 "최대 N개"로 보인다', () => {
    const counting = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', { ...extra, imagesToMake: 'counting' })
    expect(counting.rows[1].value).toBe('실사 그림 · 세는 중')
    expect(counting.description).toBeNull()
    const unknown = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', { ...extra, imagesToMake: { atMost: 3 } })
    expect(unknown.rows[1].value).toBe('실사 그림이 없는 샷 최대 3개 · Director에서도 만들 수 있어요')
  })

  // 왜(혼자 정한 것): 예상은 실제 걸린 시간에서 — 일괄은 4샷 시트를 두 장씩 함께 그리고 시트 하나가 약 92초다(개발 DB p50). Director 툴바 예상과 같은 셈.
  it('실사 이미지 일괄 예상은 8샷마다 약 1.5분으로 셈해 분으로 올린다', () => {
    expect([0, 1, 6, 8, 10, 24].map(realImageBatchMinutes)).toEqual([0, 2, 2, 2, 4, 5])
  })
})

describe('넘어가면서 이미지 만들기 예전 길 없음', () => {
  // 왜(오너 2026-11-27 N5 "옛길 지워줘"): 넘기기 창에서 더는 고를 수 없는 길이 코드에 남아 있으면, 그 표시가 남았을 때 Director 에 들어가자마자
  //   실사 일괄이 저절로 시작될 수 있다 — 실사는 Storyboard [시작] · Director [이미지 만들기]를 사람이 누를 때만 만든다.
  it('Director 화면은 넘어온 뒤 저절로 실사 일괄을 시작하지 않는다 — 넘기기 창에서 고르는 예전 길이 없다', () => {
    expect(existsSync('src/lib/director/entry-images-intent.ts')).toBe(false)
    expect(readFileSync('src/app/studio/director/page.tsx', 'utf8')).not.toMatch(/ImagesOnDirectorEntry|entry-images-intent/)
    expect(readFileSync('src/features/writer/storyboard-director.ts', 'utf8')).not.toMatch(/makeImages|ImagesOnDirectorEntry/)
    expect(readFileSync('src/stores/global-chat-store.ts', 'utf8')).not.toMatch(/ImagesOnDirectorEntry|entry-images-intent/)
  })
})
