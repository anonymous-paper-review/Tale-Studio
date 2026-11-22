// 연출 장을 읽은 한 줄이 연출 장이 그대로이고 그 줄로 끝 장을 그렸을 때만 지시에 쓰이는지 검사한다(D10 ② · 2026-11-22 오너 Q4 · 리드 Q-a)
import { describe, expect, it } from 'vitest'
import { freshDirectionLine, freshDirectionRead, withEndDrawn } from '@/lib/writer/direction-read'

// 이 시험을 위해 지은 러프 기록 — 연출 장 · 끝 장 주소에 ?v= 가 붙어 있다(저장 · 다시 그리기마다 바뀐다).
const DIRECTION = 'https://media.test/ws/p1/shots/sh_1_direction.png?v=200'
const END = 'https://media.test/ws/p1/shots/sh_1_end.png?v=250'
const rough = (directionRead: unknown, frames: Record<string, string | undefined> = { direction: DIRECTION, end: END }) => ({
  status: 'completed',
  generatedAt: 250,
  frames: { start: 'https://media.test/ws/p1/shots/sh_1_start.png', ...frames },
  directionRead,
})
const READ = { en: 'The figure on the left walks out of frame to the right.', ko: '왼쪽 인물이 화면 오른쪽 밖으로 걸어 나간다.', source: 'ai', direction: DIRECTION, at: 1 }
const DRAWN = { ...READ, endDrawn: END }

describe('연출 장을 읽은 줄', () => {
  // 왜: 영상 지시(fb-video)는 끝 그림에 쓴 줄만 싣는다 — 끝 그림과 영상 글이 다른 움직임을 말하면 사용자 Take 가 버려진다(오너 Q4 · 리드 Q-a 2026-11-22).
  //   2026-11-22 문장 바꿈(리드 Q-a): 예전 '연출 장을 읽은 줄은 그 연출 장이 지금 연출 장일 때만 영어 줄을 돌려준다'.
  it('연출 장을 읽은 줄은 연출 장이 그대로이고 그 줄로 끝 장을 그려 끼웠을 때만 영어 줄을 돌려준다', () => {
    expect(freshDirectionLine(rough(DRAWN))).toBe('The figure on the left walks out of frame to the right.')
    // 사람이 고친 줄도 같다 — 한국어 화면용 줄이 없어도 영어 줄을 돌려준다.
    expect(freshDirectionLine(rough({ ...DRAWN, source: 'user', ko: null, en: '  Camera pulls back to a wide shot.  ' }))).toBe('Camera pulls back to a wide shot.')
    // 그 줄로 그린 끝 장이 지금 끝 장이 아니면(그 뒤 끝 장이 다른 줄로 바뀜) 쓰지 않는다.
    expect(freshDirectionLine(rough({ ...DRAWN, endDrawn: 'https://media.test/ws/p1/shots/sh_1_end.png?v=100' }))).toBeNull()
  })

  // 왜(리드 Q-a): [그대로]를 고르거나 끝 장 작업이 실패 · 버려지면 그 줄은 아직 쓰이지 않은 줄이다 — 편집기 아래 줄에는 남아
  //   나중에 [고쳐서 끝 장 다시 그리기]로 쓸 수 있지만, 영상에는 실리지 않는다.
  it('[그대로]를 골라 그 줄로 끝 장을 그리지 않았으면 그 줄은 화면에만 남고 영상 지시에는 쓰지 않는다', () => {
    expect(freshDirectionLine(rough(READ))).toBeNull()
    expect(freshDirectionRead(rough(READ))).toMatchObject({ en: READ.en, ko: READ.ko, source: 'ai', direction: DIRECTION, endDrawn: null })
  })

  // 왜: 그 줄로 그린 끝 장을 끼울 때 표시를 남겨야 영상 지시가 그 줄을 쓴다 — 줄이 그새 바뀌었으면(사람이 고침) 새 줄에는 남기지 않는다.
  it('그 줄로 그린 끝 장을 끼우면 러프 기록에 그 줄로 그렸다는 표시가 남는다', () => {
    const drawn = withEndDrawn(rough(READ).directionRead, { en: READ.en, direction: DIRECTION }, END)
    expect(freshDirectionLine(rough(drawn))).toBe(READ.en)
    expect(withEndDrawn({ ...READ, en: 'Someone else edited it.' }, { en: READ.en, direction: DIRECTION }, END)).toMatchObject({ en: 'Someone else edited it.', endDrawn: null })
    expect(withEndDrawn(undefined, { en: READ.en, direction: DIRECTION }, END)).toBeUndefined()
  })

  // 왜: 저장 · 연출 장 다시 그리기로 연출 장 주소가 바뀌면 옛 화살표를 읽은 줄이다 — 새 화살표의 지시가 되면 안 된다(리드 2026-11-22).
  it('연출 장 주소가 바뀌면 읽은 줄은 낡은 줄이라 지시에 쓰지 않는다', () => {
    const saved = rough(DRAWN, { direction: 'https://media.test/ws/p1/shots/sh_1_direction.png?v=300', end: END })
    expect(freshDirectionLine(saved)).toBeNull()
    expect(freshDirectionRead(saved)).toBeNull()
  })

  // 왜(정상 경로 고정): 줄이 없는 옛 러프 · 연출 장이 없는 러프 · 망가진 기록에서도 영상 지시가 깨지지 않고 줄 없이 간다.
  it('읽은 줄이 없거나 모양이 틀리면 지시에 쓸 줄이 없다', () => {
    for (const value of [null, undefined, 'text', 42, [], {}, rough(undefined), rough(DRAWN, { end: END }), rough({ ...DRAWN, en: '   ' }), rough({ ...DRAWN, en: 7 }), rough({ ...DRAWN, direction: null })]) {
      expect(freshDirectionLine(value)).toBeNull()
    }
  })
})
