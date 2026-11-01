// Seedance 2.5 를 고른 디렉터 영상 요청을 실제 fal 로 보내면 영상 파일이 나온다 (fal 과금 있음 · 개발 DB 는 읽기만 · 저장소에 쓰지 않는다)
//
// 왜 수동 시험인가: 나머지 시험은 fal 응답을 가짜로 둔다. 그건 "우리가 칸을 규칙대로 채우나"는 잡지만
//   "fal 의 Seedance 2.5 입구가 그 칸을 실제로 받아 영상을 내나"는 못 잡는다.
// 재료: 개발 DB 에서 Seedance 2.0 으로 만들어 성공한 디렉터 영상 작업 하나의 최종 프롬프트 · 시작/끝 그림 · 길이 · 화면 비율.
//   같은 재료를 제품 코드(buildFalReferenceToVideoRequest)로 Seedance 2.5 요청으로 다시 만들어 보낸다.
//   Creem 프롬프트 검사는 그 작업이 이미 통과한 프롬프트라 다시 부르지 않는다.
//
// 실행: RUN_LIVE_TESTS=1 pnpm vitest run tests/manual/seedance-25-live.manual.test.ts
//   SEEDANCE_LIVE_OUT=<파일 경로> 를 주면 받은 영상을 그 경로에 저장한다.
import { readFileSync, writeFileSync } from 'node:fs'
import { createFalClient } from '@fal-ai/client'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { buildFalReferenceToVideoRequest } from '@/lib/director/fal-video-request'

const LIVE = process.env.RUN_LIVE_TESTS === '1'

function env(): Record<string, string> {
  return Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
  )
}

type SavedFalRequest = {
  model: string
  input: { prompt: string; image_urls: string[]; duration: number; aspect_ratio: string }
}

describe.skipIf(!LIVE)('Seedance 2.5 실제 생성', () => {
  it('Seedance 2.0 으로 성공한 디렉터 영상 재료를 Seedance 2.5 로 보내면 고른 해상도의 영상 파일이 나온다', async () => {
    const e = env()
    const db = createClient(e.SUPABASE_DEV_URL, e.SUPABASE_DEV_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data, error } = await db
      .from('generation_jobs')
      .select('id, input_snapshot')
      .eq('kind', 'shot_video')
      .eq('status', 'completed')
      .eq('model', 'bytedance/seedance-2.0/reference-to-video')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (error) throw error
    const saved = (data.input_snapshot as { fal_request: SavedFalRequest }).fal_request

    const request = buildFalReferenceToVideoRequest(
      'seedance-2.5',
      saved.input.prompt,
      saved.input.image_urls,
      saved.input.duration,
      saved.input.aspect_ratio,
      '720p',
    )
    expect(request.model).toBe('bytedance/seedance-2.5/us/reference-to-video')

    const [key] = JSON.parse(e.FAL_KEYS) as Array<{ key: string }>
    const fal = createFalClient({ credentials: key.key })
    const started = Date.now()
    const result = await fal.subscribe(request.model, { input: request.input, pollInterval: 5000 })
    const video = (result.data as { video?: { url?: string; content_type?: string } }).video

    expect(video?.url).toMatch(/^https:\/\//)
    const res = await fetch(video!.url!)
    expect(res.ok).toBe(true)
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.length).toBeGreaterThan(10_000)
    // MP4 는 4바이트 뒤에 'ftyp' 상자로 시작한다.
    expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp')
    if (process.env.SEEDANCE_LIVE_OUT) writeFileSync(process.env.SEEDANCE_LIVE_OUT, bytes)
    console.log(JSON.stringify({ sourceJob: data.id, requestId: result.requestId, seconds: Math.round((Date.now() - started) / 1000), url: video!.url, bytes: bytes.length }))
  }, 900_000)
})
