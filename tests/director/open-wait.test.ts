// Director 화면이 씬 · 샷을 읽고 캔버스에 샷 카드를 놓기 전에는 빈 캔버스 안내 대신 Director 기다리는 카드를 보이고, 캔버스는 그대로 붙여 두는지 검사한다 (오너 2026-11-26 m1126 G1)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DIRECTOR_WAIT_MAX_MS, directorRead } from '@/lib/stage-wait'

const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')

describe('Director 를 여는 동안', () => {
  // 왜: 데이터가 차가운 채 Director 를 열면 약 1초 동안 "아직 샷이 없어요 · Writer에서 씬을 먼저 만들면 자동으로 들어와요"가 보였다(2026-11-26 실측) —
  //   샷이 12개 있는 프로젝트인데 틀린 안내다. 그 뒤 샷 카드가 놓이면 기다림을 끝낸다.
  it('Director 는 씬 · 샷을 읽기 전, 그리고 읽은 샷이 아직 캔버스에 하나도 놓이지 않았으면 빈 캔버스 안내 대신 Director 기다리는 카드를 보인다', () => {
    expect(directorRead({ writerRead: false, writerShots: 0, canvasShots: 0, timedOut: false })).toBe(false)
    expect(directorRead({ writerRead: true, writerShots: 12, canvasShots: 0, timedOut: false })).toBe(false)
    expect(directorRead({ writerRead: true, writerShots: 12, canvasShots: 3, timedOut: false })).toBe(true)
    // 정말 샷이 없는 프로젝트는 읽은 뒤 지금 빈 캔버스 안내를 그대로 보인다.
    expect(directorRead({ writerRead: true, writerShots: 0, canvasShots: 0, timedOut: false })).toBe(true)
    expect(page).toMatch(/const directorWait = useDirectorWait\(\)/)
  })

  // 왜: 캔버스를 기다린 뒤에 붙이면 처음 들어올 때 화면 맞추기 · 자동 정렬이 도는 때가 바뀐다 — 캔버스는 지금처럼 붙여 두고 그 판 위만 덮는다.
  //   동기화가 그림 등록에서 끝내 실패하면 샷 카드가 안 생겨 기다림이 끝나지 않으므로 길어도 10초 뒤에는 캔버스를 그대로 보인다.
  it('Director 기다리는 카드는 캔버스를 붙여 둔 채 그 판 위를 덮고, 길어도 10초 뒤에는 캔버스를 그대로 보인다', () => {
    expect(page).toMatch(/<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-canvas-bg">[\s\S]*?<PaletteBar \/>[\s\S]*?<CanvasInner \/>[\s\S]*?\{directorWait \? <StageWaitCard stage="director" cover \/> : null\}\s*<\/div>/)
    expect(page).not.toMatch(/if \(directorWait\) return/)
    expect(DIRECTOR_WAIT_MAX_MS).toBe(10_000)
    expect(directorRead({ writerRead: true, writerShots: 12, canvasShots: 0, timedOut: true })).toBe(true)
    expect(directorRead({ writerRead: false, writerShots: 0, canvasShots: 0, timedOut: true })).toBe(true)
  })
})
