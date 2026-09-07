// 생성에 실패해도 무엇이 문제인지와 다음에 할 일을 사용자에게 알려준다
import { describe, expect, it } from 'vitest'
import {
  explainGenerationFailure,
  generationFailureMessage,
  generationGaveUpMessage,
} from '@/lib/generation-failure'

// 실제로 나왔던 원문(2026-08-13 webtoon_test) — 분류가 이걸 알아봐야 한다.
const REAL_DOWNLOAD_ERROR =
  'status=422 | body={"detail":[{"loc":["body","input.image_urls"],"msg":"Failed to download the file. Please check if the URL is accessible and try again.","type":"file_download_error","url":"https://docs.fal.ai/errors#file_download_error","input":"https://tunnel.example/rough-storyboard-grid.png"}]}'

describe('explainGenerationFailure', () => {
  it('참고 이미지를 가져오지 못하면 다시 준비하라고 안내한다 (실제 원문)', () => {
    const { what, next } = explainGenerationFailure(REAL_DOWNLOAD_ERROR)
    expect(what).toContain('참고 이미지')
    expect(next).toContain('다시')
  })

  it('참고 이미지 주소가 만료됐다는 내용도 같은 문제로 설명한다', () => {
    const { what } = explainGenerationFailure(
      'The provided image URL is not accessible or has expired.',
    )
    expect(what).toContain('참고 이미지')
  })

  it('콘텐츠 정책에 걸리면 완화하거나 안전한 방식으로 다시 시도하라고 안내한다', () => {
    for (const raw of ['PROHIBITED_CONTENT', 'moderation blocked', 'nsfw detected']) {
      const { what, next } = explainGenerationFailure(raw)
      expect(what).toContain('생성 정책')
      expect(next).toMatch(/완화|안전/)
    }
  })

  it('요청 한도를 넘으면 잠시 기다리라고 한다', () => {
    const { next } = explainGenerationFailure('status=429 too many requests')
    expect(next).toContain('잠시 후')
  })

  it('접근 권한 문제는 관리자가 해결해야 한다고 알려준다', () => {
    const { next } = explainGenerationFailure('status=401 unauthorized')
    expect(next).toContain('관리자')
  })

  it('모르는 오류는 지어내지 않고 원문을 짧게 보여준다', () => {
    const { what, next } = explainGenerationFailure('some totally unknown provider hiccup')
    expect(what).toContain('some totally unknown provider hiccup')
    expect(next).toBeTruthy()
  })

  it('복잡한 오류 내용에서는 핵심 안내만 뽑아 짧게 보여준다', () => {
    const { what } = explainGenerationFailure('{"detail":[{"msg":"weird thing happened","x":1}]}')
    expect(what).toContain('weird thing happened')
    expect(what).not.toContain('"detail"')
  })

  it('실패 내용이 없어도 안전하게 설명한다', () => {
    expect(explainGenerationFailure('').what).toContain('알 수 없는 오류')
  })
})

describe('사용자 안내 문장', () => {
  it('실패를 알리는 문장은 경고 표시로 시작한다', () => {
    // chat-blocks 가 이 prefix 로 상태 행을 판별한다 — 빠지면 일반 말풍선으로 샌다.
    expect(generationFailureMessage('캐릭터 이미지', REAL_DOWNLOAD_ERROR)).toMatch(/^⚠ /)
  })

  it('자동 재시도를 포기하면 사용자가 다시 생성을 눌러야 한다고 알려준다', () => {
    const msg = generationGaveUpMessage('캐릭터 이미지')
    expect(msg).toMatch(/^⚠ /)
    // 이게 빠지면 사용자는 기다리기만 하고 영영 복구되지 않는다.
    expect(msg).toContain('다시 생성')
    expect(msg).toContain('자동')
  })
})
