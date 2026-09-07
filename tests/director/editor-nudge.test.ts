// 영상이 충분히 준비되면 실제 진행 수치를 알려주고 Editor 작업을 제안한다 (#d10 2026-08-27 오너)
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

describe('D10 — 영상 준비 정도를 보고 Editor로 이동을 제안한다', () => {
  it('영상 하나만으로 Editor 이동을 제안하지 않는다', () => {
    // 되돌아간 형태: const hasRenderedVideo = nodes.some((n) => isVideoData(n.data) && !!n.data.videoUrl)
    expect(page).not.toMatch(/const hasRenderedVideo = nodes\.some\(\(n\) => isVideoData\(n\.data\) && !!n\.data\.videoUrl\)/)
  })

  it('전체 샷 가운데 영상이 준비된 비율을 보고 제안한다', () => {
    expect(page).toContain('EDITOR_NUDGE_MIN_RATIO')
    expect(page).toContain('videoReadyRatio')
    // 같은 샷에 테이크가 여러 개여도 1샷으로 세야 한다 — 부모 샷 기준 집합
    expect(page).toContain('shotsWithVideo')
    expect(page).toContain('parentShotNodeId')
  })

  it('영상이 절반을 넘게 준비되면 남은 샷이 있어도 Editor에서 편집을 시작할 수 있다', () => {
    const m = page.match(/const EDITOR_NUDGE_MIN_RATIO = ([\d.]+)/)
    expect(m).toBeTruthy()
    const ratio = Number(m![1])
    expect(ratio).toBeGreaterThan(0.5)
    expect(ratio).toBeLessThanOrEqual(1)
  })

  it('완성됐다고 단정하지 않고 준비된 샷 수를 안내한다', () => {
    expect(page).not.toContain('You have a finished video.')
    expect(page).toContain('{done} of {total} shots have video')
    expect(ko['{done} of {total} shots have video. Shall we move to Editor and start assembling?']).toBeTruthy()
  })
})
