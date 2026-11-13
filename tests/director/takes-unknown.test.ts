// Take 잔액을 못 읽었을 때 Director 본 화면은 "과금 꺼짐"처럼 굴지 않는다 — 값은 보이고, Take 를 쓰는 단추는 다시 읽어 못 읽으면 시작하지 않는다 (리드 11/14, 검토 b · entry D8 과 같은 말)
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { TAKES_UNKNOWN_TEXT, takesReadable } from '@/features/director/takes-check'

const read = (relative: string) => readFileSync(relative, 'utf8')
const page = read('src/app/studio/director/page.tsx')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('잔액을 다시 읽기', () => {
  it('Take 를 쓰는 단추를 누를 때 잔액을 다시 읽고, 못 읽으면 시작하지 않는다는 답을 낸다', async () => {
    // 왜: 잔액을 못 읽으면 잔액 훅이 "과금 꺼짐"과 같은 값을 줘, 확인 창에 Take 줄이 없이 전부 시작했다(검토 b).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    expect(await takesReadable()).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ balance: 12, mode: 'enforce' }), { status: 200 })))
    expect(await takesReadable()).toBe(true)
  })

  it('못 읽었을 때의 까닭은 Editor 넘기기 창(D8)과 같은 말이다', () => {
    // 왜: 같은 일에 화면마다 다른 말을 하지 않는다(entry 문구 그대로).
    expect(translate('ko', TAKES_UNKNOWN_TEXT)).toBe('Take 를 확인하지 못해 시작하지 않았어요. 잠시 뒤 다시 눌러 주세요.')
  })
})

describe('툴바', () => {
  it('잔액을 못 읽었으면 툴바 예상 칸은 Take 값을 그대로 보이고, 과금이 정말 꺼졌을 때만 숨긴다', () => {
    // 왜: 못 읽은 것을 과금 꺼짐으로 보면 Take 를 쓰는 일이 Take 없이 보인다.
    expect(page).toContain('takesShown: takeValuesShown(takeState)')
    expect(page).not.toContain("takesShown: takeState.mode !== 'off'")
  })

  it('[영상 만들기] · [이미지+영상 만들기]는 누를 때 잔액을 다시 읽고, 못 읽으면 확인 창을 열지 않고 단추 아래에 까닭을 보인다', () => {
    // 왜: 읽히면 지금처럼 Take 줄이 있는 확인 창 — 못 읽은 채로 열면 Take 줄 없이 전부 시작했다.
    const videos = page.slice(page.indexOf('const runVideos = async () => {'), page.indexOf('const runVideos = async () => {') + 400)
    expect(videos).toMatch(/if \(!\(await takesReadable\(\)\)\) \{\s*setTakesUnknown\(true\)\s*return\s*\}/)
    expect(videos.indexOf('takesReadable')).toBeLessThan(videos.indexOf('setConfirmVideoBatch(true)'))
    const images = page.slice(page.indexOf('const runImages = async () => {'), page.indexOf('const runImages = async () => {') + 700)
    expect(images).toMatch(/if \(chainOn\) \{\s*if \(!\(await takesReadable\(\)\)\) \{\s*setTakesUnknown\(true\)\s*return\s*\}/)
    expect(page).toContain('takesUnknown && takeState.failed ? t(TAKES_UNKNOWN_TEXT) : workBlockLine(imageBlock, videoBlock, t)')
  })
})

describe('카드 · 노드의 영상 단추', () => {
  it('노드형 영상 노드 [영상 다시 만들기]는 잔액을 못 읽어도 Take 값을 보이고, 누를 때 다시 읽어 못 읽으면 시작하지 않고 노드 안에 까닭을 보인다', () => {
    // 왜: 값을 보이고 바로 시작하는 자리 — 단추 값이 곧 동의라 못 읽은 채로 시작하지 않는다(리드 11/14).
    const node = read('src/features/director/canvas-nodes/VideoNode.tsx')
    expect(node).toContain('takeValuesShown(takeBalance) && (')
    expect(node).toMatch(/if \(!\(await takesReadable\(\)\)\) \{\s*setTakesUnknown\(true\)\s*return\s*\}/)
    expect(node).toContain('{takesUnknown && takeBalance.failed && (')
  })

  it('샷 노드에서 영상 노드를 새로 내어 바로 만들 때도 잔액을 다시 읽어, 못 읽으면 시작하지 않고 노드 안에 까닭을 보인다', () => {
    // 왜: 가지 내기도 바로 Take 를 쓰는 길이다.
    const shot = read('src/features/director/canvas-nodes/ShotNode.tsx')
    expect(shot).toMatch(/onBranch=\{async \(\) => \{\s*if \(videoQueued\) return\s*if \(!\(await takesReadable\(\)\)\) \{\s*setTakesUnknown\(true\)\s*return\s*\}/)
    expect(shot).toContain('{takesUnknown && takeBalance.failed && (')
  })

  it('러프 보기 카드의 [영상 만들기 · 다시 만들기]도 잔액을 다시 읽어, 못 읽으면 시작하지 않고 카드 안에 까닭을 보인다', () => {
    // 왜: 카드 단추도 같은 Take 를 쓴다(리드 11/14).
    const grid = read('src/features/director/canvas-views/StoryboardGridView.tsx')
    const run = grid.slice(grid.indexOf('const runVideo = async () => {'), grid.indexOf('const runVideo = async () => {') + 700)
    expect(run).toMatch(/if \(!\(await takesReadable\(\)\)\) \{\s*setVideoError\(t\(TAKES_UNKNOWN_TEXT\)\)\s*return\s*\}/)
  })
})
