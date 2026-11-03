// Director 툴바의 "The Set" 옆 숫자가 캔버스에 보이는 노드와 그중 샷만 세는지 검사한다 (v3 D1, 2026-11-03)
import { describe, expect, it } from 'vitest'
import { directorCanvasMeta } from '@/features/director/canvas-meta'
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
