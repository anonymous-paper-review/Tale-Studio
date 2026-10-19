// 예전 방식으로 이야기만 적어 두고 시작하지 않은 프로젝트는 Producer 시작 화면 아이디어 칸에 그 이야기를 채워 연다 (리뉴얼 1차 검토 2026-10-19)
import { describe, expect, it } from 'vitest'
import { entryDraftFor } from '@/lib/entry/draft'
import { IDEA_MAX_CHARS } from '@/features/entry/options'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const STORY = '비 오는 날 우산을 바꿔 든 두 사람이 서로의 우산을 돌려주려고 동네를 헤맨다.'

describe('예전 프로젝트의 이야기', () => {
  it('시작 화면 초안이 없고 예전에 적어 둔 이야기가 있으면 그 이야기를 아이디어 칸에 채운다', () => {
    // 왜: 리뉴얼 전 Producer 에 이야기만 적어 둔 프로젝트는 빈 시작 화면으로 열렸고, 그대로 [시작]을 누르면 적어 둔 이야기를 덮어썼다.
    expect(entryDraftFor({ entryDraft: null, storyText: STORY, stage: 'producer' }).idea).toBe(STORY)
  })

  it('시작 화면 초안이 있으면 예전 이야기로 덮지 않는다', () => {
    // 왜: 시작 화면에서 이미 고쳐 쓴 아이디어가 다시 열 때마다 옛 이야기로 돌아가면 안 된다.
    expect(entryDraftFor({ entryDraft: { idea: '새로 쓴 아이디어' }, storyText: STORY, stage: 'producer' }).idea).toBe('새로 쓴 아이디어')
  })

  it('새로 만든 프로젝트에는 이야기를 채우지 않는다', () => {
    // 왜: 새 프로젝트(참고 작품에서 이야기를 받아 온 경우 포함)는 아이디어를 사람이 직접 쓴다 — 남의 이야기가 아이디어 칸에 들어가지 않는다.
    expect(entryDraftFor({ entryDraft: null, storyText: STORY, stage: 'entry' }).idea).toBe('')
  })

  it('아이디어 칸보다 긴 이야기는 아이디어 칸 길이까지만 채운다', () => {
    // 왜: 아이디어 칸에는 길이 한도가 있다 — 넘치는 글을 채우면 저장할 때 잘린다.
    const long = '가'.repeat(IDEA_MAX_CHARS + 50)
    expect(entryDraftFor({ entryDraft: null, storyText: long, stage: 'producer' }).idea).toHaveLength(IDEA_MAX_CHARS)
  })
})
