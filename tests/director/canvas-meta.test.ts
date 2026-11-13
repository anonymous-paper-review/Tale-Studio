// Director 툴바의 "The Set" 옆 숫자가 캔버스에 보이는 노드와 그중 샷만 세는지 검사한다 (v3 D1, 2026-11-03)
import { describe, expect, it } from 'vitest'
import { directorCanvasMeta, storyboardCanvasMeta } from '@/features/director/canvas-meta'
import { translate } from '@/lib/i18n/translate'
import type { DirectorNode } from '@/types/director'

const node = (id: string, kind: string): DirectorNode =>
  ({ id, type: kind, position: { x: 0, y: 0 }, data: { kind, label: id } }) as unknown as DirectorNode
const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)

describe('혼자 정한 것', () => {
  // 왜: D1 시안의 "The Set 노드 9 · 샷 4" — 캔버스에서 눈으로 세는 수와 같아야 한다. 씬과 옛 파생 카드는 데이터만 남고 캔버스에 안 그린다(#scene-hide).
  it('캔버스에 보이는 노드 수와 그중 샷 수를 "노드 9 · 샷 4"처럼 쓰고, 숨긴 씬 · 옛 파생 카드는 세지 않는다', () => {
    const nodes = [
      node('scene-1', 'scene'),
      node('elias', 'asset'), node('mei', 'asset'), node('tram', 'asset'),
      node('shot-1', 'shot'), node('shot-2', 'shot'), node('shot-3', 'shot'), node('new-shot', 'shot'),
      node('video-1', 'video'), node('video-3', 'video'),
      node('old-image', 'shotImage'), node('old-video', 'videoPlaceholder'),
    ]
    expect(directorCanvasMeta(nodes, ko)).toBe('노드 9 · 샷 4')
  })

  // 왜: 빈 캔버스(아직 Writer 에서 씬이 안 넘어온 프로젝트)에 "노드 0 · 샷 0"을 붙이면 고장처럼 읽힌다 — 셀 것이 없으면 숫자를 쓰지 않는다.
  it('캔버스에 보이는 노드가 없으면 숫자를 쓰지 않는다', () => {
    expect(directorCanvasMeta([node('scene-1', 'scene')], ko)).toBeNull()
  })
})

describe('스토리보드형 개수', () => {
  // 왜: 시안 D1 스토리보드형 "The Set 씬 2 · 샷 4 · 12초" — 카드 보기에서는 노드가 아니라 씬 · 샷 · 길이를 센다(1110 확정).
  it('스토리보드형 개수는 "씬 2 · 샷 4 · 12초"처럼 씬 수 · 샷 수 · 샷 길이 합이다', () => {
    const shot = (id: string, seconds: number): DirectorNode =>
      ({ id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: id, durationSeconds: seconds } }) as unknown as DirectorNode
    const nodes = [node('scene-1', 'scene'), node('scene-2', 'scene'), shot('s1', 3), shot('s2', 3), shot('s3', 3.4), shot('s4', 2.6), node('v1', 'video')]
    expect(storyboardCanvasMeta(nodes, ko)).toBe('씬 2 · 샷 4 · 12초')
  })

  // 왜: 샷이 없으면 셀 것이 없다(빈 캔버스와 같은 규칙).
  it('샷이 없으면 스토리보드형 개수를 쓰지 않는다', () => {
    expect(storyboardCanvasMeta([node('scene-1', 'scene')], ko)).toBeNull()
  })
})
