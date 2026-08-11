// 채팅 updates JSON 유출 방어 (임시 조치 2026-07-15) — 잘린/깨진 펜스가 raw 로 노출되지 않는 계약.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseFencedJsonReply,
  parseFencedUpdates,
  stripLeakedUpdatesBlock,
  updatesFrom,
} from '@/lib/agentic-reply-guard'

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

// #p4-json-guard(2026-08-11) — 펜스 JSON 4상태 계약. 종전 갭: 복구 시도 없음 / artist 무방어 /
//   서버 로그 없음 / "펜스 없음(정상 대화)"과 "펜스 깨짐(사고)"을 구분 못 함.
describe('parseFencedJsonReply', () => {
  afterEach(() => vi.restoreAllMocks())

  const shot = (id: string) => `{"type":"updateShot","id":"${id}","patch":{"note":"x"}}`

  it('펜스가 없으면 실패가 아니라 순수 대화 턴(none)이다', () => {
    const r = parseFencedJsonReply('와이드샷은 공간의 규모를 담으려는 의도예요.', 'test')
    expect(r.status).toBe('none')
    expect(r.data).toBeNull()
    expect(updatesFrom(r.data)).toEqual([])
    expect(r.reply).toContain('와이드샷')
  })

  it('정상 펜스는 본문만 남기고 updates 를 넘긴다', () => {
    const text = `3개 바꿨어요.\n\n\`\`\`json\n{"updates":[${shot('a')},${shot('b')},${shot('c')}]}\n\`\`\``
    const r = parseFencedJsonReply(text, 'test')
    expect(r.status).toBe('ok')
    expect(updatesFrom(r.data)).toHaveLength(3)
    expect(r.reply).toBe('3개 바꿨어요.')
    expect(r.reply).not.toContain('```')
  })

  it('잘린 펜스는 온전한 항목만 살린다(종전: 전부 폐기) — 안내 문구는 검증 후 붙는다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 3번째 항목을 쓰다가 max_tokens 로 끊긴 형태 — 닫는 펜스 없음
    const text = `전체 76개 샷을 업데이트합니다.\n\n\`\`\`json\n{"updates":[${shot('a')},${shot('b')},{"type":"updateShot","id":"c","patch":{"note":"잘린`
    const r = parseFencedJsonReply(text, 'test')
    expect(r.status).toBe('recovered')
    expect(updatesFrom(r.data).length).toBeGreaterThan(0)
    expect(r.reply).toContain('전체 76개 샷을 업데이트합니다.')
    expect(r.reply).not.toContain('```') // raw 유출 없음
    expect(warn).toHaveBeenCalled() // 서버 신호
  })

  it('복구 불가면 raw 를 노출하지 않고 미적용을 알린다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = parseFencedJsonReply('설명입니다.\n\n```json\n이건 JSON 이 아니라 산문입니다\n```', 'test')
    expect(r.status).toBe('failed')
    expect(r.data).toBeNull()
    expect(r.reply).toContain('설명입니다.')
    expect(r.reply).not.toContain('```')
    expect(r.reply).toMatch(/읽지 못했|잘렸어요/)
    expect(warn).toHaveBeenCalled()
  })

  it('펜스 뒤에 후행 텍스트가 있어도 파싱한다(끝 고정 정규식의 사각)', () => {
    const text = `바꿨어요.\n\n\`\`\`json\n{"updates":[${shot('a')}]}\n\`\`\`\n\n추가 설명입니다.`
    const r = parseFencedJsonReply(text, 'test')
    expect(r.status).toBe('ok')
    expect(updatesFrom(r.data)).toHaveLength(1)
  })
})

// 부분 적용 안내는 "실제로 적용된 건수"여야 한다 — 화이트리스트가 떨어뜨린 항목까지 세면 과대 보고.
describe('parseFencedUpdates — 부분 적용 안내', () => {
  afterEach(() => vi.restoreAllMocks())

  const shot = (id: string) => `{"type":"updateShot","id":"${id}","patch":{"note":"x"}}`
  const passAll = (raw: unknown[]) => raw
  const truncatedText = `전체 76개 샷을 업데이트합니다.\n\n\`\`\`json\n{"updates":[${shot('shot_001')},${shot('shot_002')},{"type":"updateShot","id":"shot_003","patch":{"note":"잘린`

  it('잘리다 만 마지막 항목은 버린다 — 반쪽짜리 값이 커밋되면 안 된다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = parseFencedUpdates(truncatedText, 'test', passAll)
    // shot_003 은 patch.note 가 "잘린" 에서 끊겼다 — 구조는 닫히지만 내용이 반쪽이라 제외한다.
    expect(r.updates).toHaveLength(2)
    expect(JSON.stringify(r.updates)).not.toContain('shot_003')
  })

  it('복구 시 적용 건수와 재개 지점을 문구에 담는다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = parseFencedUpdates(truncatedText, 'test', passAll)
    expect(r.status).toBe('recovered')
    expect(r.reply).toContain(`${r.updates.length}건만 적용`)
    expect(r.reply).toContain('shot_002') // 마지막으로 반영된 항목 = 이어서 요청할 지점
    expect(r.reply).toContain('전체 76개 샷을 업데이트합니다.')
  })

  it('건수는 화이트리스트 통과분 기준이다(과대 보고 금지)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dropAllButOne = (raw: unknown[]) => raw.slice(0, 1)
    const r = parseFencedUpdates(truncatedText, 'test', dropAllButOne)
    expect(r.updates).toHaveLength(1)
    expect(r.reply).toContain('1건만 적용')
    expect(r.raw.length).toBeGreaterThan(1) // 원본은 더 많았지만 보고는 적용분 기준
  })

  it('정상 응답에는 안내를 붙이지 않는다', () => {
    const text = `2개 바꿨어요.\n\n\`\`\`json\n{"updates":[${shot('a')},${shot('b')}]}\n\`\`\``
    const r = parseFencedUpdates(text, 'test', passAll)
    expect(r.status).toBe('ok')
    expect(r.reply).toBe('2개 바꿨어요.')
  })
})
