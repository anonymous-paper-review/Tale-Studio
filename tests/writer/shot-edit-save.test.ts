// 샷을 고칠 때 바꾼 조명 · 카메라 앵글은 저장하고, 손대지 않은 조명 · 카메라 값은 다시 쓰지 않는다 · 저장이 끝나야 다시 그린다 (2026-10-20)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Shot } from '@/types'

type Write = { table: string; values: Record<string, unknown> }
const db = vi.hoisted(() => ({ writes: [] as Write[], fail: false }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: (table: string) => ({ update: (values: Record<string, unknown>) => {
    const query = {
      eq: () => query,
      then: (resolve: (value: unknown) => unknown) => { db.writes.push({ table, values }); return Promise.resolve({ data: null, error: db.fail ? { message: 'network down' } : null }).then(resolve) },
    }
    return query
  } }) }),
}))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))

import { flushShotSave, useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'

const shot: Shot = {
  shotId: 'sh1', sceneId: 'sc1', actionDescription: '민호가 자판기를 흔든다', shotType: 'MS', characters: [], durationSeconds: 3,
  generationMethod: 'T2V', dialogueLines: [],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
}

beforeEach(() => {
  db.writes.length = 0
  db.fail = false
  useWriterStore.getState().reset()
  useProjectStore.setState({ projectId: 'p1' })
  useWriterStore.setState({ shots: [structuredClone(shot)], sceneManifest: { scenes: [], characters: [], locations: [] } as never })
})

describe('샷 고치기 저장', () => {
  it('바꾼 조명과 카메라 앵글을 저장한다', async () => {
    // 왜: 프로토타입 S2 의 시작 묶음에 조명 · 앵글이 있다 — 팝업 칸은 러프가 그 값을 따르게 되는 2차에 연다. 그때 고친 값이 저장돼야 Director 에 쓰인다.
    useWriterStore.getState().updateShot('sh1', { lighting: { position: 'left', brightness: 70, colorTemp: 3200 }, camera: { ...shot.camera, pan: 5 } })
    await flushShotSave('sh1')

    const write = db.writes.find((w) => w.table === 'shots')!
    expect(write.values.lighting_config).toEqual({ position: 'left', brightness: 70, colorTemp: 3200 })
    expect(write.values.camera_config).toMatchObject({ pan: 5 })
  })

  it('스토리만 고치면 조명 · 카메라 값은 다시 쓰지 않는다', async () => {
    // 왜: 비어 있던 조명 · 카메라 칸을 화면의 기본값으로 채우면 Director 가 그 값을 사람이 정한 것으로 읽는다.
    useWriterStore.getState().updateShot('sh1', { actionDescription: '민호가 자판기를 발로 찬다' })
    await flushShotSave('sh1')

    const write = db.writes.find((w) => w.table === 'shots')!
    expect(write.values.action_description).toBe('민호가 자판기를 발로 찬다')
    expect(write.values).not.toHaveProperty('lighting_config')
    expect(write.values).not.toHaveProperty('camera_config')
  })

  it('저장을 기다렸다가 바로 쓸 수 있다', async () => {
    // 왜: [적용]은 저장이 끝난 뒤에 다시 그린다 — 저장 전에 그리면 옛 내용으로 그린다.
    useWriterStore.getState().updateShot('sh1', { actionDescription: '팀장이 캔을 받는다' })
    expect(db.writes).toHaveLength(0)
    await flushShotSave('sh1')
    expect(db.writes).toHaveLength(1)
  })

  it('저장에 실패하면 기다리던 쪽에 실패를 알린다', async () => {
    // 왜: [적용]은 저장이 끝나야 다시 그린다 — 저장이 실패했는데 그리면 옛 내용으로 그린다(검토 지적).
    db.fail = true
    useWriterStore.getState().updateShot('sh1', { actionDescription: '민호가 넘어진다' })
    await expect(flushShotSave('sh1')).rejects.toThrow('network down')
  })
})
