// 로그인 안 한 방문자가 첫 화면에 오면 디자이너 랜딩을 보여 주고, 랜딩 파일은 로그인 없이 열리는지 검사한다.
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))

describe('첫 화면 접근', () => {
  // 왜: 오너 2026-11-24 "수민님 수정사항 반영". 첫 화면이 디자이너 랜딩으로 바뀐다.
  it('로그인 안 한 방문자가 첫 화면에 오면 새 랜딩을 보여 준다', async () => {
    const { middleware } = await import('@/middleware')
    const response = await middleware(new NextRequest('https://example.test/'))
    expect(response.headers.get('x-middleware-rewrite')).toContain('/landing/index.html')
  })

  // 왜: 랜딩의 그림·영상·스크립트를 로그인 화면으로 돌려보내면 첫 화면이 깨진다.
  it('랜딩의 그림·영상·스크립트 파일은 로그인 없이 열린다', async () => {
    const { middleware } = await import('@/middleware')
    for (const file of ['/landing/assets/index.js', '/landing/assets/work-tea.mp4', '/landing/lumi-persona.js']) {
      const response = await middleware(new NextRequest(`https://example.test${file}`))
      expect(response.headers.get('location')).toBeNull()
    }
  })
})
