// 채팅 updates JSON 유출 방어 (임시 조치 2026-07-15) — 잘린/깨진 펜스가 raw 로 노출되지 않는 계약.
import { describe, expect, it } from 'vitest'
import { stripLeakedUpdatesBlock } from '@/lib/agentic-reply-guard'

describe('stripLeakedUpdatesBlock', () => {
  it('펜스가 없는 일반 응답은 그대로 통과한다', () => {
    const t = '와이드샷은 공간의 규모를 담으려는 의도예요.'
    expect(stripLeakedUpdatesBlock(t)).toBe(t)
  })

  it('닫히지 않은 ```json 펜스(max_tokens 잘림)는 잘라내고 안내 문구로 대체한다', () => {
    const t = '전체 76개 샷을 업데이트합니다.\n\n```json\n{"updates":[\n  {"type":"updateShot","id":"shot_1","patch":{'
    const out = stripLeakedUpdatesBlock(t)
    expect(out).toContain('전체 76개 샷을 업데이트합니다.')
    expect(out).toContain('나눠 다시 요청')
    expect(out).not.toContain('updateShot')
    expect(out).not.toContain('```json')
  })

  it('본문 없이 펜스로 시작하면 안내 문구만 남긴다', () => {
    const out = stripLeakedUpdatesBlock('```json\n{"updates":[')
    expect(out).toContain('나눠 다시 요청')
    expect(out).not.toContain('```')
  })
})
