// 영상을 만든 뒤 그 샷의 대사가 바뀌었는지 알 수 있게, 대사(화자 · 글)를 짧은 지문으로 남기고 지금 대사와 맞춰 본다 (오너 2026-11-22 E3)
import { describe, expect, it } from 'vitest'
import { dialogueChangedSince, dialogueFingerprint } from '@/lib/director/dialogue-fingerprint'
import { madeDialogueFingerprint } from '@/lib/director-video-takes'

const LINES = [
  { characterId: 'doyoon', text: '여기 맞아?', emotion: 'tired' },
  { characterId: null, text: 'He never came back.' },
]

describe('같이 정한 것', () => {
  // 왜: 영상 속 말은 만들 때의 대사 그대로인데 Editor 자막은 지금 대사를 따라간다 — 대사를 고치면 소리와 자막이 어긋난다(E3 · 방안 D2).
  it('Take 를 만든 뒤 대사 글이나 화자가 바뀌면 바뀌었다고 알리고, 그대로면 안 바뀌었다고 알린다', () => {
    const take = { madeDialogueFingerprint: dialogueFingerprint(LINES) }

    expect(dialogueChangedSince(take, LINES)).toBe(false)
    expect(dialogueChangedSince(take, [{ ...LINES[0], text: '여기가 맞아?' }, LINES[1]])).toBe(true)
    expect(dialogueChangedSince(take, [{ ...LINES[0], characterId: 'minji' }, LINES[1]])).toBe(true)
    expect(dialogueChangedSince(take, [LINES[1], LINES[0]])).toBe(true)
  })

  // 왜: 이 기능 전에 만든 Take 는 지문이 없다 — 바뀌었다고도 안 바뀌었다고도 말할 수 없다(화면은 표시하지 않는다).
  it('대사 지문이 없는 옛 Take 는 바뀌었는지 모른다고 알린다', () => {
    expect(dialogueChangedSince({ madeDialogueFingerprint: null }, LINES)).toBe('unknown')
    expect(dialogueChangedSince(null, LINES)).toBe('unknown')
  })
})

describe('혼자 정한 것', () => {
  // 왜: 자막과 소리가 어긋나는 것은 글이나 화자가 바뀔 때다 — 어조 · 말투나 띄어쓰기만 고친 것으로 "다시 만들어야 해요"를 띄우지 않는다.
  it('대사의 어조 · 말투만 바뀌거나 띄어쓰기만 다르면 대사가 바뀌지 않은 것으로 본다', () => {
    const take = { madeDialogueFingerprint: dialogueFingerprint(LINES) }

    expect(dialogueChangedSince(take, [{ ...LINES[0], emotion: 'angry', delivery: 'whisper' }, LINES[1]])).toBe(false)
    expect(dialogueChangedSince(take, [{ ...LINES[0], text: '  여기  맞아? ' }, LINES[1]])).toBe(false)
  })

  // 왜: 대사 없이 만든 영상에 나중에 대사를 더하면 영상 속에는 그 말이 없다 — 그것도 어긋남이다.
  it('대사가 없는 샷도 지문을 남겨, 나중에 대사가 생기면 바뀌었다고 알린다', () => {
    const silent = { madeDialogueFingerprint: dialogueFingerprint([]) }

    expect(dialogueChangedSince(silent, null)).toBe(false)
    expect(dialogueChangedSince(silent, LINES)).toBe(true)
  })

  // 왜: 지문을 만드는 방식을 나중에 바꾸면(d2 …) 옛 방식의 지문과 지금 대사를 같은 잣대로 견줄 수 없다 — "바뀜"으로 잘못 띄우지 않는다.
  it('지문 방식이 다른 기록은 바뀌었는지 모른다고 본다', () => {
    expect(dialogueChangedSince({ madeDialogueFingerprint: 'd2:0123abcd' }, LINES)).toBe('unknown')
  })

  // 왜: Take 카드는 지금 보이는 영상의 대사를 견준다 — 다시 만드는 중 · 실패한 시도의 지문은 지금 영상의 것이 아니다.
  it('Take 목록은 지금 영상을 낸 작업의 대사 지문을 싣고, 다시 만드는 중 · 실패한 시도의 지문은 싣지 않는다', () => {
    const video = 'https://media.test/ws/p/videos/clip-a/job-a.mp4'
    const take = { url: video, storage_path: 'ws/p/videos/clip-a/job-a.mp4' }
    const job = { id: 'job-a', status: 'completed', model: 'm', result_url: video, resolution: null, dialogue_fingerprint: dialogueFingerprint(LINES) }

    expect(madeDialogueFingerprint(take, job)).toBe(dialogueFingerprint(LINES))
    expect(madeDialogueFingerprint(take, { ...job, status: 'queued' })).toBeNull()
  })
})
