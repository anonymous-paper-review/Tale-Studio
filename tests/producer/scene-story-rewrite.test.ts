// 트리트먼트 다시 쓰기 — 세 정도 중 하나를 고르면 세 가지 안(v1·v2·v3)을 만들고, 바뀐 문단은 이전 글과 새 글을 함께 보인다 (2026-10-02 오너 · 시안 v04)
import { describe, expect, it } from 'vitest'
import {
  newRewriteProposal,
  rewriteDirections,
  rewriteLevelOf,
  treatmentDiff,
  variantProposal,
} from '@/lib/producer/scene-story-rewrite'
import { mergeSceneStoryProposal, sceneStoryProposalView } from '@/lib/producer/scene-story-proposal'
import type { Scenes, StoryScene } from '@/lib/writer/types/pipeline'

const scene = (id: string, beats: string[]): StoryScene => ({
  scene_id: id, act_ref: 'act_1', location: '운동장', time_of_day: '낮', narrative_time: 'present', characters_in_scene: [],
  purpose: 'conflict', emotion_beat: { start: '', end: '' }, dialogue_summary: '', info_asymmetry: 'audience=character', estimated_seconds: 20, scene_actions: beats,
})
const scenes = (...list: StoryScene[]): Scenes => ({ scenes: list, total_estimated_seconds: list.length * 20 })
const base = scenes(scene('s1', ['지아가 돌을 던진다.']), scene('s2', ['둘이 부딪힌다.']), scene('s3', ['수지가 돌을 놓는다.']))

describe('얼마나 바꿀지', () => {
  it('다시 쓰기 선택지를 고르면 그 정도로 알아듣는다', () => {
    expect(rewriteLevelOf('조금만 다듬기', 'ko')).toBe('polish')
    expect(rewriteLevelOf('Keep the story flow and rewrite the wording.', 'en')).toBe('reword')
    expect(rewriteLevelOf('사건과 결말까지 바꿔서 씬 스토리를 다시 써 주세요.', 'ko')).toBe('rethink')
    expect(rewriteLevelOf('2번 씬을 더 짧게 해줘', 'ko')).toBeNull()
  })

  it('세 안의 방향은 시안의 버전 꼬리표를 따른다', () => {
    expect(rewriteDirections('polish')).toEqual(['tidy', 'warmer', 'brisk'])
    expect(rewriteDirections('reword')).toEqual(['warmer', 'tense', 'brisk'])
    expect(rewriteDirections('rethink')).toEqual(['tense', 'warmer', 'brisk'])
  })

  it('다시 쓰기를 요청하면 세 안을 만드는 중으로 시작하고 트리트먼트는 그대로 둔다', () => {
    const proposal = newRewriteProposal({ id: 'p1', level: 'reword', feedback: '표현을 새로', baseScenes: base, createdAt: '2026-10-02T00:00:00.000Z' })
    expect(proposal.variants?.map((v) => [v.id, v.direction, v.status])).toEqual([
      ['v1', 'warmer', 'generating'], ['v2', 'tense', 'generating'], ['v3', 'brisk', 'generating'],
    ])
    expect(sceneStoryProposalView(proposal, base, Date.parse('2026-10-02T00:00:10.000Z'))).toMatchObject({ status: 'generating', level: 'reword', stale: false })
  })
})

describe('세 가지 안 고르기', () => {
  const at = Date.parse('2026-10-02T00:01:00.000Z')
  const ready = (beats: string) => ({ status: 'ready' as const, scenes: scenes(scene('s1', ['지아가 돌을 던진다.']), scene('s2', [beats]), scene('s3', ['수지가 돌을 놓는다.'])) })
  const withVariants = (patch: Array<Partial<NonNullable<ReturnType<typeof newRewriteProposal>['variants']>[number]>>) => {
    const proposal = newRewriteProposal({ id: 'p1', level: 'reword', feedback: '표현을 새로', baseScenes: base, createdAt: '2026-10-02T00:00:00.000Z' })
    return { ...proposal, variants: proposal.variants!.map((v, i) => ({ ...v, ...patch[i] })) }
  }

  it('세 안이 모두 나오면 셋 다 고를 수 있다', () => {
    const view = sceneStoryProposalView(withVariants([ready('따뜻하게 부딪힌다.'), ready('팽팽하게 부딪힌다.'), ready('부딪힌다.')]), base, at)
    expect(view?.status).toBe('ready')
    expect(view?.variants?.map((v) => [v.id, v.status, v.stale])).toEqual([['v1', 'ready', false], ['v2', 'ready', false], ['v3', 'ready', false]])
    expect(view?.variants?.[1].after[1].beats).toEqual(['팽팽하게 부딪힌다.'])
  })

  it('세 안 중 일부만 나오면 나온 안만 고를 수 있다', () => {
    const view = sceneStoryProposalView(withVariants([ready('따뜻하게 부딪힌다.'), { status: 'failed', error: 'scene_story_rewrite_failed' }, ready('부딪힌다.')]), base, at)
    expect(view?.status).toBe('ready')
    expect(view?.variants?.map((v) => v.status)).toEqual(['ready', 'failed', 'ready'])
  })

  it('셋 다 실패하면 실패로 보이고 트리트먼트는 그대로다', () => {
    const failed = { status: 'failed' as const, error: 'scene_story_rewrite_failed' }
    const view = sceneStoryProposalView(withVariants([failed, failed, failed]), base, at)
    expect(view?.status).toBe('failed')
  })

  it('한 안이라도 아직 만드는 중이면 만드는 중으로 보인다', () => {
    const view = sceneStoryProposalView(withVariants([ready('따뜻하게 부딪힌다.'), {}, {}]), base, at)
    expect(view?.status).toBe('generating')
    expect(view?.variants?.[0].status).toBe('ready')
  })

  it('고른 안을 적용하면 그 안의 씬이 트리트먼트가 된다', () => {
    const proposal = withVariants([ready('따뜻하게 부딪힌다.'), ready('팽팽하게 부딪힌다.'), ready('부딪힌다.')])
    const merged = mergeSceneStoryProposal(variantProposal(proposal, 'v2')!, base)
    expect(merged?.scenes.map((s) => s.scene_actions)).toEqual([['지아가 돌을 던진다.'], ['팽팽하게 부딪힌다.'], ['수지가 돌을 놓는다.']])
  })

  it('아직 나오지 않은 안은 적용하지 않는다', () => {
    const proposal = withVariants([ready('따뜻하게 부딪힌다.'), {}, {}])
    expect(variantProposal(proposal, 'v2')).toBeNull()
  })
})

describe('바뀐 문단 보이기', () => {
  it('바뀐 문단은 새 글과 이전 글을 함께 보이고 그대로인 문단은 한 번만 보인다', () => {
    const rows = treatmentDiff(
      [{ sceneId: 's1', text: '지아가 돌을 던진다.' }, { sceneId: 's2', text: '둘이 부딪힌다.' }],
      [{ sceneId: 's1', text: '지아가 돌을 던진다.' }, { sceneId: 's2', text: '둘이 팽팽하게 부딪힌다.' }],
    )
    expect(rows).toEqual([
      { kind: 'same', number: 1, after: '지아가 돌을 던진다.' },
      { kind: 'changed', number: 2, before: '둘이 부딪힌다.', after: '둘이 팽팽하게 부딪힌다.' },
    ])
  })

  it('새로 생긴 씬은 새 글만 보이고 없어진 씬은 이전 글만 보인다', () => {
    const rows = treatmentDiff(
      [{ sceneId: 's1', text: '하나' }, { sceneId: 's2', text: '둘' }, { sceneId: 's3', text: '셋' }],
      [{ sceneId: 's1', text: '하나' }, { sceneId: 's3', text: '셋' }, { sceneId: 's4', text: '넷' }],
    )
    expect(rows).toEqual([
      { kind: 'same', number: 1, after: '하나' },
      { kind: 'removed', number: null, before: '둘' },
      { kind: 'same', number: 2, after: '셋' },
      { kind: 'added', number: 3, after: '넷' },
    ])
  })
})
