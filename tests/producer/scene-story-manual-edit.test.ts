// 씬 스토리 직접 수정이 원래 씬과 저장 버전을 보존하고, 실패한 입력을 다시 저장할 수 있는지 검사한다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSceneStoryDraft, sceneStoryEdits, saveSceneStory } from '@/lib/producer/scene-story-edit'

afterEach(() => vi.unstubAllGlobals())

describe('씬 스토리 직접 수정', () => {
  it('씬 스토리를 직접 고치면 바꾸지 않은 씬의 원문과 순서를 유지한다', () => {
    const scenes = [
      { sceneId: 's1', index: 1, beats: ['char_1이 도착한다.', '문이 열린다.'], shotStories: [] },
      { sceneId: 's2', index: 2, beats: ['char_1이 떠난다.'], shotStories: [] },
    ]
    const draft = createSceneStoryDraft(scenes, [{ slug: 'char_1', name: '하나' }])
    expect(draft[0].text).toBe('하나가 도착한다.\n문이 열린다.')
    draft[1].text = '하나가 잠시 망설인다.\n하나가 떠난다.'
    expect(sceneStoryEdits(draft)).toEqual([
      { sceneId: 's1', beats: scenes[0].beats },
      { sceneId: 's2', beats: ['하나가 잠시 망설인다.', '하나가 떠난다.'] },
    ])
  })

  it('직접 고친 씬을 저장하면 열었을 때의 버전을 함께 보내고 다음 생성은 시작하지 않는다', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ ok: true, updatedAt: 'new-version' }))
    vi.stubGlobal('fetch', request)
    const scenes = [{ sceneId: 's1', beats: ['수정한 씬'] }]
    expect(await saveSceneStory('project-1', 'version-1', scenes)).toEqual({ ok: true })
    expect(request).toHaveBeenCalledOnce()
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ projectId: 'project-1', action: 'save', expectedUpdatedAt: 'version-1', scenes })
  })

  it('AI 수정안이 갱신되어도 직접 수정은 본문 버전을 기준으로 저장한다', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal('fetch', request)
    const scenes = [{ sceneId: 's1', beats: ['직접 고친 본문'] }]
    await saveSceneStory('p1', 'row-version', scenes, 'story-version')
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ projectId: 'p1', action: 'save', expectedUpdatedAt: 'row-version', expectedStoryVersion: 'story-version', scenes })
  })

  it('직접 수정 저장이 실패하면 실패 이유를 구분하고 같은 입력으로 다시 저장할 수 있다', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: 'Draft changed' }, { status: 409 }))
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(Response.json({ ok: true }))
    vi.stubGlobal('fetch', request)
    const scenes = [{ sceneId: 's1', beats: ['내가 고친 씬'] }]
    expect(await saveSceneStory('p1', 'v1', scenes)).toEqual({ ok: false, reason: 'conflict' })
    expect(await saveSceneStory('p1', 'v1', scenes)).toEqual({ ok: false, reason: 'failed' })
    expect(await saveSceneStory('p1', 'v1', scenes)).toEqual({ ok: true })
    expect(scenes).toEqual([{ sceneId: 's1', beats: ['내가 고친 씬'] }])
  })
})
