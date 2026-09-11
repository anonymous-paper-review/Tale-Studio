// Writer에서 Director로 이동할 의도와 조건 확인을 구분하고 앞서 사용자가 말한 목적지를 이어받는다.
import { expect, it } from 'vitest'
import { resolveDirectorHandoffIntent } from '@/lib/handoff-intent'

it('Writer에서 Director로 넘겨 달라고 하면 바로 옆 단계가 아니어도 이동 요청으로 알아듣는다.', () => {
  expect(resolveDirectorHandoffIntent('디렉터로 넘겨줘', 'writer', [])).toEqual({ mode: 'move' })
  expect(resolveDirectorHandoffIntent('Writer에서 Director로 넘겨줘', 'writer', [])).toEqual({ mode: 'move' })
  expect(resolveDirectorHandoffIntent('Director로 Writer에서 넘겨줘', 'writer', [])).toEqual({ mode: 'move' })
})
it('Director로 갈 수 있는지 묻는 질문은 실제 이동 없이 조건을 확인한다.', () => {
  expect(resolveDirectorHandoffIntent('디렉터러 넘길수잇어?', 'writer', [])).toEqual({ mode: 'check' })
  expect(resolveDirectorHandoffIntent('왜 Director로 못 넘어가?', 'writer', [])).toEqual({ mode: 'check' })
  expect(resolveDirectorHandoffIntent('다 되면 Director로 넘길 수 있어?', 'writer', [])).toEqual({ mode: 'check' })
})
it('사용자가 Director를 지정한 뒤 넘겨 달라고 하면 같은 목적지를 이어받는다.', () => {
  const history = [{ role: 'user' as const, content: '디렉터러 넘길수잇어?' }, { role: 'model' as const, content: '씬과 샷을 확인할게요.' }]
  expect(resolveDirectorHandoffIntent('넘겨줘', 'writer', history)).toEqual({ mode: 'move' })
  expect(resolveDirectorHandoffIntent('다되면 넘겨줘', 'writer', history)).toEqual({ mode: 'whenReady' })
})
it('모델 혼자 제안한 Director 이동은 사용자 이동 지시로 삼지 않는다.', () => {
  expect(resolveDirectorHandoffIntent('넘겨줘', 'writer', [{ role: 'model', content: 'Director로 넘길게요!' }])).toBeNull()
})
it('Director 이동을 취소하거나 인용만 하면 실행하지 않는다.', () => {
  for (const text of ['Director로 넘기지 마', 'Director로 이동하지 말아줘', '"Director로 넘겨줘"라는 문장 바꿔줘', 'Director 이동은 나중에', 'Do not hand over to Director', "Don't hand over to Director"]) {
    expect(resolveDirectorHandoffIntent(text, 'writer', [])).toBeNull()
  }
})
it('대사 변경과 이동을 함께 요청하면 대사 저장 완료 경로에서 처리한다.', () => {
  expect(resolveDirectorHandoffIntent('전체 대사를 한국어로 바꾸고 Director로 넘겨줘', 'writer', [])).toBeNull()
})
it('이전 Director 요청 뒤 Artist를 새 목적지로 지정했다면 Director로 보내지 않는다.', () => {
  expect(resolveDirectorHandoffIntent('넘겨줘', 'writer', [{ role:'user',content:'Director로 넘겨줘' },{role:'user',content:'Artist로 넘겨줘'}])).toBeNull()
})
