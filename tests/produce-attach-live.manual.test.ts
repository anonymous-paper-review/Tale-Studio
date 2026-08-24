import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// #p1-attach 라이브 진단 (수동 게이트 — **실제 LLM 1콜 과금**, CI 항상 skip):
//   RUN_ATTACH_LIVE=1 pnpm vitest run tests/produce-attach-live.manual.test.ts
//
// 왜 있나: 첨부 판독 실패는 두 번 물렸는데(8/13 정상 → 8/17~18 3프로젝트 연속 "모델이 첨부를
//   모른 채" 응답 — 쿼터 사태기), 실패가 **조용해서** 원인 계층(화이트리스트/Anthropic fetch/
//   블록 배선)을 사후 로그로 가릴 수 없었다. 이 테스트는 스토리지에 실존하는 슬라이스 URL 로
//   produce/chat 과 같은 배선(sanitize → llmChat imageUrls)을 그대로 태워 계층별로 판별한다.
//   실패 시: sanitize 거부면 화이트리스트/env, llmChat throw 면 Anthropic 의 URL fetch(스토리지
//   공개 읽기 상태), 제네릭 응답이면 블록 배선을 본다.

const LIVE = process.env.RUN_ATTACH_LIVE === '1'

function loadEnv() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

// 실존 검증된 슬라이스(2026-08-18 webtoon_test_260818 업로드 — storage.objects 실측 경로).
//   대상 프로젝트를 지우면 이 테스트는 다른 살아있는 uploads 슬라이스로 갈아끼운다.
const SLICE_PATHS = [
  'ce053575-62d5-4c8d-898f-34a1a5c6b40b/90a988e8-e269-4b1b-adff-352a0387d6e9/uploads/v1-2a004f0918cac8f837c4bb203b7de018c03ffddc8e724a0b3fe0624656efa203/s000.jpg',
  'ce053575-62d5-4c8d-898f-34a1a5c6b40b/90a988e8-e269-4b1b-adff-352a0387d6e9/uploads/v1-2a004f0918cac8f837c4bb203b7de018c03ffddc8e724a0b3fe0624656efa203/s001.jpg',
]

describe.skipIf(!LIVE)('produce 첨부 경로 라이브 진단', () => {
  it('실존 슬라이스 URL 이 화이트리스트를 통과하고, 모델이 내용을 실제로 읽는다', async () => {
    loadEnv()
    const { sanitizeAttachmentUrls } = await import('@/lib/upload/attachment')
    const { mediaPublicUrl } = await import('@/lib/storage/media-url')
    const { llmChat } = await import('@/lib/llm')

    const urls = SLICE_PATHS.map((p) => mediaPublicUrl(p))
    expect(urls.every((u) => typeof u === 'string' && u.startsWith('http'))).toBe(true)

    // 계층 1: 화이트리스트 — produce/chat 이 쓰는 그 함수 그대로.
    const sanitized = sanitizeAttachmentUrls(urls)
    expect(sanitized.rejected, `whitelist 거부: ${JSON.stringify(urls)}`).toBe(0)
    expect(sanitized.urls.length).toBe(urls.length)

    // 계층 2+3: Anthropic 의 URL fetch + 이미지 블록 배선 — 스토리지가 막혀 있으면 여기서 throw,
    //   블록이 안 실리면 "이미지가 없다/보이지 않는다"류 응답이 온다.
    const reply = await llmChat(
      'You are a vision test probe. Answer in Korean.',
      [],
      `[Attached Images]\n${sanitized.urls.length} image(s) are attached to this message, in reading order.\n\n첨부 이미지에 실제로 보이는 것(인물 수·복장·배경·말풍선 유무)을 3문장 이내로 구체적으로 말해줘. 이미지가 안 보이면 "이미지 없음"이라고만 답해.`,
      0.2,
      'chat',
      { imageUrls: sanitized.urls },
    )
    console.log('[attach-live] reply:', reply)
    expect(reply.length).toBeGreaterThan(10)
    expect(reply.includes('이미지 없음'), `모델이 첨부를 못 봄: ${reply}`).toBe(false)
  }, 120_000)
})
