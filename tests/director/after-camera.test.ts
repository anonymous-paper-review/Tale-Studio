// Cinema 탭이 생긴 뒤 Director 화면은 콘티 넘김 확인과 "넘어가면서 이미지 만들기" 일괄 시작을 하지 않는다 — 그 일은 Cinema 화면이 한다 (오너 D2~D5 2026-11-22, c1b34820 camera 등록)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')

describe('Cinema 뒤의 Director 화면', () => {
  it('Director 화면은 콘티 넘김 확인을 하지 않는다 — 넘김은 Cinema 화면이 붙을 때 확인한다', () => {
    // 왜: 콘티의 [다음]은 이제 Camera 로 간다. 넘김 확인은 Camera 경로만 받으므로(global-chat-store confirmDirectorHandoff) Director 의 확인은 아무 일도 안 하는 죽은 줄이다.
    expect(page).not.toContain('confirmDirectorHandoff(')
  })

  it('Director 화면은 "넘어가면서 이미지 만들기" 표시를 읽지 않는다 — 먼저 열어도 Cinema 가 쓸 표시를 지우지 않는다', () => {
    // 왜: 표시는 한 번 읽으면 지워진다(entry-images-intent take). 실사 일괄은 Camera 화면이 시작한다 — Director 가 읽으면 Camera 에서 시작하지 못한다.
    expect(page).not.toContain('takeImagesOnDirectorEntry')
  })
})
