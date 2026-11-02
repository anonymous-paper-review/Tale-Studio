// 채팅이 읽은 그대로의 대사(감정 · 말투 칸이 빈 줄)를 고쳐 보내도 저장 전 검사에서 막히지 않고, 이상한 값은 막는지 검사한다
import { describe, expect, it, vi } from 'vitest'

const rows = vi.hoisted(() => ({
  shots: [{
    shot_id: 'sh_03_12', scene_id: 'sc_03',
    dialogue_lines: [{ text: 'Hold on.', emotion: '', delivery: 'Low-toned and gentle', characterId: 'silent_janitor', durationHint: 0.5 }],
  }],
  characters: [{ character_id: 'silent_janitor' }],
} as Record<string, Array<Record<string, unknown>>>))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: (table: string) => ({ select: () => ({ eq: async () => ({ data: rows[table] ?? [], error: null }) }) }) }),
}))

import { createStudioToolResources } from '@/stores/chat-tool-bindings'

const resources = () => createStudioToolResources({ stage: 'writer', projectId: 'p', traceId: 't', signal: new AbortController().signal, isCurrent: () => true })

describe('채팅 대사 고치기 검사', () => {
  // 왜: 2026-10-31 영어 화면 QA — 파이프라인이 만든 대사는 감정 칸이 빈 글('')로 저장돼 있다. 채팅은 "읽은 칸을 빠짐없이 보존하라"는 지시대로
  //   빈 칸까지 보냈는데 검사가 그 칸을 덜어 낸 값과 달라졌다며 거절했다 — 첫 고치기가 실패하고 답에 "첫 저장이 실패했다"가 섞였다.
  //   저장은 검사가 다듬은 값(빈 칸을 덜어 낸 값)으로 한다(2026-11-01 리뷰 L6).
  it('채팅이 읽은 대사의 빈 감정 칸을 그대로 두고 글만 바꿔 보내도 고치기가 받아들여진다', async () => {
    const r = resources()
    await r.dialogue.read()
    const patch = { dialogueLines: [{ text: 'Wait right here.', emotion: '', delivery: 'Low-toned and gentle', characterId: 'silent_janitor', durationHint: 0.5 }] }
    const cleaned = { dialogueLines: [{ characterId: 'silent_janitor', text: 'Wait right here.', delivery: 'Low-toned and gentle', durationHint: 0.5 }] }
    expect(r.dialogue.validate(patch)).toEqual(cleaned)
    expect(r.shots.validate(patch)).toEqual(cleaned)
  })

  // 왜: 빈 칸을 받아 주더라도 없는 인물 · 모르는 칸은 지금처럼 막아야 한다(#F-003 R1 — 발명된 인물 id 가 저장되던 사고). 정상 경로 고정.
  it('등록되지 않은 인물의 대사나 모르는 칸은 지금처럼 고치기 전에 막는다', async () => {
    const r = resources()
    await r.dialogue.read()
    expect(() => r.dialogue.validate({ dialogueLines: [{ text: 'Hi', emotion: '', delivery: '', characterId: 'ghost', durationHint: 0 }] })).toThrow(/character IDs/)
    expect(() => r.shots.validate({ dialogueLines: [{ text: 'Hi', characterId: 'silent_janitor', mood: 'sad' }] })).toThrow(/character IDs/)
  })

  // 왜: 2026-11-01 리뷰 L6 — 빈 칸을 받아 주려던 고침이 감정 null · 길이 힌트 "2s" · 음수까지 받아 그대로 저장했다. 빈 칸은 ''(감정 · 말투)와
  //   길이 힌트 0 뿐이다(파이프라인은 감정에 ''를 쓰고, 팝업은 새 대사 줄 길이 힌트에 0을 쓴다).
  it('채팅 대사 고치기는 감정 null이나 이상한 길이 힌트("2s" · 음수)를 받지 않는다', async () => {
    const r = resources()
    await r.dialogue.read()
    const line = { text: 'Wait.', delivery: '', characterId: 'silent_janitor' }
    expect(() => r.dialogue.validate({ dialogueLines: [{ ...line, emotion: null, durationHint: 1 }] })).toThrow(/character IDs/)
    expect(() => r.dialogue.validate({ dialogueLines: [{ ...line, emotion: '', durationHint: '2s' }] })).toThrow(/character IDs/)
    expect(() => r.dialogue.validate({ dialogueLines: [{ ...line, emotion: '', durationHint: -1 }] })).toThrow(/character IDs/)
    expect(r.dialogue.validate({ dialogueLines: [{ ...line, emotion: '', durationHint: 0 }] })).toEqual({ dialogueLines: [{ characterId: 'silent_janitor', text: 'Wait.' }] })
  })
})
