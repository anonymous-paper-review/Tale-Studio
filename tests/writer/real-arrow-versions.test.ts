// 실사 가운데 장 화살표 고치기(N4b)가 실사 시트(shots.storyboard_image)에 남는 모양 — 새 판 · 끝 장 넣기 · 읽은 줄 · 밑층 · 상세 단추 — 을 검사한다 (리드 D1 · D2 = A)
import { describe, expect, it } from 'vitest'
import { REAL_SAVE_PNG_LIMIT, isRealArrowImage, realArrowEntry, realEditorPanel, realEndReplayable, realSaveImageType, withArrowVersion, withFixedRealRead, withRealCleanPlate, withRealDirectionRead, withRealEndFrame } from '@/lib/storyboard/real-arrow-edit'
import { currentStoryboardVersion, selectStoryboardVersion, storyboardImageVersions, withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { freshDirectionRead } from '@/lib/writer/direction-read'
import type { StoryboardImage } from '@/types/director'

// 이 시험을 위해 지은 실사 시트 — v1(처음 그림) · v2(다시 그림, 지금 그림). 러프 시각 500 에서 그렸다.
const B = 'https://media.test/ws/p1/shots'
const V1 = { start: `${B}/a_g1_storyboard_start.png?v=1`, direction: `${B}/a_g1_storyboard_direction.png?v=1`, end: `${B}/a_g1_storyboard_end.png?v=1` }
const V2 = { start: `${B}/a_g2_storyboard_start.png?v=2`, direction: `${B}/a_g2_storyboard_direction.png?v=2`, end: `${B}/a_g2_storyboard_end.png?v=2` }
const EDITED = `${B}/a_a9_storyboard_direction.png?v=3`
const NEW_END = `${B}/a_gjob_storyboard_end.png?v=4`
const LINE = 'She stands and walks out to the right.'
function sheet(): StoryboardImage {
  const one = withStoryboardVersion(null, { id: 'g1', url: V1.start, frames: V1, generatedAt: 10, source: 'generated', roughGeneratedAt: 500 }, { select: true })
  return withStoryboardVersion(one, { id: 'g2', url: V2.start, frames: V2, generatedAt: 20, source: 'generated', roughGeneratedAt: 500 }, { select: true })
}
const read = (direction: string, extra: Record<string, unknown> = {}) => ({ en: LINE, ko: null, source: 'ai' as const, direction, at: 1, endDrawn: null, ...extra })
const saved = () => withArrowVersion(sheet(), { id: 'arrows-1', direction: EDITED, at: 30, from: V2.direction })!

describe('화살표를 저장한 판', () => {
  // 왜(리드 D1 A · 오너 11/14 답 5 "만들 때마다 쌓이고 저절로 지우지 않는다"): 화살표를 고친 그림도 새로 만든 그림이다 — 고치기 전 그림을 기록에서 지우지 않는다.
  it('화살표를 저장하면 고친 가운데 장을 가진 새 판이 지금 그림이 되고 시작 · 끝 장과 러프 시각은 밑 판 것 그대로다', () => {
    const next = saved()
    const current = currentStoryboardVersion(next)!
    expect(current).toMatchObject({ id: 'arrows-1', n: 3, url: V2.start, frames: { start: V2.start, direction: EDITED, end: V2.end }, source: 'generated', roughGeneratedAt: 500 })
    // 맨 위 칸(카드 · 영상 시작+미들이 읽는 곳)이 고친 가운데 장을 비춘다.
    expect(next.frames).toEqual({ start: V2.start, direction: EDITED, end: V2.end })
    expect(next.roughGeneratedAt).toBe(500)
    expect(storyboardImageVersions(next).map((v) => v.id)).toEqual(['g1', 'g2', 'arrows-1'])
  })

  // 왜(리드 D1 A): 고친 것이 마음에 안 들면 지난 판 줄의 [채택]으로 돌아간다 — 다시 그리지 않는다(Take 0).
  it('고치기 전 판은 지난 판으로 남아 [채택]으로 되돌릴 수 있다', () => {
    const back = selectStoryboardVersion(saved(), 'g2')!
    expect(back.frames).toEqual(V2)
    expect(storyboardImageVersions(back)).toHaveLength(3)
  })

  // 왜: 판 기록이 생기기 전에 그린 옛 실사(개발 DB QA 원본 834619c8 이 이 모양)도 고친 뒤 옛 그림으로 돌아갈 수 있어야 한다.
  it('판 기록이 없는 옛 실사도 화살표를 저장하면 옛 그림이 v1, 고친 그림이 v2 가 된다', () => {
    const legacy = { url: V1.start, status: 'completed', errorMessage: null, generatedAt: 10, frames: V1, roughGeneratedAt: 400 } as StoryboardImage
    const next = withArrowVersion(legacy, { id: 'arrows-1', direction: EDITED, at: 30, from: V1.direction })!
    expect(storyboardImageVersions(next).map((v) => [v.id, v.n])).toEqual([['legacy', 1], ['arrows-1', 2]])
    expect(next.frames).toEqual({ ...V1, direction: EDITED })
    expect(selectStoryboardVersion(next, 'legacy')!.frames).toEqual(V1)
  })

  // 왜(혼자 정한 것 d · 콘티 저장과 같은 규칙): 저장한 가운데 장은 밑그림이 같다 — 밑층을 이어 써야 이어서 고칠 때 층 나누기에 그림 값이 다시 들지 않는다.
  it('화살표를 저장해도 그 가운데 장의 밑층은 고친 가운데 장의 밑층으로 이어 쓴다', () => {
    const plated = withRealCleanPlate(sheet(), V2.direction, `${B}/clean.png`)!
    const next = withArrowVersion(plated, { id: 'arrows-1', direction: EDITED, at: 30, from: V2.direction })!
    expect(next.cleanDirection).toEqual({ url: `${B}/clean.png`, direction: EDITED })
    expect(realEditorPanel(next)?.cleanDirection?.url).toBe(`${B}/clean.png`)
    // 다른 가운데 장의 밑층(낡은 것)은 잇지 않는다.
    const stale = withRealCleanPlate(selectStoryboardVersion(sheet(), 'g1')!, V1.direction, `${B}/old-clean.png`)!
    const picked = selectStoryboardVersion(stale, 'g2')!
    expect(withArrowVersion(picked, { id: 'arrows-2', direction: EDITED, at: 30, from: V2.direction })!.cleanDirection).toEqual({ url: `${B}/old-clean.png`, direction: V1.direction })
  })

  // 왜: 화면이 본 가운데 장(그린 밑그림)과 지금 그림의 가운데 장이 다르면 다른 판 위에 그린 것이라 저장하지 않는다.
  it('지금 그림의 가운데 장이 화면이 고친 장과 다르면 판을 만들지 않는다', () => {
    expect(withArrowVersion(sheet(), { id: 'arrows-1', direction: EDITED, at: 30, from: V1.direction })).toBeNull()
    expect(withArrowVersion(null, { id: 'arrows-1', direction: EDITED, at: 30, from: V2.direction })).toBeNull()
  })
})

describe('다시 그린 끝 장 넣기', () => {
  const realEnd = { versionId: 'arrows-1', direction: EDITED, line: LINE }

  // 왜(리드 D1 A): 끝 장은 화살표를 저장한 그 판에 들어간다 — 판이 하나 더 생기지 않는다. 그 줄로 그렸다는 표시가 있어야 편집기 아래 "아직" 알림이 사라진다.
  it('끝 장 작업이 그린 끝 장은 화살표를 저장한 그 판에 들어가고 그 줄로 그렸다는 표시가 남는다', () => {
    const withRead = withRealDirectionRead(saved(), read(EDITED))!
    const next = withRealEndFrame(withRead, realEnd, NEW_END)!
    expect(storyboardImageVersions(next)).toHaveLength(3)
    expect(currentStoryboardVersion(next)!.frames).toEqual({ start: V2.start, direction: EDITED, end: NEW_END })
    expect(next.frames).toEqual({ start: V2.start, direction: EDITED, end: NEW_END })
    expect(freshDirectionRead(next)).toMatchObject({ en: LINE, endDrawn: NEW_END })
    // 다른 판은 그대로다.
    expect(storyboardImageVersions(next).find((v) => v.id === 'g2')!.frames).toEqual(V2)
  })

  // 왜(혼자 정한 것 i): 옛 화살표의 끝 장이 새 가운데 장 옆에 붙지 않게 — 그사이 그 판이 없어졌거나 가운데 장이 바뀌었으면 끼우지 않는다.
  it('끝 장이 오기 전에 그 판이 없어졌거나 가운데 장이 바뀌었으면 끼우지 않는다', () => {
    expect(withRealEndFrame(sheet(), realEnd, NEW_END)).toBeNull()
    expect(withRealEndFrame(saved(), { ...realEnd, direction: `${B}/other.png` }, NEW_END)).toBeNull()
    expect(withRealEndFrame(null, realEnd, NEW_END)).toBeNull()
  })

  // 왜(혼자 정한 것 i): 그리는 1분 사이 사람이 다른 판을 [채택]했으면 그 선택을 덮지 않는다 — 끝 장은 고친 판에만 넣는다.
  it('끝 장이 오기 전에 사람이 다른 판을 골랐으면 끝 장은 고친 판에만 들어가고 지금 그림은 그대로다', () => {
    const picked = selectStoryboardVersion(saved(), 'g1')!
    const next = withRealEndFrame(picked, realEnd, NEW_END)!
    expect(next.frames).toEqual(V1)
    expect(currentStoryboardVersion(next)!.id).toBe('g1')
    expect(storyboardImageVersions(next).find((v) => v.id === 'arrows-1')!.frames).toEqual({ start: V2.start, direction: EDITED, end: NEW_END })
  })
})

describe('읽은 줄 · 밑층 자리', () => {
  // 왜(리드 D2 A): 줄 · 밑층은 그 가운데 장의 것이다 — 다른 판을 고르거나 다시 그리면 가운데 장 주소가 달라 저절로 낡아 어디에도 안 쓰인다.
  it('실사에서 읽은 줄 · 밑층은 지금 가운데 장의 것일 때만 남고 다른 판을 고르면 낡는다', () => {
    expect(withRealDirectionRead(saved(), read(V2.direction))).toBeNull()
    expect(withRealCleanPlate(saved(), V2.direction, `${B}/clean.png`)).toBeNull()
    const kept = withRealCleanPlate(withRealDirectionRead(saved(), read(EDITED))!, EDITED, `${B}/clean.png`)!
    expect(kept.cleanDirection).toEqual({ url: `${B}/clean.png`, direction: EDITED })
    expect(freshDirectionRead(kept)?.en).toBe(LINE)
    const other = selectStoryboardVersion(kept, 'g2')!
    expect(freshDirectionRead(other)).toBeNull()
    expect(realEditorPanel(other)?.cleanDirection).toBeUndefined()
    // 고친 판을 다시 [채택]하면 줄 · 밑층이 다시 산다(마지막으로 고친 판 하나만 — 리드 D2 한계).
    const again = selectStoryboardVersion(other, 'arrows-1')!
    expect(freshDirectionRead(again)?.en).toBe(LINE)
    expect(realEditorPanel(again)?.cleanDirection?.url).toBe(`${B}/clean.png`)
  })

  // 왜(혼자 정한 것 d): 같은 가운데 장의 밑층이 있으면 편집기가 바로 쓴다(층 나누기에 그림 값이 다시 들지 않게). 편집기는 콘티 러프 모양을 받는다.
  it('편집기에는 지금 그림의 세 장과 그 가운데 장의 밑층 · 읽은 줄을 넘긴다', () => {
    const kept = withRealCleanPlate(withRealDirectionRead(saved(), read(EDITED))!, EDITED, `${B}/clean.png`)!
    const panel = realEditorPanel(kept)!
    expect(panel).toMatchObject({ status: 'completed', frames: { start: V2.start, direction: EDITED, end: V2.end } })
    expect(panel.cleanDirection).toEqual({ url: `${B}/clean.png`, for: panel.generatedAt })
    expect(freshDirectionRead(panel)?.en).toBe(LINE)
    expect(realEditorPanel({ url: V1.start, status: 'completed', generatedAt: 1, errorMessage: null })).toBeNull()
  })
})

describe('상세의 [화살표 고치기]', () => {
  // 왜(혼자 정한 것 h · g): 지금 그림만 고친다(어느 판을 고쳤는지 헷갈리지 않게). 콘티 · 올린 한 장에는 가운데 장이 없다.
  //   그 샷을 그리는 중이면 끝 장이 오기 전에 또 저장해 엉뚱한 판에 끝 장이 끼지 않게 잠근다.
  it('[화살표 고치기]는 지금 그림이 세 장 실사일 때만 보이고 지난 판을 보는 동안 · 세 장이 없는 그림에서는 보이지 않으며, 그 샷을 그리는 중이면 잠긴다', () => {
    expect(realArrowEntry({ image: sheet(), viewingPast: false, drawing: false })).toEqual({ show: true, locked: false })
    expect(realArrowEntry({ image: sheet(), viewingPast: false, drawing: true })).toEqual({ show: true, locked: true })
    expect(realArrowEntry({ image: sheet(), viewingPast: true, drawing: false }).show).toBe(false)
    expect(realArrowEntry({ image: null, viewingPast: false, drawing: false }).show).toBe(false)
    const upload = withStoryboardVersion(sheet(), { id: 'upload-1', url: `${B}/up.png`, generatedAt: 40, source: 'upload' }, { select: true })
    expect(realArrowEntry({ image: upload, viewingPast: false, drawing: false }).show).toBe(false)
  })
})

describe('검토 rev-realarrow 고침', () => {
  const realEnd = { versionId: 'arrows-1', direction: EDITED, line: LINE }

  // 왜(리드 2 — 저장 ↔ 끝 장 예약 사이 틈): 그사이 다시 저장해 판이 바뀌었는데 옛 판의 끝 장 작업 번호를 돌려주면 화면이 엉뚱한 작업을 기다리고
  //   새 판의 끝 장은 그려지지 않는다. 같은 판 · 같은 가운데 장의 작업일 때만 이어받는다.
  it('돌고 있는 실사 끝 장 작업은 지금 판 · 지금 가운데 장의 것일 때만 이어받을 수 있다', () => {
    expect(realEndReplayable(realEnd, saved())).toBe(true)
    expect(realEndReplayable({ ...realEnd, versionId: 'arrows-0' }, saved())).toBe(false)
    expect(realEndReplayable({ ...realEnd, direction: `${B}/older.png` }, saved())).toBe(false)
    expect(realEndReplayable(realEnd, selectStoryboardVersion(saved(), 'g2'))).toBe(false)
  })

  // 왜(리드 C): 실사 줄은 사람이 고친 화살표를 읽은 줄이다 — 고치지 않은 실사(콘티대로 그린 그림)를 읽은 줄이 콘티 줄을 이기면 안 된다.
  //   화살표 판(arrows-…)이거나, 그 판을 지금 그림을 참고로 고쳐 줄을 이어받은 판(리드 A)만 받는다.
  it('실사 줄 읽기 · 끝 장 다시 그리기는 화살표를 고친 판에만 받는다', () => {
    expect(isRealArrowImage(saved())).toBe(true)
    expect(isRealArrowImage(sheet())).toBe(false)
    expect(isRealArrowImage(selectStoryboardVersion(saved(), 'g2'))).toBe(false)
    const inherited = withFixedRealRead(
      withStoryboardVersion(withRealDirectionRead(saved(), read(EDITED))!, { id: 'g3', url: `${B}/f-start.png`, frames: { start: `${B}/f-start.png`, direction: `${B}/f-dir.png`, end: `${B}/f-end.png` }, generatedAt: 40, source: 'generated' }, { select: true }),
      { direction: EDITED, end: V2.end },
      { direction: `${B}/f-dir.png`, end: `${B}/f-end.png` },
    )
    expect(isRealArrowImage(inherited)).toBe(true)
  })

  // 왜(리드 A): 화살표 판을 "지금 그림을 참고로" 고치는 채팅 고치기는 화살표를 그대로 두고 다시 그린다 — 그 움직임 줄도 새 판으로 이어 간다.
  //   그 줄로 그린 끝 장을 바탕으로 고쳤으면 새 끝 장도 그 줄로 그린 것으로 본다.
  it('화살표 판을 지금 그림을 참고로 고쳐 다시 그리면 새 판도 그 실사 줄을 이어받는다', () => {
    const drawn = withRealEndFrame(withRealDirectionRead(saved(), read(EDITED))!, realEnd, NEW_END)!
    const fixed = withStoryboardVersion(drawn, { id: 'g3', url: `${B}/f-start.png`, frames: { start: `${B}/f-start.png`, direction: `${B}/f-dir.png`, end: `${B}/f-end.png` }, generatedAt: 40, source: 'generated' }, { select: true })
    const next = withFixedRealRead(fixed, { direction: EDITED, end: NEW_END }, { direction: `${B}/f-dir.png`, end: `${B}/f-end.png` })
    expect(freshDirectionRead(next)).toMatchObject({ en: LINE, direction: `${B}/f-dir.png`, endDrawn: `${B}/f-end.png` })
    // 끝 장을 그 줄로 그리기 전에 고쳤으면 줄만 잇고 "그 줄로 그린 끝 장" 표시는 비운다.
    const notDrawn = withFixedRealRead(withStoryboardVersion(withRealDirectionRead(saved(), read(EDITED))!, { id: 'g4', url: `${B}/f-start.png`, frames: { start: `${B}/f-start.png`, direction: `${B}/f-dir.png`, end: `${B}/f-end.png` }, generatedAt: 41, source: 'generated' }, { select: true }), { direction: EDITED, end: V2.end }, { direction: `${B}/f-dir.png`, end: `${B}/f-end.png` })
    expect(freshDirectionRead(notDrawn)).toMatchObject({ direction: `${B}/f-dir.png`, endDrawn: null })
  })

  // 왜(리드 A): Director [다시 만들기]처럼 지금 그림을 바탕으로 하지 않는 다시 그리기는 콘티대로 그린 그림이다 — 실사 줄을 잇지 않는다.
  //   다른 판의 줄(바탕 가운데 장과 다른 줄)도 잇지 않는다.
  it('지금 그림을 바탕으로 하지 않는 다시 그리기는 실사 줄을 이어받지 않는다', () => {
    const withRead = withRealDirectionRead(saved(), read(EDITED))!
    const remade = withStoryboardVersion(withRead, { id: 'g3', url: `${B}/r-start.png`, frames: { start: `${B}/r-start.png`, direction: `${B}/r-dir.png`, end: `${B}/r-end.png` }, generatedAt: 40, source: 'generated' }, { select: true })
    expect(withFixedRealRead(remade, null, { direction: `${B}/r-dir.png`, end: `${B}/r-end.png` })).toBe(remade)
    expect(freshDirectionRead(withFixedRealRead(remade, { direction: V1.direction, end: V1.end }, { direction: `${B}/r-dir.png`, end: `${B}/r-end.png` }))).toBeNull()
  })

  // 왜(리드 D): 16:9 큰 칸 PNG 는 요청 몸 상한(4.5MB)에 닿을 수 있다 — 3MB 를 넘으면 실사 길은 JPEG 로 보낸다(콘티는 지금처럼 PNG).
  it('실사 가운데 장 저장 그림은 PNG 가 3MB 이하면 PNG, 넘으면 JPEG 로 보낸다', () => {
    expect(REAL_SAVE_PNG_LIMIT).toBe(3 * 1024 * 1024)
    expect(realSaveImageType(REAL_SAVE_PNG_LIMIT)).toBe('image/png')
    expect(realSaveImageType(REAL_SAVE_PNG_LIMIT + 1)).toBe('image/jpeg')
  })
})
