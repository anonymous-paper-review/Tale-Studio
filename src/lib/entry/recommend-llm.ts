// Producer 시작 화면 AI 호출(리뉴얼 1차 2026-10-19) — 서버 전용. 지시문 · 답 검사는 recommend.ts(순수)에 있다.
//   ① 이미지 글자 읽기: 만화 대본 옮기기와 같은 한 번짜리 그림 호출(transcribeComic)에 글자 읽기 지시를 준다.
//   ② 추천: Writer 와 같은 모델 층(writer/llm dispatch, 이야기 축)으로 JSON 한 번. 두 호출 모두 llm_calls 에 남긴다.
//   추천은 기다리는 시간을 둔다 — 넘으면 호출부가 규칙 추천으로 간다(사용자는 설정 화면으로 넘어가야 한다).
import { CLAUDE_MODEL } from '@/lib/claude'
import { transcribeComic } from '@/lib/producer/comic-script-llm'
import { DEFAULT_MODELS, generateJson } from '@/lib/writer/llm/dispatch'
import { recordRawCall } from '@/lib/writer/llm/raw_collector'
import { PipelineLogger } from '@/lib/writer/logger'
import { OCR_PROMPT, buildRecommendPrompt, cleanOcrText, type RecommendInput } from './recommend'

/** 한 번에 읽는 조각 수 — 사진 찍은 대본 몇 장 분량. */
const OCR_MAX_SLICES = 6
const RECOMMEND_TIMEOUT_MS = 25_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`entry recommend timed out after ${ms}ms`)), ms)
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

/** 이미지(우리 저장소 주소) 속 글. 글이 없으면 ''. */
export async function ocrImageText(projectId: string, urls: string[]): Promise<string> {
  const picked = urls.slice(0, OCR_MAX_SLICES)
  const started = Date.now()
  let response = ''
  let error: string | undefined
  let usage: { input_tokens: number; output_tokens: number } | undefined
  try {
    const result = await transcribeComic(picked, OCR_PROMPT)
    response = result.text
    usage = result.usage
    return cleanOcrText(response)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    throw e
  } finally {
    recordRawCall({
      timestamp: new Date().toISOString(),
      provider: 'claude',
      model: CLAUDE_MODEL,
      prompt: `${OCR_PROMPT}\n[images: ${picked.length}]`,
      response,
      duration_ms: Date.now() - started,
      error,
      input_chars: OCR_PROMPT.length,
      output_chars: response.length,
      input_tokens: usage?.input_tokens,
      output_tokens: usage?.output_tokens,
    })
    await new PipelineLogger(projectId).flushRawLlm('entryOcr').catch(() => 0)
  }
}

/** 추천 JSON(검사 전 날것). 실패 · 시간 초과는 던진다 — 호출부가 규칙 추천으로 간다. */
export async function recommendWithLlm(projectId: string, input: RecommendInput): Promise<unknown> {
  const { system, prompt } = buildRecommendPrompt(input)
  try {
    return await withTimeout(generateJson<unknown>(prompt, DEFAULT_MODELS.S, { systemInstruction: system, temperature: 0.3 }), RECOMMEND_TIMEOUT_MS)
  } finally {
    await new PipelineLogger(projectId).flushRawLlm('entryRecommend').catch(() => 0)
  }
}
