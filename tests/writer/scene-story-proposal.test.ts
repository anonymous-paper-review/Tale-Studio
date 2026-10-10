// AI 수정안은 원본을 유지하고, 같은 씬의 수동 변경은 충돌로 알리며 다른 씬의 변경은 보존한다.
import { describe, expect, it } from 'vitest'
import { mergeSceneStoryProposal, sceneStoryProposalView, type SceneStoryProposal } from '@/lib/producer/scene-story-proposal'
import type { Scenes, StoryScene } from '@/lib/writer/types/pipeline'

const scene = (id: string, text: string) => ({ scene_id: id, scene_actions: [text], estimated_seconds: 12 }) as StoryScene
const base = (): Scenes => ({ scenes: [scene('s1', '첫 장면'), scene('s2', '다음 장면')], total_estimated_seconds: 24 })
const proposal = (): SceneStoryProposal => ({ id: 'p1', status: 'ready', feedback: '첫 씬 수정', createdAt: new Date().toISOString(), baseScenes: base(), scenes: { ...base(), scenes: [scene('s1', '수정한 첫 장면'), base().scenes[1]] } })

describe('씬 스토리 AI 수정안 병합', () => {
  // 같이 정한 것. 왜: 사용자가 적용하기 전에는 제안을 원문과 구분해서 읽어야 한다.
  it('AI 수정안을 읽으면 원문과 수정안을 따로 보여 준다', () => {
    const p = proposal()
    const view = sceneStoryProposalView(p, base())!
    expect(view.before[0].beats).toEqual(['첫 장면'])
    expect(view.after[0].beats).toEqual(['수정한 첫 장면'])
    expect(view.stale).toBe(false)
    expect(base().scenes[0].scene_actions).toEqual(['첫 장면'])
  })
  // 같이 정한 것. 왜: AI가 수정하는 사이 같은 씬을 사람이 고치면 덮어쓰면 안 된다.
  it('AI가 바꾼 씬을 직접 고쳤으면 이전 수정안을 적용하지 않는다', () => {
    const current = base()
    current.scenes[0].scene_actions = ['직접 고친 첫 장면']
    expect(mergeSceneStoryProposal(proposal(), current)).toBeNull()
    expect(sceneStoryProposalView(proposal(), current)?.stale).toBe(true)
  })
  // 혼자 정한 것(쉬움). 왜: 서로 다른 씬을 고쳤으면 이미 저장한 수동 변경을 보존할 수 있다.
  it('AI가 바꾸지 않은 씬을 직접 고쳤으면 두 수정 내용을 함께 보존한다', () => {
    const current = base()
    current.scenes[1].scene_actions = ['직접 고친 다음 장면']
    const merged = mergeSceneStoryProposal(proposal(), current)!
    expect(merged.scenes.map((s) => s.scene_actions[0])).toEqual(['수정한 첫 장면', '직접 고친 다음 장면'])
    expect(sceneStoryProposalView(proposal(), current)?.stale).toBe(false)
  })
  // 혼자 정한 것(쉬움). 왜: 씬을 추가·삭제하는 수정은 위치와 순서가 바뀌므로 안전하게 다시 제안한다.
  it('씬 구성이 달라진 동안 원문도 바뀌었으면 이전 수정안을 적용하지 않는다', () => {
    const p = proposal()
    p.scenes!.scenes.push(scene('s3', '추가 장면'))
    const current = base()
    current.scenes[1].scene_actions = ['직접 수정']
    expect(mergeSceneStoryProposal(p, current)).toBeNull()
    expect(mergeSceneStoryProposal(p, base())?.scenes).toHaveLength(3)
  })
  // 혼자 정한 것(쉬움). 왜: 잘못 생성된 중복 씬이나 빈 결과를 적용하면 이후 제작의 참조가 깨진다.
  it.each(['빈 결과', '중복 씬'])('수정안에 씬이 없거나 중복되면 원문에 적용하지 않는다 (%s)', (kind) => {
    const p = proposal()
    p.scenes!.scenes = kind === '빈 결과' ? [] : [scene('s1', 'A'), scene('s1', 'B')]
    expect(mergeSceneStoryProposal(p, base())).toBeNull()
  })
  // 혼자 정한 것(쉬움). 왜: 서버가 중단돼도 무한히 생성 중으로 남지 않아야 재시도할 수 있다.
  it('AI 수정안 생성이 제한 시간을 넘으면 원문을 유지하고 다시 요청할 수 있게 실패를 알린다', () => {
    const p = { ...proposal(), status: 'generating' as const, createdAt: '2026-10-01T00:00:00.000Z', scenes: undefined }
    expect(sceneStoryProposalView(p, base(), Date.parse('2026-10-01T00:06:00.000Z'))?.status).toBe('failed')
  })
})
