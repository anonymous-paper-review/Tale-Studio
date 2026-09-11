// Artist에서 그림을 직접 조회해 달라는 요청은 화면 요약이 '없음'이어도 저장소 조회로 이어진다.
import { describe, expect, it, vi } from 'vitest'
import { runChatToolLoop } from '@/lib/chat-tools/loop'
import { requestsImageInspection } from '@/lib/chat-tools/receipt'

type Block = { type: string; [key: string]: unknown }
type Reply = { reply?: string; toolTurn?: { content: Block[]; stopReason: string }; [key: string]: unknown }
const inspectCall = { type: 'tool_use', id: 'inspect-future', name: 'inspect_project', input: { target: 'character', id: 'char_doyun', appearanceKey: 'future', includeImage: true } } as const
function sequence(responses: Reply[]) {
  const sent: unknown[][] = []
  const queue = [...responses]
  const request = vi.fn(async (messages: unknown[]) => {
    sent.push(structuredClone(messages))
    const next = queue.shift()
    if (!next) throw new Error('이 테스트가 준비하지 않은 추가 모델 요청')
    return next
  })
  return { request, sent }
}
const scope = () => ({ signal: new AbortController().signal, isCurrent: () => true })

describe('그림 조회 요청 판정', () => {
  it('Artist에서 특정 모습의 그림을 직접 조회·확인해 달라는 문장을 인식한다', () => {
    // 왜: DEV 실측에서 이 문장들에 모델이 화면 요약만 보고 도구 없이 답했다.
    expect(requestsImageInspection('artist', '도윤의 미래 모습 이미지를 직접 조회해서 옷 색을 확인해줘. 이미지가 없으면 다른 모습으로 대신 보지 말고 알려줘. 생성이나 수정은 하지 마.')).toBe(true)
    expect(requestsImageInspection('artist', '지금 선택한 이 그림의 옷 색과 저장된 외형 설명이 맞아? 실제 그림을 보고 비교만 해줘. 수정하거나 새로 생성하지 마.')).toBe(true)
    expect(requestsImageInspection('artist', '지금 선택한 배경 그림과 저장된 설명이 맞는지 실제 이미지를 보고 비교해줘. 장소의 실내외와 조명 색을 확인해줘. 수정과 생성은 하지 마.')).toBe(true)
    expect(requestsImageInspection('artist', 'Look at the future sheet of Doyun and check the coat color. Do not generate anything.')).toBe(true)
  })
  it('그림을 볼 필요 없다고 한 조회, 일반 상담, 생성 요청, Writer 단계는 강제 조회 대상이 아니다', () => {
    // 왜: 일반 상담이나 설명 조회에 이미지 조회를 강제하면 불필요한 왕복이 생긴다.
    expect(requestsImageInspection('artist', '도윤의 모든 모습 이름과 각 모습에 저장된 외형 설명을 조회해서 비교해줘. 이미지는 볼 필요 없고 수정도 하지 마.')).toBe(false)
    expect(requestsImageInspection('artist', '노란 우비가 잘 어울리는 배경 색을 추천해줘.')).toBe(false)
    expect(requestsImageInspection('artist', '도윤의 미래 모습 이미지를 생성해줘.')).toBe(false)
    expect(requestsImageInspection('artist', '도윤 이미지를 새로 그려서 확인해줘.')).toBe(false)
    expect(requestsImageInspection('writer', '첫 샷 이미지를 확인해줘.')).toBe(false)
  })
})

describe('그림 조회 요청의 도구 재확인', () => {
  it('그림을 직접 조회해 달라는 요청에 도구 없이 답하면 한 번 재확인해 실제 조회로 이어간다', async () => {
    // 왜: 화면 요약의 no sheet는 보낼 때의 화면 상태일 뿐 현재 저장소 사실이 아니다.
    const first = '도윤의 미래 모습은 이미지가 없는 상태(no sheet)입니다.'
    const final = '저장소를 조회한 결과 미래 모습에는 아직 시트가 없어요.'
    const { request, sent } = sequence([
      { toolSupport: true, reply: first },
      { toolTurn: { content: [inspectCall], stopReason: 'tool_use' } },
      { toolSupport: true, reply: final },
    ])
    const execute = vi.fn(async () => ({ status: 'image_unavailable', message: 'No image was observed.' }))
    const result = await runChatToolLoop({ request, execute, requireInspection: true, ...scope() })
    expect(request).toHaveBeenCalledTimes(3)
    expect(execute).toHaveBeenCalledWith(inspectCall)
    const check = sent[1] as Array<{ role: string; content: Block[] }>
    expect(check).toHaveLength(2)
    expect(check[0]).toEqual({ role: 'assistant', content: [{ type: 'text', text: first }] })
    expect(check[1].role).toBe('user')
    expect(String(check[1].content[0].text)).toContain('inspect_project')
    expect(result.stopped).toBeUndefined()
    expect(result.data.reply).toBe(final)
  })
  it('재확인한 뒤에도 조회 도구를 쓰지 않으면 답을 지우지 않고 조회하지 않았음을 덧붙인다', async () => {
    // 왜: 모호해서 되묻는 답은 살리되, 화면 요약만 보고 있다/없다를 확인한 것처럼 끝내지 않는다.
    const reply = '도윤의 미래 모습은 이미지가 없는 상태(no sheet)입니다.'
    const { request } = sequence([{ toolSupport: true, reply }, { toolSupport: true, reply }])
    const execute = vi.fn()
    const result = await runChatToolLoop({ request, execute, requireInspection: true, locale: 'ko', ...scope() })
    expect(request).toHaveBeenCalledTimes(2)
    expect(execute).not.toHaveBeenCalled()
    expect(result.stopped).toBe('no_inspection')
    expect(result.data.reply).toContain(reply)
    expect(result.data.reply).toContain('조회하지 않았')
  })
  it('이미 저장소 목록을 조회한 답이나 도구를 지원하지 않는 응답은 재확인하지 않는다', async () => {
    // 왜: 목록 조회도 저장소의 hasImage를 확인한 것이고, 도구 없는 경로에 재요청을 보내면 안 된다.
    const listCall = { type: 'tool_use', id: 'inspect-list', name: 'inspect_project', input: { target: 'character', id: 'char_doyun' } } as const
    const listed = sequence([
      { toolTurn: { content: [listCall], stopReason: 'tool_use' } },
      { toolSupport: true, reply: '저장소 기준으로 미래 모습에는 시트가 없어요.' },
    ])
    const execute = vi.fn(async () => ({ status: 'ok', appearances: [{ appearanceKey: 'future', hasImage: false }] }))
    const listedResult = await runChatToolLoop({ request: listed.request, execute, requireInspection: true, ...scope() })
    expect(listed.request).toHaveBeenCalledTimes(2)
    expect(listedResult.stopped).toBeUndefined()
    expect(listedResult.data.reply).toBe('저장소 기준으로 미래 모습에는 시트가 없어요.')

    const unsupported = sequence([{ reply: '이 경로는 도구가 없어요.' }])
    const unsupportedResult = await runChatToolLoop({ request: unsupported.request, execute: vi.fn(), requireInspection: true, ...scope() })
    expect(unsupported.request).toHaveBeenCalledTimes(1)
    expect(unsupportedResult.stopped).toBeUndefined()
    expect(unsupportedResult.data.reply).toBe('이 경로는 도구가 없어요.')
  })
})
