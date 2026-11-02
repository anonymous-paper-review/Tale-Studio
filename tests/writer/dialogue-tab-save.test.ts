// 대사 탭에서 고친 대사가 샷 고치기 팝업과 같은 길(샷 저장 · 사물함 무효화)로 저장되고, 러프 그리기 요청은 보내지 않는지 검사한다
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Shot } from '@/types'

const db = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; values: Record<string, unknown>; filters: Record<string, unknown> }>,
  fail: false,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        const write = { table, values, filters: {} as Record<string, unknown> }
        db.writes.push(write)
        const query = {
          eq: (key: string, value: unknown) => {
            write.filters[key] = value
            return query
          },
          then: (resolve: (value: { error: { message: string } | null }) => unknown) =>
            Promise.resolve({ error: db.fail ? { message: 'network down' } : null }).then(resolve),
        }
        return query
      },
    }),
  }),
}))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined), loadShotsResult: vi.fn() }))

import { saveShotDialogue } from '@/features/writer/dialogue-line-save'
import { commitLineEdit } from '@/lib/writer/dialogue-line-edit'
import { invalidateShots } from '@/lib/shots-cache'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

const line = { characterId: 'min_ho', text: '아, 또야?', emotion: 'annoyed', delivery: 'sigh', durationHint: 1 }
const shot: Shot = {
  shotId: 'sh_01_01', sceneId: 'sc_01', sortOrder: 0, shotType: 'MS', actionDescription: '민호가 자판기 앞에 선다.',
  characters: ['min_ho'], durationSeconds: 3, generationMethod: 'T2V', dialogueLines: [line],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
}
const fetchMock = vi.fn()

beforeEach(() => {
  db.writes.length = 0
  db.fail = false
  vi.mocked(invalidateShots).mockClear()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  useProjectStore.setState({ projectId: 'project-dialogue', currentStage: 'writer' })
  useWriterStore.setState({ sceneManifest: { scenes: [], characters: [], locations: [] }, shots: [shot], error: null })
})
afterEach(() => {
  useWriterStore.getState().reset()
  vi.unstubAllGlobals()
})

const edited = () => {
  const result = commitLineEdit({ lines: shot.dialogueLines, index: 0, original: line, draft: '아, 또 먹었어?' })
  if (result.kind !== 'save') throw new Error(`expected save, got ${result.kind}`)
  return result.lines
}

describe('대사 탭 바로 고치기의 저장', () => {
  // 왜: 리드 지시 — 팝업과 같은 저장 길이어야 사물함(30초 신선) · 다른 화면(Director · Editor)이 같은 대사를 본다.
  //   러프 그림 요청은 대사를 읽지 않으므로(writer/rough-prompt-dialogue) 대사만 고쳐서는 그림을 다시 그리지 않는다.
  it('대사 탭에서 고친 대사는 샷 고치기 팝업과 같은 저장 길로 저장하고 러프는 다시 그리지 않는다', async () => {
    await saveShotDialogue('sh_01_01', edited())
    expect(useWriterStore.getState().shots[0].dialogueLines).toEqual([{ ...line, text: '아, 또 먹었어?' }])
    const write = db.writes.find((item) => item.table === 'shots')
    expect(write?.values.dialogue_lines).toEqual([{ ...line, text: '아, 또 먹었어?' }])
    expect(write?.filters).toEqual({ project_id: 'project-dialogue', shot_id: 'sh_01_01' })
    expect(invalidateShots).toHaveBeenCalledWith('project-dialogue')
    expect(fetchMock).not.toHaveBeenCalled()
    const save = readFileSync('src/features/writer/dialogue-line-save.ts', 'utf8')
    const popup = readFileSync('src/features/writer/storyboard-shot-dialog.tsx', 'utf8')
    for (const source of [save, popup]) {
      expect(source).toMatch(/updateShot\(/)
      expect(source).toMatch(/flushShotSave\(/)
    }
  })

  // 왜: 저장이 실패했는데 "저장됨"처럼 닫히면 사람이 고친 글을 잃는다 — 화면은 쓴 글을 그대로 두고 [다시 저장]을 준다(팝업의 다시 저장과 같은 길).
  it('대사 저장에 실패하면 실패를 알리고 쓴 글은 화면에 그대로 남는다', async () => {
    db.fail = true
    await expect(saveShotDialogue('sh_01_01', edited())).rejects.toThrow('network down')
    expect(useWriterStore.getState().shots[0].dialogueLines[0].text).toBe('아, 또 먹었어?')
    expect(invalidateShots).not.toHaveBeenCalled()
  })
})
