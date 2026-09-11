// native 편집과 JSON 편집이 같은 대상의 서로 다른 필드면 둘 다 보존한다
import { expect, it } from 'vitest'
import { omitRepeatedToolEdits, requestsSupportedChatEdit } from '@/lib/chat-tools/receipt'
import { writerToolRowPatch } from '@/lib/chat-tools/writer-save'
it('수정한 다음 이동하라는 문장에서 생성 금지가 수정 부분을 지우지 않는다', () => {
  // 왜: 이동 빠른 경로가 먼저 실행되어 샷 변경을 생략한 DEV 사례를 막는다.
  expect(requestsSupportedChatEdit('writer', '첫 번째 샷 길이를 10초로 바꾼 다음 Artist로 이동해줘. 이미지 생성은 하지 마.')).toBe(true)
  expect(requestsSupportedChatEdit('writer', '샷 길이를 변경하지 마. Artist로 이동해줘.')).toBe(false)
})
it('기존 JSON 씬 편집의 원문 인용도 실제 저장 필드로 보존한다', () => {
  // 왜: 공통 실행 경로로 옮겨도 기존에 편집 가능했던 필드를 누락하면 안 된다.
  expect(writerToolRowPatch('scenes', { originalTextQuote: '비가 내렸다.' })).toEqual({ original_text_quote: '비가 내렸다.' })
})
it('샷 길이를 도구로 처리해도 같은 샷 설명의 JSON 변경을 버리지 않는다', () => {
  // 왜: 대상 ID만 보고 중복 제거하면 한 문장에 요청한 두 변경 중 하나가 사라진다.
  const data = { updates: [{ type: 'updateShot', id: 's1', patch: { durationSeconds: 9, actionDescription: '새 설명' } }] }
  omitRepeatedToolEdits(data, [{ call: { type: 'tool_use', id: 'e', name: 'edit_project', input: { resource: 'shots', id: 's1', patch: { durationSeconds: 9 } } }, result: { status: 'ok' } }])
  expect(data.updates).toEqual([{ type: 'updateShot', id: 's1', patch: { actionDescription: '새 설명' } }])
})
it('언어를 도구로 처리해도 장르 JSON 변경을 버리지 않는다', () => {
  // 왜: 같은 설정 객체에 들어 있어도 서로 다른 사용자 요청이다.
  const data = { extractedSettings: { dialogueLanguage: 'ko', genre: '드라마' } }
  omitRepeatedToolEdits(data, [{ call: { type: 'tool_use', id: 'e', name: 'edit_project', input: { resource: 'settings', id: 'settings', patch: { dialogueLanguage: 'ko' } } }, result: { status: 'ok' } }])
  expect(data.extractedSettings).toEqual({ genre: '드라마' })
})
