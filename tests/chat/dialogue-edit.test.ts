// 채팅으로 대사만 고치기의 공용 길(Storyboard · Director 채팅) — 모델의 대사 고침(updateDialogue)을 콘티 채팅과 같은 줄 규칙으로 받아 콘티와 같은 고침 모양으로 넘기는지, 답 끝 안내 · AI 안내 — 를 검사한다 (오너 2026-11-27 Q1 "대사 수정 기능을 채팅창에서도")
import { describe, expect, it } from 'vitest'
import { DIALOGUE_EDIT_GUIDE, dialogueEditNotice, pickDialogueEdits } from '@/lib/writer/chat-dialogue-edit'

// 이 시험을 위해 지은 인물 둘과 칸이 다 찬 대사 한 줄.
const roster = new Set(['mina', 'joon'])
const kept = { characterId: 'mina', text: '가자.', emotion: '단호', delivery: '낮게', durationHint: 2, plannedTiming: 'start' }
const edit = (id: unknown, dialogueLines: unknown) => ({ type: 'updateDialogue', id, dialogueLines })

describe('채팅 대사 고치기 — 공용 서버 검증', () => {
  // 왜(오너 Q1 "채팅창에서도" · 콘티 채팅과 같은 메타 보존 규칙): 대사 고침은 그 샷의 전체 줄을 다시 내는 약속이라, 그대로 둔 줄의 칸이 빠지면
  //   영상 대사 절의 재료(감정 · 말투 · 길이 · 시점)가 소리 없이 지워진다(2026-08-31 실측). 내레이션은 null 그대로다.
  it('대사 고침은 콘티 채팅과 같은 줄 규칙으로 받는다 — 그대로 둔 줄의 감정 · 말투 · 길이 · 시점과 내레이션(null)이 남는다', () => {
    const lines = [kept, { characterId: null, text: '그날 밤.' }, { characterId: 'joon', text: '응.' }]
    expect(pickDialogueEdits([edit('sh_01_02', lines)], roster)).toEqual([{ type: 'updateShot', id: 'sh_01_02', patch: { dialogueLines: lines } }])
  })

  // 왜(#F-003 R1 — 발명한 인물 id 무검증 저장 금지): 없는 인물의 입에 대사를 넣지 않는다. 빠진 인물은 서버가 답 끝에 알린다(침묵 드롭 금지).
  it('등록되지 않은 인물의 대사 줄은 빼고 그 인물을 적으며, 쓸 수 있는 줄이 하나도 없는 고침은 받지 않는다', () => {
    const dropped: string[] = []
    expect(pickDialogueEdits([edit('sh_01_02', [kept, { characterId: 'ghost', text: '누구?' }])], roster, dropped)).toEqual([
      { type: 'updateShot', id: 'sh_01_02', patch: { dialogueLines: [kept] } },
    ])
    expect(dropped).toEqual(['ghost'])
    expect(pickDialogueEdits([edit('sh_01_02', [{ characterId: 'ghost', text: '누구?' }])], roster, [])).toEqual([])
  })

  // 왜(architecture §3 받을 모양만 받는다): 샷 id · 대사 목록이 없는 것, 다른 고침(이야기 · 샷)은 이 길로 넘기지 않는다.
  it('샷 id 가 없거나 대사 목록이 아니거나 대사 고침이 아니면 받지 않는다', () => {
    expect(pickDialogueEdits([
      edit(undefined, [kept]),
      edit('  ', [kept]),
      edit('sh_01_02', 'x'),
      { type: 'updateShot', id: 'sh_01_02', patch: { actionDescription: '다른 이야기' } },
      { type: 'generateImage', id: 'sh_01_02' },
      null,
    ], roster)).toEqual([])
  })

  // 왜(콘티와 같은 확인): 줄을 모두 지우는 것도 대사 고침이다 — 화면은 줄이 줄면 저장 전에 승인을 묻는다(writerShrinkDialogue).
  it('대사를 모두 지우는 고침(빈 목록)도 받는다 — 줄이 줄어 화면이 저장 전에 승인을 묻는다', () => {
    expect(pickDialogueEdits([edit('sh_01_02', [])], roster)).toEqual([{ type: 'updateShot', id: 'sh_01_02', patch: { dialogueLines: [] } }])
  })

  // 왜: 한 답에 같은 샷 대사 고침이 둘이면 둘 다 저장하며 앞 것이 뒤 것에 덮인다 — 마지막 뜻 하나만 넘긴다(그림 요청과 같은 규칙).
  it('한 답에 같은 샷의 대사 고침이 둘이면 뒤 것 하나만 받는다', () => {
    const later = [{ characterId: 'joon', text: '나중 것.' }]
    expect(pickDialogueEdits([edit('sh_01_02', [kept]), edit('sh_01_03', [kept]), edit('sh_01_02', later)], roster)).toEqual([
      { type: 'updateShot', id: 'sh_01_03', patch: { dialogueLines: [kept] } },
      { type: 'updateShot', id: 'sh_01_02', patch: { dialogueLines: later } },
    ])
  })

  // 왜(오너 Q1 · COMMON-3 "채팅 답은 새로 만드는 영상부터 들어가요를 알린다"): 이미 만든 Take 는 그대로다 — 모델 말에 기대지 않고 고정 문장을 붙인다.
  it('대사를 고친 답 끝 안내는 고친 대사가 새로 만드는 영상부터 들어간다고 채팅 말로 알린다', () => {
    expect(dialogueEditNotice('ko')).toBe('고친 대사는 새로 만드는 영상부터 들어가요.')
    expect(dialogueEditNotice('en')).toBe('New videos use the edited dialogue.')
  })

  // 왜: 모델은 보이는 칸만 다시 낼 수 있다 — 전체 줄을 내고 그대로 둔 줄의 칸을 옮기라는 말, 인물 id 규칙, 지우기 승인을 안내에 싣는다.
  it('AI 안내는 대사 고침 말과 콘티와 같은 줄 규칙(전체 줄 · 그대로 둔 줄의 칸 보존 · 인물 id 또는 내레이션 null · 지우기는 승인)을 알려 준다', () => {
    expect(DIALOGUE_EDIT_GUIDE).toContain('"type":"updateDialogue"')
    expect(DIALOGUE_EDIT_GUIDE).toMatch(/complete new list/i)
    for (const field of ['emotion', 'delivery', 'durationHint', 'plannedTiming']) expect(DIALOGUE_EDIT_GUIDE).toContain(field)
    expect(DIALOGUE_EDIT_GUIDE).toMatch(/null for narration/i)
    expect(DIALOGUE_EDIT_GUIDE).toMatch(/approve/i)
    expect(DIALOGUE_EDIT_GUIDE).not.toContain('"type":"updateShot"')
  })
})
