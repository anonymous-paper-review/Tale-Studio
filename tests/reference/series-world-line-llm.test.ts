// 다음 화를 만들 때 앞 화 세계 한 줄을 묻는 AI 호출이 한 번 실패하면 한 번 더 묻는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  flush: vi.fn(async () => 0),
}))

vi.mock('@/lib/writer/llm/dispatch', () => ({
  DEFAULT_MODELS: { S: { provider: 'gemini', model: 'gemini-test' } },
  generateJson: mocks.generateJson,
}))
vi.mock('@/lib/writer/logger', () => ({
  PipelineLogger: class {
    flushRawLlm = mocks.flush
  },
}))

import { describeSeriesWorld } from '@/lib/series/world-line-llm'

const SOURCE = {
  title: '프리렌 — 남겨진 마법',
  characters: [{ name: '페른', appearance: '보라색 긴 머리, 검은 로브' }],
  locations: [{ name: '마을 광장', description: '비에 젖은 돌바닥' }],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('앞 화 세계 한 줄 AI 호출', () => {
  // 왜: 혼자 정한 것 — 운영 첫 실행에서 AI 서버가 1.4초 만에 500을 돌려 세계 줄이 빠진 채 2화가 만들어졌다.
  //   세계 줄은 다음 화를 만들 때 한 번만 적으므로, 일시 오류 한 번에 그 화 전체가 세계 줄 없이 그려지면 안 된다.
  it('세계 한 줄 AI가 한 번 실패하면 한 번 더 묻고, 두 번 다 실패하면 실패로 돌려준다', async () => {
    mocks.generateJson.mockRejectedValueOnce(new Error('[500 Internal Server Error] Internal error encountered.'))
    mocks.generateJson.mockResolvedValueOnce({ world: 'medieval European fantasy world' })

    await expect(describeSeriesWorld('project-2', SOURCE)).resolves.toEqual({ world: 'medieval European fantasy world' })
    expect(mocks.generateJson).toHaveBeenCalledTimes(2)

    mocks.generateJson.mockReset()
    mocks.generateJson.mockRejectedValue(new Error('[500 Internal Server Error] Internal error encountered.'))

    await expect(describeSeriesWorld('project-2', SOURCE)).rejects.toThrow(/500/)
    expect(mocks.generateJson).toHaveBeenCalledTimes(2)
    expect(mocks.flush).toHaveBeenCalledWith('seriesWorldLine')
  })
})
