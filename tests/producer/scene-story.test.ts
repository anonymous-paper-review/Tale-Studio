// Producer 씬 스토리 문서(트리트먼트)가 언제 무엇을 보여 주는지 검사한다
import { describe, expect, it } from 'vitest'
import { sceneStoryView } from '@/lib/producer/scene-story'

const base = { preserveScript: null, storyText: '용사 힘멜이 죽고 스무 해가 지났다.', locked: false, streamed: [], saved: [] }

describe('씬 스토리 문서가 보여 주는 내용', () => {
  it('대본을 그대로 보존한 프로젝트는 붙여 넣은 원본 대본을 보인다', () => {
    const script = 'S#1. 교실 / 낮\n하나: 안녕.'
    expect(sceneStoryView({ ...base, preserveScript: true, storyText: script, locked: true, streamed: ['다른 줄글'] })).toEqual({ kind: 'original', text: script })
  })

  it('Writer로 넘긴 프로젝트는 Writer가 쓴 씬 스토리를 씬마다 한 문단으로 보인다', () => {
    expect(sceneStoryView({ ...base, locked: true, streamed: ['첫 씬 줄글', '둘째 씬 줄글'], saved: ['요약'] })).toEqual({ kind: 'scenes', paragraphs: ['첫 씬 줄글', '둘째 씬 줄글'] })
  })

  it('Writer 실행 기록이 없는 옛 프로젝트는 저장된 씬 요약으로 대신 보인다', () => {
    expect(sceneStoryView({ ...base, locked: true, saved: ['씬 1 요약', '씬 2 요약'] })).toEqual({ kind: 'scenes', paragraphs: ['씬 1 요약', '씬 2 요약'] })
  })

  it('Writer로 넘겼지만 아직 쓴 씬이 없으면 쓰는 중이라고 알린다', () => {
    expect(sceneStoryView({ ...base, locked: true })).toEqual({ kind: 'writing' })
  })

  it('Writer로 넘기기 전에는 넘기면 씬 스토리가 생긴다고 알린다', () => {
    expect(sceneStoryView({ ...base, streamed: ['남은 줄글'], saved: ['남은 요약'] })).toEqual({ kind: 'empty' })
  })
})
