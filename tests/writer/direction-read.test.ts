// 연출 장을 읽은 한 줄이 그 연출 장이 지금 연출 장일 때만 지시에 쓰이는지 검사한다(D10 ② · 2026-11-22 오너 Q4 · 리드)
import { describe, expect, it } from 'vitest'
import { freshDirectionLine, freshDirectionRead } from '@/lib/writer/direction-read'

// 이 시험을 위해 지은 러프 기록 — 연출 장 주소에 ?v= 가 붙어 있다(저장 · 다시 그리기마다 바뀐다).
const DIRECTION = 'https://media.test/ws/p1/shots/sh_1_direction.png?v=200'
const rough = (directionRead: unknown, direction: string | undefined = DIRECTION) => ({
  status: 'completed',
  generatedAt: 200,
  frames: { start: 'https://media.test/ws/p1/shots/sh_1_start.png', direction, end: 'https://media.test/ws/p1/shots/sh_1_end.png' },
  directionRead,
})
const READ = { en: 'The figure on the left walks out of frame to the right.', ko: '왼쪽 인물이 화면 오른쪽 밖으로 걸어 나간다.', source: 'ai', direction: DIRECTION, at: 1 }

describe('연출 장을 읽은 줄', () => {
  // 왜: 영상 지시(fb-video)와 끝 장 그리기가 지금 연출 장의 의도만 실어야 한다(오너 Q4 "영상 지시에도 사용해줘").
  it('연출 장을 읽은 줄은 그 연출 장이 지금 연출 장일 때만 영어 줄을 돌려준다', () => {
    expect(freshDirectionLine(rough(READ))).toBe('The figure on the left walks out of frame to the right.')
    expect(freshDirectionRead(rough(READ))).toEqual(READ)
    // 사람이 고친 줄도 같다 — 한국어 화면용 줄이 없어도 영어 줄을 돌려준다.
    expect(freshDirectionLine(rough({ ...READ, source: 'user', ko: null, en: '  Camera pulls back to a wide shot.  ' }))).toBe('Camera pulls back to a wide shot.')
  })

  // 왜: 저장 · 연출 장 다시 그리기로 연출 장 주소가 바뀌면 옛 화살표를 읽은 줄이다 — 새 화살표의 지시가 되면 안 된다(리드 2026-11-22).
  it('연출 장 주소가 바뀌면 읽은 줄은 낡은 줄이라 지시에 쓰지 않는다', () => {
    const saved = rough(READ, 'https://media.test/ws/p1/shots/sh_1_direction.png?v=300')
    expect(freshDirectionLine(saved)).toBeNull()
    expect(freshDirectionRead(saved)).toBeNull()
  })

  // 왜(정상 경로 고정): 줄이 없는 옛 러프 · 연출 장이 없는 러프 · 망가진 기록에서도 영상 지시가 깨지지 않고 줄 없이 간다.
  it('읽은 줄이 없거나 모양이 틀리면 지시에 쓸 줄이 없다', () => {
    for (const value of [null, undefined, 'text', 42, [], {}, rough(undefined), { ...rough(READ), frames: { start: 'https://media.test/ws/p1/shots/sh_1_start.png' } }, rough({ ...READ, en: '   ' }), rough({ ...READ, en: 7 }), rough({ ...READ, direction: null })]) {
      expect(freshDirectionLine(value)).toBeNull()
    }
  })
})
