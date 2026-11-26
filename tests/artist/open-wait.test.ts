// Artist 화면이 인물 · 배경과 진행 상태를 처음 다 읽기 전에는 예전 흐름 진행 화면 대신 Artist 기다리는 카드를 보이는지 검사한다 (오너 2026-11-26 m1126 G1)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { artistRead } from '@/lib/stage-wait'

const page = readFileSync('src/app/studio/artist/page.tsx', 'utf8')
const hooks = readFileSync('src/hooks/use-stage-wait.ts', 'utf8')

describe('Artist 를 여는 동안', () => {
  // 왜: 레일로 Artist 에 오면 자료를 읽는 0.25~0.4초 동안 "AI 자동 생성 진행 중… 막을 올리는 중… 0% … 약 3-5분"(예전 흐름 진행 화면)이 보였다 —
  //   다 만든 프로젝트인데 틀린 안내다(2026-11-26 실측). 진행 상태를 모르면 화면이 [만들기] 중인지 · 다 만들었는지 고를 수 없다.
  it('Artist 는 인물 · 배경과 진행 상태를 처음 다 읽기 전에는 "AI 자동 생성 진행 중" 화면 대신 Artist 기다리는 카드를 보인다', () => {
    expect(artistRead({ hasAssets: false, firstRead: false, statusRead: true })).toBe(false)
    expect(artistRead({ hasAssets: false, firstRead: true, statusRead: false })).toBe(false)
    expect(artistRead({ hasAssets: true, firstRead: false, statusRead: false })).toBe(false)
    expect(artistRead({ hasAssets: false, firstRead: true, statusRead: true })).toBe(true)
    // 화면은 모든 훅 뒤, 단계 고르기(산문 목록 · 만드는 중 · 진행 화면 · 카드) 앞에서 기다리는 카드를 돌려준다.
    expect(page).toMatch(/const artistWait = useArtistWait\(\)/)
    expect(page).toMatch(/if \(artistWait\) return <StageWaitCard stage="artist" \/>\s*\n\s*if \(phase === 'list'\)/)
    // 처음 읽기는 화면이 부르는 읽기와 합쳐진다(같은 프로젝트의 읽기는 한 번) · 진행 상태는 읽다 실패해도 읽은 것으로 본다.
    expect(hooks).toMatch(/const loadArtist = \(\) => useArtistStore\.getState\(\)\.loadData\(\)/)
    expect(hooks).toMatch(/const \{ status, error \} = useWriterStatus\(projectId\)\s*\n\s*return status !== null \|\| error !== null/)
  })
})
