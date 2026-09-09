// 장면 그림이 없는 프로젝트의 카드에는 설정 시트가 아니라 인물 얼굴이 뜬다 (2026-09-09, 동업자 실측 수정)
//   왜: 목록 API 가 characters 에 없는 컬럼(portrait_url)을 골라 항상 시트(1088×608)로 떨어졌다 — 카드에서 얼굴을 알아볼 수 없었다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pickCompletedImage, pickProjectThumbnails } from '@/lib/project-thumbnail'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')
const done = (url: string, start?: string) => ({ status: 'completed', url, ...(start ? { frames: { start } } : {}) })

describe('프로젝트 카드 썸네일', () => {
  it('장면 그림이 없는 프로젝트의 카드에는 인물 얼굴 크롭(portrait)이 뜨고, 얼굴이 없을 때만 설정 시트(view_main)로 내려간다', () => {
    // 왜: 동업자 실측 — 인물 그림으로 내려온 8개 프로젝트가 전부 시트로 떴다. 얼굴이 있으면 얼굴이 먼저다.
    const t = pickProjectThumbnails(
      [],
      [
        { project_id: 'a', portrait: 'https://m/a_portrait.png', view_main: 'https://m/a_sheet.png' },
        { project_id: 'b', portrait: null, view_main: 'https://m/b_sheet.png' },
        { project_id: 'c', portrait: '  ', view_main: 'https://m/c_sheet.png' },
        { project_id: 'd', portrait: null, view_main: null },
      ],
    )
    expect(t.get('a')).toBe('https://m/a_portrait.png')
    expect(t.get('b')).toBe('https://m/b_sheet.png')
    expect(t.get('c')).toBe('https://m/c_sheet.png')
    expect(t.has('d')).toBe(false)
  })

  it('실사 시작 프레임 → 러프 시작 프레임 → 인물 순서로 고르고, 완료되지 않은 그림은 건너뛴다', () => {
    // 왜: 정상 경로 고정 — 첫 샷의 러프가 뒤 샷의 실사를 이기지 않고, 만들다 만 그림은 카드에 안 뜬다.
    const shots = [
      { project_id: 'p', storyboard_image: { status: 'queued', url: 'https://m/p1_real.png' }, rough_storyboard: done('https://m/p1_rough.png', 'https://m/p1_rough_start.png') },
      { project_id: 'p', storyboard_image: done('https://m/p2_real.png', 'https://m/p2_real_start.png'), rough_storyboard: null },
      { project_id: 'q', storyboard_image: null, rough_storyboard: done('https://m/q1_rough.png') },
    ]
    const chars = [
      { project_id: 'p', portrait: 'https://m/p_portrait.png', view_main: null },
      { project_id: 'r', portrait: 'https://m/r_portrait.png', view_main: null },
    ]
    const t = pickProjectThumbnails(shots, chars)
    expect(t.get('p')).toBe('https://m/p2_real_start.png') // 뒤 샷 실사가 첫 샷 러프를 이긴다
    expect(t.get('q')).toBe('https://m/q1_rough.png') // 시작 프레임이 없으면 대표 url
    expect(t.get('r')).toBe('https://m/r_portrait.png')
    expect(pickCompletedImage({ status: 'failed', url: 'x' }, true)).toBeNull()
    expect(pickCompletedImage(undefined, true)).toBeNull()
  })

  it('프로젝트 목록 API 는 characters 표에 있는 컬럼(portrait)만 고른다 — 없는 컬럼은 오류 없이 시트로 떨어진다', () => {
    // 왜: PostgREST 는 없는 컬럼을 undefined 로 돌려주고, `as string | null` 캐스팅이라 타입 검사도 못 잡는다(재발 방지).
    const route = read('src/app/api/project/list/route.ts')
    const code = route.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n') // 주석은 사고 기록이라 제외
    expect(code).toMatch(/\.select\('project_id, portrait, view_main'\)/)
    expect(code).not.toMatch(/portrait_url/)
    expect(code).toMatch(/pickProjectThumbnails\(/)
  })
})
