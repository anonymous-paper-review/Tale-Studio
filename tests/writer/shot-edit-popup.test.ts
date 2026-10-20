// Storyboard 샷 고치기 팝업(프로토타입 S2): 씬 안 번호 · 저장 뒤 다시 그리기 (2026-10-20 오너 "HTML 확인해서 팝업 수정")
import { describe, expect, it, vi } from 'vitest'
import { angleOfCamera, applyStartEdit, cameraWithAngle, redrawDirectionOnly, sceneShotLabel } from '@/lib/writer/shot-edit'

const manifest = { scenes: [{ sceneId: 'sc1' }, { sceneId: 'sc2' }] }
const shots = [
  { shotId: 'a', sceneId: 'sc1' },
  { shotId: 'b', sceneId: 'sc1' },
  { shotId: 'c', sceneId: 'sc2' },
  { shotId: 'd', sceneId: 'sc2' },
]

describe('샷 번호', () => {
  it('샷 고치기 팝업은 씬 안 순서로 "S2-1"처럼 부른다', () => {
    // 왜: 프로토타입 S2 제목 "S1-3 고치기" — 몇 번째 씬의 몇 번째 샷인지 한눈에 보인다.
    expect(sceneShotLabel(manifest, shots, 'b')).toBe('S1-2')
    expect(sceneShotLabel(manifest, shots, 'c')).toBe('S2-1')
  })

  it('목록에 없는 샷은 번호를 지어내지 않는다', () => {
    expect(sceneShotLabel(manifest, shots, 'zz')).toBeNull()
  })
})

describe('카메라 앵글', () => {
  it('앵글은 아이레벨 · 하이 앵글 · 로우 앵글이고 카메라 값과 서로 맞는다', () => {
    // 왜: 보드 카드 배지와 같은 규칙(pan 3 이상 = 로우, -3 이하 = 하이) — 고른 앵글이 카드에도 그대로 보인다.
    const base = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
    for (const angle of ['low', 'eye', 'high'] as const) expect(angleOfCamera(cameraWithAngle(base, angle))).toBe(angle)
    expect(cameraWithAngle(base, 'high')).toMatchObject({ horizontal: 0, zoom: 0 })
  })
})

describe('다시 그리는 순서', () => {
  it('[적용]은 바꾼 내용을 먼저 저장하고, 그 샷의 러프를 저장한 내용으로 다시 그린다', async () => {
    // 왜: 프로토타입 "시작을 고치면 연출도 따라 바뀐다" — 저장한 스토리 · 샷 타입으로 그 샷의 러프(시작 · 연출 · 끝)를 새로 그린다.
    //   한 장씩 다시 그리기는 지금 그림을 보고 고쳐 그려 바꾼 내용을 읽지 않는다(검토 지적).
    const order: string[] = []
    const ok = await applyStartEdit({
      save: async () => { order.push('save') },
      redrawShot: async () => { order.push('redraw'); return true },
    })
    expect(ok).toBe(true)
    expect(order).toEqual(['save', 'redraw'])
  })

  it('저장하지 못하면 다시 그리지 않는다', async () => {
    // 왜: 저장이 안 됐는데 그리면 옛 내용으로 그리고 비용만 든다.
    const redrawShot = vi.fn(async () => true)
    await expect(applyStartEdit({ save: async () => { throw new Error('save failed') }, redrawShot })).rejects.toThrow('save failed')
    expect(redrawShot).not.toHaveBeenCalled()
  })

  it('[연출만 다시 만들기]는 연출 그림만 다시 그린다', async () => {
    // 왜: 약속 I — 한 장을 다시 그려도 나머지는 그대로다.
    const regenerate = vi.fn(async () => true)
    expect(await redrawDirectionOnly({ save: async () => {}, regenerate })).toBe(true)
    expect(regenerate.mock.calls).toEqual([['direction']])
  })
})
