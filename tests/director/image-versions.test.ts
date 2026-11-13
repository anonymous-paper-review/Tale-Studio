// 실사 이미지 버전 — 만들 때마다 v1 · v2 가 쌓이고 고른 버전이 지금 그림이며, 버전은 저절로 지우지 않는다 (디자이너 11/13 D6 · 오너 2026-11-14 답 5번 · 리드 A)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { currentStoryboardVersion, keptStoryboardImage, selectStoryboardVersion, storyboardImageVersions, versionOfFrames, withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { hasStoryboardImage } from '@/lib/director/storyboard-image'
import type { StoryboardImage } from '@/types/director'

const frames = (tag: string) => ({ start: `https://media.test/${tag}-start.png`, direction: `https://media.test/${tag}-dir.png`, end: `https://media.test/${tag}-end.png` })
const made = (id: string, tag: string, generatedAt: number) => ({ id, url: frames(tag).start, frames: frames(tag), generatedAt, source: 'generated' as const })

describe('실사 이미지 버전', () => {
  it('새 그림이 끝나면 버전이 하나 쌓이고 그 버전이 지금 그림이 된다', () => {
    // 왜: 오너 답 5번 "이미지 v1 · v2 버전" — 다시 만들어도 앞 그림이 기록에 남고, 카드 · 영상 시작 그림 · Editor 는 지금 칸만 읽으니 새 그림을 쓴다.
    const first = withStoryboardVersion(null, made('job-1', 'a', 100), { select: true })
    const second = withStoryboardVersion(first, made('job-2', 'b', 200), { select: true })
    expect(storyboardImageVersions(second).map((v) => [v.n, v.id])).toEqual([[1, 'job-1'], [2, 'job-2']])
    expect(second).toMatchObject({ url: frames('b').start, frames: frames('b'), status: 'completed', errorMessage: null, generatedAt: 200, versionId: 'job-2' })
  })

  it('버전 기록이 없는 옛 샷은 지금 그림이 v1 이고, 새 그림은 v2 가 된다', () => {
    // 왜: 이번 판 전에 만든 그림을 잃지 않는다 — 옛 그림 파일은 그대로 있고 새 그림은 새 파일에 쓴다(혼자 정한 것).
    const legacy: StoryboardImage = { url: frames('old').start, frames: frames('old'), status: 'completed', errorMessage: null, generatedAt: 50 }
    expect(storyboardImageVersions(legacy).map((v) => [v.n, v.url])).toEqual([[1, frames('old').start]])
    const next = withStoryboardVersion(legacy, made('job-9', 'new', 300), { select: true })
    expect(storyboardImageVersions(next).map((v) => [v.n, v.url])).toEqual([[1, frames('old').start], [2, frames('new').start]])
    expect(next.versionId).toBe('job-9')
  })

  it('v1 을 고르면 다시 만들지 않고 v1 이 지금 그림이 되고, 다른 버전은 그대로 남는다', () => {
    // 왜: D6 "v1 · v2를 누르면 그 버전으로 돌아가요" — 되돌리기는 Take · 생성 없이 지금 칸만 바꾼다(리드 A).
    const two = withStoryboardVersion(withStoryboardVersion(null, made('job-1', 'a', 100), { select: true }), made('job-2', 'b', 200), { select: true })
    const back = selectStoryboardVersion(two, 'job-1')!
    expect(back).toMatchObject({ url: frames('a').start, frames: frames('a'), generatedAt: 100, versionId: 'job-1', status: 'completed' })
    expect(storyboardImageVersions(back)).toHaveLength(2)
    expect(selectStoryboardVersion(two, 'nope')).toBeNull()
  })

  it('버전은 저절로 지우지 않는다 — 많이 만들어도 다 남는다', () => {
    // 왜: 리드 답 "1단계에서는 버전을 저절로 지우지 않아요(다 남김)" — 파일 지우기는 되돌릴 수 없어 몇 개 남길지는 오너가 따로 정한다.
    let image: StoryboardImage | null = null
    for (let i = 1; i <= 12; i++) image = withStoryboardVersion(image, made(`job-${i}`, `t${i}`, i), { select: true })
    expect(storyboardImageVersions(image).map((v) => v.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('같은 작업이 두 번 끝나도(웹훅 · 확인이 겹쳐도) 버전은 하나다', () => {
    // 왜: 같은 작업을 웹훅과 상태 확인이 동시에 마무리할 수 있다(#dup-finalize) — 버전이 둘로 늘면 같은 그림이 두 번 보인다.
    const once = withStoryboardVersion(null, made('job-1', 'a', 100), { select: true })
    const twice = withStoryboardVersion(once, made('job-1', 'a', 100), { select: true })
    expect(storyboardImageVersions(twice)).toHaveLength(1)
  })

  it('직접 올린 그림도 버전 하나가 되고 출처는 올림이다', () => {
    // 왜: 리드 답 e — 올린 그림도 같은 목록에서 되돌릴 수 있게.
    const base = withStoryboardVersion(null, made('job-1', 'a', 100), { select: true })
    const uploaded = withStoryboardVersion(base, { id: 'upload-1', url: 'https://media.test/up.png', generatedAt: 400, source: 'upload' }, { select: true })
    const versions = storyboardImageVersions(uploaded)
    expect(versions.map((v) => [v.n, v.source])).toEqual([[1, 'generated'], [2, 'upload']])
    expect(uploaded).toMatchObject({ url: 'https://media.test/up.png', versionId: 'upload-1' })
    expect(uploaded.frames).toBeUndefined()
  })

  it('지금 그림으로 고르지 않고 남긴 버전은 목록에만 들어가고 지금 그림은 그대로다', () => {
    // 왜: 멈춘 작업이 뒤늦게 끝난 그림(오너 7번 · 조각 4)은 기록에만 남는다 — 지금 칸을 바꾸지 않는 길을 먼저 둔다.
    const base = withStoryboardVersion(null, made('job-1', 'a', 100), { select: true })
    const late = withStoryboardVersion(base, { ...made('job-2', 'b', 200), cancelled: true }, { select: false })
    expect(late).toMatchObject({ url: frames('a').start, versionId: 'job-1', generatedAt: 100 })
    expect(storyboardImageVersions(late).map((v) => [v.n, v.cancelled === true])).toEqual([[1, false], [2, true]])
  })

  it('다시 만드는 동안 · 실패해도 화면은 지금 그림의 버전 목록과 끝 그림을 그대로 보인다', () => {
    // 왜: 만드는 중 표시가 그림 칸을 비우면 버전 줄과 끝 그림이 사라졌다가 돌아온다 — 지금 그림은 그대로이니 그대로 보인다(혼자 정한 것).
    const legacy: StoryboardImage = { url: frames('old').start, frames: frames('old'), status: 'completed', errorMessage: null, generatedAt: 50 }
    const generating = { ...keptStoryboardImage(legacy), url: legacy.url, status: 'generating' as const, errorMessage: null, generatedAt: 50 }
    expect(generating.frames).toEqual(frames('old'))
    expect(storyboardImageVersions(generating).map((v) => v.n)).toEqual([1])
    const two = withStoryboardVersion(legacy, made('job-2', 'b', 200), { select: true })
    const failed = { ...keptStoryboardImage(two), url: two.url, status: 'failed' as const, errorMessage: 'boom', generatedAt: 0 }
    expect(storyboardImageVersions(failed).map((v) => v.n)).toEqual([1, 2])
    expect(failed.versionId).toBe('job-2')
  })

  it('Take 가 실제로 쓴 시작 · 끝 그림 주소로 그 버전 번호를 찾고, 주소 뒤 ?v= 는 보지 않는다', () => {
    // 왜: D7 Take 카드 "시작 v1 + 끝 v1" — 서버가 그 Take 를 만들 때 쓴 그림 주소가 작업 기록에 남는다(리드 B, 쓰지 않고 읽어서).
    const two = withStoryboardVersion(withStoryboardVersion(null, made('job-1', 'a', 100), { select: true }), made('job-2', 'b', 200), { select: true })
    expect(versionOfFrames(two, { start: `${frames('a').start}?v=123`, end: frames('a').end })).toEqual({ start: 1, end: 1 })
    expect(versionOfFrames(two, { start: frames('b').start, end: null })).toEqual({ start: 2, end: null })
    expect(versionOfFrames(two, { start: 'https://media.test/elsewhere.png', end: null })).toBeNull()
    expect(versionOfFrames(two, null)).toBeNull()
  })

  it('그림이 없던 샷(또는 실패만 있던 샷)에서 멈춘 그림이 뒤늦게 끝나면 버전 목록에만 들어가고 지금 그림은 비어 있어 이미지 필요로 남는다', () => {
    // 왜: 리드 검토 a 보통 1 · 오너 7번 "뒤에서 끝나면 히스토리로" — 처음 만드는 샷이 가장 흔한 경우다. 멈춘 그림이 저절로 지금 그림이 되면
    //   채팅의 "지금 그림은 그대로예요"와 반대가 된다. 버전 줄에서 골라야 지금 그림이 된다.
    const late = { ...made('job-late', 'late', 2), cancelled: true as const }
    for (const base of [null, { url: '', status: 'failed' as const, errorMessage: 'x', generatedAt: 0 }]) {
      const next = withStoryboardVersion(base, late, { select: false })
      expect(currentStoryboardVersion(next)).toBeNull()
      expect(next.url).toBe('')
      expect(hasStoryboardImage(next)).toBe(false)
      expect(storyboardImageVersions(next).map((v) => [v.n, v.id, v.cancelled === true])).toEqual([[1, 'job-late', true]])
      expect(selectStoryboardVersion(next, 'job-late')).toMatchObject({ url: frames('late').start, versionId: 'job-late', status: 'completed' })
    }
    // 지금 그림이 있으면 그대로(종전 시험과 같음).
    const withCurrent = withStoryboardVersion({ url: 'https://media.test/v1.png', status: 'completed', errorMessage: null, generatedAt: 1 }, late, { select: false })
    expect(currentStoryboardVersion(withCurrent)?.url).toBe('https://media.test/v1.png')
  })

  it('지금 그림을 정해 둔 적 없는 옛 모양이어도 멈춘 버전은 지금 그림으로 고르지 않는다', () => {
    // 왜: 리드 검토 a 보통 1 — "고른 버전이 없으면 마지막 버전"이 멈춘 버전을 고르면 같은 고장이 다른 길로 난다.
    const legacyShape = { url: '', status: 'pending' as const, errorMessage: null, generatedAt: 0, versions: [{ ...made('job-late', 'late', 2), n: 1, cancelled: true as const }] }
    expect(currentStoryboardVersion(legacyShape)).toBeNull()
  })

  it('멈춘 그림만 있는 샷(지금 그림 없음)은 이미지 필요로 남아 이미지 일괄 만들기가 건너뛰지 않는다', () => {
    // 왜: 리드 검토 a 보통 1 — 지금 그림이 없어도 storyboard_image 칸은 비어 있지 않다(멈춘 버전 기록). 칸이 있다고 건너뛰면 그 샷은 일괄로 그림이 생기지 않는다.
    const stoppedOnly = withStoryboardVersion(null, { ...made('job-late', 'late', 2), cancelled: true as const }, { select: false })
    expect(hasStoryboardImage(stoppedOnly)).toBe(false)
    const route = readFileSync('src/app/api/director/generate-storyboard-batch/route.ts', 'utf8')
    expect(route).toMatch(/if \(!force && hasStoryboardImage\(s\.storyboard_image\)\) continue/)
  })
})
