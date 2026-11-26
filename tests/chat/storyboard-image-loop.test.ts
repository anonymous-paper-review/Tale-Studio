// Storyboard 채팅이 그림만 고쳐 달라는 부탁에 실사 그림 요청만으로 답하면 도구 고리가 글 고치기(edit_project)를 다시 요구하지 않고 넘기고, 글 고치기가 섞인 부탁이면 예전처럼 실행을 확인하는지 검사한다
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
    const result = await runChatToolLoop({ request, execute: vi.fn(), requireEdit: true, imageOnlyRequest: true, ...scope() })
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

  // 왜(검토 2026-11-26 rev-director): "샷 2 대사를 '잘 가'로 바꾸고 다시 그려 줘"에 그림 요청만 내고 "바꿀게요"라고 하면 대사는 그대로다 —
  //   그림만 부탁한 말이 아니면 예전처럼 한 번 더 묻고, 끝내 글을 안 고치면 그림 요청도 넘기지 않고 못 했다고 말한다.
  it('글 고치기가 섞인 부탁에 실사 그림 요청만으로 답하면 예전처럼 고치기 도구를 요구하고, 끝내 안 하면 그림 요청도 넘기지 않는다', async () => {
    const imageOnly = { toolSupport: true, reply: '대사를 바꾸고 다시 그릴게요.', updates: [IMAGE] }
    const request = replies(imageOnly, imageOnly)
    const result = await runChatToolLoop({ request, execute: vi.fn(), requireEdit: true, imageOnlyRequest: false, ...scope() })
    expect(request).toHaveBeenCalledTimes(2)
    expect(result.stopped).toBe('no_edit')
    expect(result.data).not.toHaveProperty('updates')
  })

  // 왜(정상 경로 고정): 글 고치기가 섞인 부탁이라도 대사를 고치기 도구로 고치고 그림 요청을 내면 둘 다 한 것이다 — 둘 다 넘긴다.
  it('글 고치기가 섞인 부탁에 대사를 고치기 도구로 고친 뒤 그림 요청을 내면 고친 결과와 그림 요청을 함께 넘긴다', async () => {
    const edit = { type: 'tool_use', id: 'edit-1', name: 'edit_project', input: { resource: 'dialogue', id: 'sh_01_02', revision: 'r1', patch: { text: '잘 가' } } }
    const request = replies(
      { toolTurn: { content: [edit], stopReason: 'tool_use' } },
      { toolSupport: true, reply: '대사를 "잘 가"로 바꾸고 다시 그릴게요.', updates: [IMAGE] },
    )
    const execute = vi.fn(async () => ({ status: 'ok' as const }))
    const result = await runChatToolLoop({ request, execute, requireEdit: true, imageOnlyRequest: false, ...scope() })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.stopped).toBeUndefined()
    expect(result.data.updates).toEqual([IMAGE])
    expect(result.results.map((outcome) => outcome.call.name)).toEqual(['edit_project'])
  })
})
