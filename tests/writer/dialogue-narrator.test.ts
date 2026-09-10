// 내레이션 수정에서도 화자 없음과 대사 정보를 보존하며 발명된 인물은 허용하지 않는다.
import { expect, it } from 'vitest'
import { validateWriterUpdates } from '@/lib/writer-chat-updates'

it('내레이션을 수정해도 화자 없는 대사가 유지된다', () => {
  // 왜: 대사를 한국어로 바꿀 때 화자가 없는 내레이션을 잘못된 인물로 취급해 지우면 안 된다.
  const narration = { characterId: null, text: '새벽이었다.', delivery: 'V.O.', durationHint: 2 }
  const dialogue = { characterId: 'char_a', text: '안녕.', emotion: 'calm', delivery: 'soft', durationHint: 1 }
  const dropped: string[] = []
  const updates = validateWriterUpdates([
    { type: 'updateShot', id: 'shot-1', patch: { dialogueLines: [narration, dialogue, { characterId: 'invented', text: '모르는 인물' }] } },
  ], new Set(['char_a']), dropped)
  expect(updates).toEqual([{ type: 'updateShot', id: 'shot-1', patch: { dialogueLines: [narration, dialogue] } }])
  expect(dropped).toEqual(['invented'])
})
