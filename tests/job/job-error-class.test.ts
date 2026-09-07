// 작업 실패 이유를 사람 말로 나누어, 다시 시도할 수 있는지 올바르게 판단한다 (#error-class 2026-08-13)
import { describe, it, expect } from 'vitest'
import { classifyJobError, classifyFalFailure } from '@/lib/generation-jobs'

// #error-class (2026-08-13) — 픽스처는 전부 프로덕션 실측 메시지다(2026-08-13 실패 48건 전수
// 집계). 분류가 바뀌면 백필 SQL(20260813030000)과 어긋나므로, 규칙 변경 시 여기와 함께 갱신.

describe('classifyJobError — 실측 메시지 분류', () => {
  const CASES: Array<[string, string]> = [
    // fal 웹훅 payload_error 원문 그대로 — 최대 단일 덩어리(14건), 본문 소실로 재시도성 미확정
    ['Bad Request', 'bad_request'],
    // 소프트 모더레이션(9건) — finalize 가드가 잡는 빈/검은 산출. moderation 키워드('moderated')를
    // 포함하므로 순서가 뒤집히면 moderation 으로 오분류된다.
    ['image too small (1795b < 20000) — likely blank/moderated output', 'moderation_soft'],
    // 8/5 쿼터 사고의 수동 정리(13건)
    ['stale queued reaped — webhook 유실 좀비 정리 (quota 복구 2026-08-05)', 'infra'],
    ['superseded by enriched re-run (#previz-enrich)', 'infra'],
    // 참조 이미지 접근 불가(5건) — 재시도 무의미(같은 URL)
    [
      'status=422 | body={"detail":[{"loc":["body","input.image_urls"],"msg":"Failed to load the image."}]}',
      'data_ref',
    ],
    // 결제(4건) — 오너 행동 필요
    ['fal 잔액 소진으로 미실행 — 수동 이미지 경로로 대체', 'billing'],
    // 프로바이더 결과 결함(2건)
    ['invalid video url in provider result', 'provider'],
    // 명시 모더레이션(1건) — fal content checker
    [
      'status=422 | Unprocessable Entity | body={"detail":[{"msg":"The content could not be processed because it contained material flagged by a content checker.","type":"content_policy_violation"}]}',
      'moderation',
    ],
    // webhook 이 [moderation] 접두를 붙여 기록하는 경로
    ['[moderation] NSFW content detected', 'moderation'],
    // #fal-canvas(2026-08-17) 실측 40건 — image_size 'WxH' 문자열 스키마 거부. data_ref/moderation
    // 이 앞서 매칭된 뒤의 잔여 422 = 요청 자체 결함(재시도 무가치)인데 unknown 으로 새고 있었다.
    [
      'status=422 | Unprocessable Entity | body={"detail":[{"type":"model_attributes_type","loc":["body","image_size","ImageSize"],"msg":"Input should be a valid dictionary or object to extract fields from","input":"1536x1024"}]}',
      'bad_request',
    ],
  ]
  it.each(CASES)('%s 상황은 %s로 분류한다', (msg, cls) => {
    expect(classifyJobError(msg)).toBe(cls)
  })

  it('내용이 없거나 처음 보는 실패는 알 수 없음으로 모아 둔다', () => {
    expect(classifyJobError('')).toBe('unknown')
    expect(classifyJobError(null)).toBe('unknown')
    expect(classifyJobError('something entirely new')).toBe('unknown')
  })
})

describe('classifyFalFailure 실패 분류 약속', () => {
  it('내용이 제한되면 그 사유로 분류하고, 그 밖의 실패는 일반 실패로 처리한다', () => {
    expect(classifyFalFailure('[moderation] blocked')).toBe('moderation')
    expect(classifyFalFailure('Bad Request')).toBe('generic')
    expect(classifyFalFailure('fal webhook reported ERROR')).toBe('generic')
  })
})
