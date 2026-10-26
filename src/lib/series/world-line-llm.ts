// 시리즈 앞 화 세계 한 줄의 AI 호출(2026-10-27) — 서버 전용. 지시문 · 답 읽기는 world-line.ts(순수)에 있다.
//   Writer 와 같은 모델 층(writer/llm dispatch, 이야기 축)으로 JSON 한 번. 호출은 다음 화 프로젝트의 llm_calls 에 남긴다.
//   [다음 화 만들기] 창이 이 답을 기다리므로 시간 상한을 둔다 — 넘으면 던지고, 호출부가 세계 줄 없이 만들고 알린다.
//   실패하면 한 번 더 묻는다(상한 안에서) — 운영 첫 실행에서 AI 서버가 1.4초 만에 500 을 돌려 세계 줄이 빠졌다.
//   세계 줄은 다음 화를 만들 때 한 번만 적으므로 일시 오류 한 번에 그 화 전체가 세계 줄 없이 그려지면 안 된다.
import { DEFAULT_MODELS, generateJson } from '@/lib/writer/llm/dispatch'
import { PipelineLogger } from '@/lib/writer/logger'
import { buildSeriesWorldPrompt, type SeriesWorldSource } from './world-line'

const WORLD_LINE_TIMEOUT_MS = 20_000
/** 처음 한 번 + 다시 한 번. */
const WORLD_LINE_ATTEMPTS = 2

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`series world line timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** 세계 한 줄 JSON(읽기 전 날것). 실패 · 시간 초과는 던진다. */
export async function describeSeriesWorld(projectId: string, source: SeriesWorldSource): Promise<unknown> {
  const { system, prompt } = buildSeriesWorldPrompt(source)
  const ask = async (): Promise<unknown> => {
    let lastError: unknown
    for (let attempt = 1; attempt <= WORLD_LINE_ATTEMPTS; attempt++) {
      try {
        return await generateJson<unknown>(prompt, DEFAULT_MODELS.S, { systemInstruction: system, temperature: 0.2 })
      } catch (error) {
        lastError = error
        console.warn(`[series/world-line] attempt ${attempt} failed`, error instanceof Error ? error.message : error)
      }
    }
    throw lastError
  }
  try {
    return await withTimeout(ask(), WORLD_LINE_TIMEOUT_MS)
  } finally {
    await new PipelineLogger(projectId).flushRawLlm('seriesWorldLine').catch(() => 0)
  }
}
