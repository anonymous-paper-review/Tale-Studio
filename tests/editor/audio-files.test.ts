// 오디오 탭 파일 목록 — 목록에서 파일을 빼도 타임라인 소리 조각이 쓰는 소리 파일(이 브라우저 저장소)은 지우지 않는지 검사한다 (검토 b 범위 밖, 리드 2026-11-14)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
  return { projectId: 'project-audio-files' as string | null, deleteAudioBlob: vi.fn(async () => {}) }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign((pick: (s: { projectId: string | null }) => unknown) => pick({ projectId: mocks.projectId }), {
    getState: () => ({ projectId: mocks.projectId }),
  }),
}))
vi.mock('@/lib/editor-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/editor-persistence')>()),
  deleteAudioBlob: mocks.deleteAudioBlob,
}))

import { useEditorStore } from '@/stores/editor-store'
import type { AudioSource } from '@/types'

const api = () => useEditorStore.getState()
const source = (id: string, blobKey: string): AudioSource => ({ id, name: `${id}.mp3`, url: `blob:local/${id}`, durationSec: 10, blobKey, kind: 'audio' })

beforeEach(() => {
  localStorage.clear()
  mocks.deleteAudioBlob.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  api().reset()
  useEditorStore.setState({ loadStatus: 'ready' })
})
afterEach(() => {
  vi.unstubAllGlobals()
  ;(globalThis as { window?: unknown }).window = globalThis
  localStorage.clear()
})

describe('같이 정한 것 — 리드 11/14', () => {
  it('오디오 탭에서 파일을 목록에서 빼도 타임라인의 오디오 클립이 그 파일을 쓰고 있으면 소리 파일(IndexedDB blob)을 지우지 않는다 — 다시 열어도 그 클립의 소리가 남는다', () => {
    // 왜: 검토 b(범위 밖, main 43727d13 에도 있던 고장) — 빼기는 같은 파일을 쓰는 "목록 항목"만 보고 파일을 지워, 다시 열면 그 파일을 쓰던
    //   타임라인 소리 조각이 소리를 잃었다(사람이 올린 음악을 잃을 수 있다). 다시 열 때 조각은 파일 열쇠(blobKey)로 소리를 다시 잇는다.
    api().addAudioSource(source('music', 'blob-music'))
    const clip = api().addAudioClipFromSource('music', 2)!
    api().removeAudioSource('music')
    expect(api().audioSources).toEqual([])
    expect(mocks.deleteAudioBlob).not.toHaveBeenCalled()
    expect(api().audioClips.find((a) => a.id === clip)).toMatchObject({ blobKey: 'blob-music', startSec: 2 })
    // 아무 조각도 쓰지 않는 파일은 지금처럼 지운다(정상 경로).
    api().addAudioSource(source('voice', 'blob-voice'))
    api().removeAudioSource('voice')
    expect(mocks.deleteAudioBlob).toHaveBeenCalledWith('blob-voice')
  })
})

describe('혼자 정한 것', () => {
  it('되돌리기로 다시 살릴 수 있는 소리 조각이 그 파일을 쓰고 있어도 소리 파일을 지우지 않는다', () => {
    // 왜: 조각을 지운 뒤 목록에서 파일을 빼고 되돌리기로 조각을 살리면, 살아난 조각의 파일이 이미 지워져 다시 열 때 소리가 없었다.
    api().addAudioSource(source('music', 'blob-music'))
    const clip = api().addAudioClipFromSource('music', 0)!
    api().removeAudioClip(clip)
    api().removeAudioSource('music')
    expect(mocks.deleteAudioBlob).not.toHaveBeenCalled()
    api().undo()
    expect(api().audioClips.find((a) => a.id === clip)?.blobKey).toBe('blob-music')
  })
})
