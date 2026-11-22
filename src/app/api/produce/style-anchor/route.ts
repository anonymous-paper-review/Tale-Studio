// POST /api/produce/style-anchor — 사용자가 올린 그림을 이 프로젝트 그림체(custom_style_anchor · 고정)로 저장하던 창구(2026-08-13 · 고정 2026-10-09).
//   D6(오너 2026-11-22 "웹툰이나 이미지 입력받았을 때 스타일 추출하는 기능도 없애줘")로 닫았다 — 리드 2026-11-22 승인: 창구는 두고 410 으로 답한다.
//   옛 탭 · 직접 요청도 그림체를 새로 정하거나 그림을 분석 모델에 보내지 못하게, 로그인 · 동의 · 주인 확인 전에 DB · 모델을 부르지 않고 늘 같은 답을 한다.
//   이미 그림체를 올린 작품은 저장된 그림체 그대로 그린다(생성 쪽 resolveStyleAnchor — 리드 2026-11-22 안 1 바탕). 예전 본문은 git 기록에 있다.
//   약속: tests/producer/style-lock-route.test.ts · comic-medium.test.ts · comic-style.test.ts · style-analysis-artist-wait.test.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** 받은 요청(_req)은 보지 않는다 — Next 라우트 손잡이 모양만 지킨다. */
export async function POST(_req: Request): Promise<Response> {
  return NextResponse.json({ error: 'style_extraction_retired' }, { status: 410 })
}
