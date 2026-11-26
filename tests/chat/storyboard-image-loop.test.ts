// Storyboard 채팅이 "고쳐 줘" 부탁에 실사 그림 요청만으로 답하면, 도구 고리가 글 고치기(edit_project)를 다시 요구하지 않고 그 요청을 화면에 넘기는지 검사한다
import { describe, expect, it, vi } from 'vitest'
import { runChatToolLoop } from '@/lib/chat-tools/loop'

const IMAGE = { type: 'generateImage', id: 'sh_01_02', change: 'Make her expression sadder' }
const scope = () => ({ signal: new AbortController().signal, isCurrent: () => true })

function replies(...responses: Array<Record<string, unknown>>) {
  const queue = [...responses]
  return vi.fn(async () => {
    const next = queue.shift()
    if (!next) throw new Error('이 시험이 준비하지 않은 추가 모델 요청')
    return next
  })
}

describe('Storyboard 채팅의 실사 그림 요청과 도구 고리', () => {
  // 왜(오너 O7 "채팅으로 고친다"): "@샷 2 이미지를 고쳐서 다시 만들어 줘"는 고치기 말이라 도구 고리가 글 고치기를 요구했다 —
  //   그림 요청 답을 "고치기를 안 했다"로 보고 한 번 더 묻고는 실패 답으로 바꿔 그림 요청을 버렸다(2026-11-26 개발 서버 실측).
  it('그림 고치기 부탁에 실사 그림 요청만으로 답하면 글 고치기를 다시 요구하지 않고 그 요청을 화면에 넘긴다', async () => {
    const request = replies({ toolSupport: true, reply: '샷 2를 더 슬픈 표정으로 다시 그릴게요.', updates: [IMAGE] })
    const result = await runChatToolLoop({ request, execute: vi.fn(), requireEdit: true, ...scope() })
    expect(request).toHaveBeenCalledTimes(1)
    expect(result.stopped).toBeUndefined()
    expect(result.data.updates).toEqual([IMAGE])
    expect(result.data.reply).toBe('샷 2를 더 슬픈 표정으로 다시 그릴게요.')
  })

  // 왜(정상 경로 고정 — tests/chat/tool-loop "실행을 재확인한 뒤에도 …"): 글 고치기가 섞이면 그 고치기는 도구로 해야 한다 — 지금처럼 다시 묻고, 안 하면 남은 변경을 넘기지 않는다.
  it('실사 그림 요청과 글 고치기가 섞인 답은 지금처럼 고치기 도구를 요구하고 안 하면 변경을 넘기지 않는다', async () => {
    const mixed = { toolSupport: true, reply: '고쳤어요.', updates: [IMAGE, { type: 'updateShot', id: 'sh_01_02', patch: { actionDescription: '슬픈 얼굴' } }] }
    const request = replies(mixed, mixed)
    const result = await runChatToolLoop({ request, execute: vi.fn(), requireEdit: true, ...scope() })
    expect(request).toHaveBeenCalledTimes(2)
    expect(result.stopped).toBe('no_edit')
    expect(result.data).not.toHaveProperty('updates')
  })
})
