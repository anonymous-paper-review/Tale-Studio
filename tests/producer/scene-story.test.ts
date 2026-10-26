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

  it('확정한 산문을 열면 본문을 다 읽기 전까지 씬 한 줄 요약 대신 불러오는 중으로 보인다', () => {
    // 왜: 확정 직후 Writer를 열면 S1~S4가 산문 본문 대신 한 줄 요약으로만 보였다(디자이너 QA 1차 #09).
    //   Artist [만들기]가 이어 가며 씬 한 줄 요약을 저장하는데, 본문(실행 기록)을 읽기 전에는 그 요약이 먼저 그려졌다.
    expect(sceneStoryView({ ...base, locked: true, saved: ['씬 1 요약', '씬 2 요약'], run: 'loading' })).toEqual({ kind: 'loading' })
  })

  it('Writer 실행 기록을 읽은 뒤 산문 본문이 있으면 저장된 씬 요약보다 본문을 보인다', () => {
    // 왜: 저장된 씬 요약은 실행 기록이 없는 옛 프로젝트를 위한 대신일 뿐이다 — 실행 기록이 있으면 산문 본문이 진짜다(디자이너 QA 1차 #09).
    expect(sceneStoryView({ ...base, locked: true, streamed: ['첫 씬 본문', '둘째 씬 본문'], saved: ['씬 1 요약', '씬 2 요약'], run: 'started' })).toEqual({ kind: 'scenes', paragraphs: ['첫 씬 본문', '둘째 씬 본문'] })
    // 실행 기록이 있는데 아직 본문이 없으면 요약으로 메우지 않고 쓰는 중이라고 알린다.
    expect(sceneStoryView({ ...base, locked: true, saved: ['씬 1 요약'], run: 'started' })).toEqual({ kind: 'writing' })
    // 실행 기록을 읽어 보니 없으면(옛 프로젝트) 지금처럼 저장된 요약으로 대신 보인다.
    expect(sceneStoryView({ ...base, locked: true, saved: ['씬 1 요약'], run: 'none' })).toEqual({ kind: 'scenes', paragraphs: ['씬 1 요약'] })
  })
})
