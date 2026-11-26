// Storyboard 채팅(글 고치기를 요구하지 않음 — 오너 2026-11-27 N3)이 실사 그림 요청만으로 답하면 도구 고리가 글 고치기(edit_project)를 다시 요구하지 않고 넘기고, 글 고치기를 요구하는 채팅은 예전처럼 실행을 확인하는지 검사한다
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
    // Storyboard 채팅은 글 고치기를 요구하지 않는다(오너 2026-11-27 N3 — 화면이 requireEdit 을 끈다).
    const result = await runChatToolLoop({ request, execute: vi.fn(), requireEdit: false, ...scope() })
    expect(request).toHaveBeenCalledTimes(1)
    expect(result.stopped).toBeUndefined()
    expect(result.data.updates).toEqual([IMAGE])
    expect(result.data.reply).toBe('샷 2를 더 슬픈 표정으로 다시 그릴게요.')
  })

  // 왜(정상 경로 고정 — tests/chat/tool-loop "실행을 재확인한 뒤에도 …"): 글 고치기를 요구하는 채팅(콘티)에서 답이 글 고치기를 JSON 으로 내면 도구로 해야 한다 —
  //   지금처럼 다시 묻고, 안 하면 그 답의 변경(같이 온 그림 요청 포함)을 넘기지 않는다. 검토 rev-flow 리드 5 — 이름을 검사하는 동작대로 바로잡음(N3 뒤 Storyboard 는 고치기를 요구하지 않는다).
  it('글 고치기를 요구하는 채팅은 답에 글 고치기 JSON 과 그림 요청이 섞여 와도 고치기 도구를 다시 요구하고, 끝내 안 하면 그 답의 변경을 넘기지 않는다', async () => {
    const mixed = { toolSupport: true, reply: '고쳤어요.', updates: [IMAGE, { type: 'updateShot', id: 'sh_01_02', patch: { actionDescription: '슬픈 얼굴' } }] }
    const request = replies(mixed, mixed)
    const result = await runChatToolLoop({ request, execute: vi.fn(), requireEdit: true, ...scope() })
    expect(request).toHaveBeenCalledTimes(2)
    expect(result.stopped).toBe('no_edit')
    expect(result.data).not.toHaveProperty('updates')
  })

  // 왜(오너 2026-11-27 N3 — Storyboard 채팅은 실사 고치기만, 글은 콘티로 안내): "샷 2 대사를 '잘 가'로 바꾸고 다시 그려 줘"에서 그림은 Storyboard 의 일이다 —
  //   예전처럼 글 고치기를 다시 요구하면 그림 요청까지 버리고 못 했다고 끝난다. 대사는 콘티 · 대사 탭에서 고친다.
  it('Storyboard 채팅은 대사를 바꾸고 다시 그려 달라는 부탁에 그림 요청만으로 답해도 다시 묻지 않고 그 그림 요청을 넘긴다', async () => {
    const imageOnly = { toolSupport: true, reply: '대사는 Writer 콘티에서 고칠 수 있어요. 그림은 다시 그릴게요.', updates: [IMAGE] }
    const request = replies(imageOnly)
    const result = await runChatToolLoop({ request, execute: vi.fn(), requireEdit: false, ...scope() })
    expect(request).toHaveBeenCalledTimes(1)
    expect(result.stopped).toBeUndefined()
    expect(result.data.updates).toEqual([IMAGE])
  })

  // 왜(정상 경로 고정): 글 고치기를 요구하는 채팅에서 고치기 도구로 고친 결과가 있으면 다 한 것이다 — 같은 답의 그림 요청도 함께 넘긴다.
  //   검토 rev-flow 리드 5 — 이름을 검사하는 동작대로 바로잡음(N3 뒤 Storyboard 는 고치기를 요구하지 않는다).
  it('글 고치기를 요구하는 채팅에서 고치기 도구로 고친 결과가 있으면, 같은 답의 그림 요청도 고친 결과와 함께 넘긴다', async () => {
    const edit = { type: 'tool_use', id: 'edit-1', name: 'edit_project', input: { resource: 'dialogue', id: 'sh_01_02', revision: 'r1', patch: { text: '잘 가' } } }
    const request = replies(
      { toolTurn: { content: [edit], stopReason: 'tool_use' } },
      { toolSupport: true, reply: '대사를 "잘 가"로 바꾸고 다시 그릴게요.', updates: [IMAGE] },
    )
    const execute = vi.fn(async () => ({ status: 'ok' as const }))
    const result = await runChatToolLoop({ request, execute, requireEdit: true, ...scope() })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.stopped).toBeUndefined()
    expect(result.data.updates).toEqual([IMAGE])
    expect(result.results.map((outcome) => outcome.call.name)).toEqual(['edit_project'])
  })
})
