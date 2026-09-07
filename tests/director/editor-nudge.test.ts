import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { KO as ko } from '@/lib/i18n/messages-ko'

// #d10 (2026-08-27 오너) — "다 안 했는데 Editor로 넘어가라고 함".
//
// 예전 조건: nodes.some(video && videoUrl) — 영상이 **하나만** 있어도 참.
//   샷 14개 중 1개를 만든 사람에게도 "영상이 완성됐다"며 Editor 이동을 권했다.
//   문구까지 거짓이었다("You have a finished video").
// 지금: 샷 대비 영상 진행률이 기준 이상일 때만. 문구는 실제 수치를 말한다.

const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')

describe('D10 — Editor 이동 제안이 진행률을 본다', () => {
  it('영상 1개만으로 제안하던 조건이 남아 있지 않다', () => {
    // 되돌아간 형태: const hasRenderedVideo = nodes.some((n) => isVideoData(n.data) && !!n.data.videoUrl)
    expect(page).not.toMatch(/const hasRenderedVideo = nodes\.some\(\(n\) => isVideoData\(n\.data\) && !!n\.data\.videoUrl\)/)
  })

  it('샷 대비 영상 비율로 판정한다', () => {
    expect(page).toContain('EDITOR_NUDGE_MIN_RATIO')
    expect(page).toContain('videoReadyRatio')
    // 같은 샷에 테이크가 여러 개여도 1샷으로 세야 한다 — 부모 샷 기준 집합
    expect(page).toContain('shotsWithVideo')
    expect(page).toContain('parentShotNodeId')
  })

  it('기준이 1개도 100%도 아니다 — 마지막 몇 샷 남기고 편집 시작하는 흐름을 막지 않는다', () => {
    const m = page.match(/const EDITOR_NUDGE_MIN_RATIO = ([\d.]+)/)
    expect(m).toBeTruthy()
    const ratio = Number(m![1])
    expect(ratio).toBeGreaterThan(0.5)
    expect(ratio).toBeLessThanOrEqual(1)
  })

  it('문구가 실제 수치를 말한다 — "완성됐다"고 단정하지 않는다', () => {
    expect(page).not.toContain('You have a finished video.')
    expect(page).toContain('{done} of {total} shots have video')
    expect(ko['{done} of {total} shots have video. Shall we move to Editor and start assembling?']).toBeTruthy()
  })
})
