// 약속 J — 검은 화면 클립은 다른 클립처럼 다뤄지고 내보내기와 미리보기가 같다 (_tdd.md J, 2026-09-04 오너 확정)
//
//   오너 결정: J4 = 손잡이 + 더블클릭/시간 클릭 시 숫자 입력, J6 = Artist·Director 이미지 선택 + 내 파일 업로드 둘 다,
//   배치 = 이미지·글자 자유 배치 + 레이어 순서 우클릭 메뉴, 파일 = supabase 에 올려 두되 서버·DB 부담이 적게. 문장 하나 = 테스트 하나.
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isTitleCardShotId, selectTimelineLayout, useEditorStore } from '@/stores/editor-store'
import {
  DEFAULT_TITLE_CARD_LAYOUT,
  TITLE_CARD_DEFAULT_SECONDS,
  clampLayer,
  layoutTitleText,
  resolveTitleCardLayout,
} from '@/lib/editor/title-card'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const api = () => useEditorStore.getState()

/** 스토어를 비우고 타이틀 카드 하나를 넣는다. */
function seedTitleCard(): string {
  api().reset()
  api().addTitleCard(0)
  const id = api().shots.find((s) => isTitleCardShotId(s.shotId))!.shotId
  return id
}
const measure = (s: string) => s.length * 10 // 글자당 10px 가정

beforeEach(() => {
  api().reset()
})

describe('약속 J — 검은 화면 클립', () => {
  it('검은 화면 클립은 다른 영상 클립과 똑같이 자르고 늘이고 옮길 수 있다', () => {
    const id = seedTitleCard()
    // 자르기
    api().splitVideoClipAt(id, 2)
    const pieces = api().shots.filter((s) => isTitleCardShotId(s.shotId))
    expect(pieces).toHaveLength(2)
    // 늘이기(손잡이 = setTrim) — 다른 클립과 같은 액션
    api().setTrim(id, 0, 8)
    expect(api().videoClips.find((c) => c.shotId === id)?.trimEnd).toBe(8)
    // 옮기기 — 같은 순서 배열(clipOrder)을 쓴다
    const sceneId = pieces[0]!.sceneId
    const order = api().clipOrder[sceneId] ?? []
    expect(order).toContain(id)
    expect(order).toContain(pieces[1]!.shotId)
  })

  it('가운데서 자르면 두 조각 모두 검은 화면 클립으로 남고 새로고침해도 사라지지 않는다', () => {
    const id = seedTitleCard()
    api().splitVideoClipAt(id, 2.5)
    const [a, b] = api().shots.filter((s) => s.shotId.includes('__t')).map((s) => s.shotId)
    expect(isTitleCardShotId(a!)).toBe(true)
    expect(isTitleCardShotId(b!)).toBe(true) // 자른 조각(…__tX__cY)도 타이틀 카드
    expect(b).toMatch(/__t[A-Za-z0-9-]+__c[A-Za-z0-9-]+$/)
    // 새로고침 복원은 타이틀 카드를 원본 샷 검증 없이 스냅샷 그대로 되살린다 — 자른 조각도 그 규칙을 탄다.
    const store = read('src/stores/editor-store.ts')
    expect(store).toMatch(/if \(isTitleCardShotId\(savedShot\.shotId\)\) \{\s*restoredShots\.push\(savedShot\)/)
    expect(store).toMatch(/const TITLE_CARD_RE = \/__t\[A-Za-z0-9-\]\+\(\?:__\[ci\]\[A-Za-z0-9-\]\+\)\*\$\//)
  })

  it('5초보다 길게 늘릴 수 있고, 늘린 만큼 미리보기와 내보낸 영상의 재생 시간이 길어진다', () => {
    const id = seedTitleCard()
    api().setTrim(id, 0, 12)
    const shot = api().shots.find((s) => s.shotId === id)!
    expect(shot.durationSeconds).toBe(12)
    const item = selectTimelineLayout(api()).find((l) => l.shotId === id)!
    expect(item.durationSec).toBe(12)
    // 타임라인 오른쪽 손잡이는 타이틀 카드에 원본 끝 상한을 두지 않는다(600초).
    expect(read('src/features/editor/timeline.tsx')).toMatch(/isTitleCardShotId\(item\.shotId\)\s*\?\s*startSec \+ 600/)
    // 내보내기는 같은 layout(durationSec)으로 카드 구간을 기다린다.
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/await waitUntil\(item\.startSec \+ item\.durationSec\)\s*activeTitle = null/)
  })

  it('길이는 손잡이와 초 단위 숫자 입력으로 바꾼다', () => {
    const id = seedTitleCard()
    api().setTitleCardDuration(id, 7.5)
    expect(api().shots.find((s) => s.shotId === id)?.durationSeconds).toBe(7.5)
    expect(api().videoClips.find((c) => c.shotId === id)?.trimEnd).toBe(7.5)
    // 되돌리기 스냅샷을 남긴다.
    expect(api().past.length).toBeGreaterThan(0)
    const tl = read('src/features/editor/timeline.tsx')
    expect(tl).toMatch(/setDurationEdit\(\{ shotId: item\.shotId, value: item\.durationSec\.toFixed\(1\) \}\)/)
    expect(tl).toMatch(/onSetTitleCardDuration\(item\.shotId, n\)/)
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/onSetTitleCardDuration=\{setTitleCardDuration\}/)
  })

  it('기본 길이는 5초다', () => {
    const id = seedTitleCard()
    expect(api().shots.find((s) => s.shotId === id)?.durationSeconds).toBe(5)
    expect(TITLE_CARD_DEFAULT_SECONDS).toBe(5)
  })

  it('이미지를 Artist·Director에서 만든 것 중 고르거나 내 컴퓨터 파일을 올려 넣으면 미리보기와 내보낸 영상 둘 다에 보인다', () => {
    const id = seedTitleCard()
    api().updateTitleCard(id, { imageUrl: 'https://m/pic.png' })
    expect(api().shots.find((s) => s.shotId === id)?.titleCard?.imageUrl).toBe('https://m/pic.png')
    const picker = read('src/features/editor/title-image-picker.tsx')
    expect(picker).toMatch(/collectProjectImages\(\{ projectId, characters, worlds, shots \}\)/)
    expect(picker).toMatch(/fetch\('\/api\/editor\/title-image', \{ method: 'POST', body: form \}\)/)
    // 미리보기 무대와 내보내기가 같은 imageRect 로 그린다.
    expect(read('src/features/editor/title-card-stage.tsx')).toMatch(/imageRect\(layout\.image, size\.w, size\.h, natural\)/)
    const shared = read('src/lib/editor/title-card.ts')
    expect(shared).toMatch(/const r = imageRect\(layout\.image, W, H, \{ width: image\.naturalWidth, height: image\.naturalHeight \}\)/)
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/drawTitleCard\(ctx, W, H, activeTitle\.card, activeTitle\.image\)/)
    // 업로드 라우트는 보관함에만 올리고 DB 행을 만들지 않는다.
    const route = read('src/app/api/editor/title-image/route.ts')
    expect(route).toMatch(/mediaUpload\(path, buf, \{ contentType: file\.type \}\)/)
    expect(route).not.toMatch(/\.insert\(|\.update\(/)
  })

  it('글자를 비우면 내보낸 영상에 아무 글자도 찍히지 않는다', () => {
    expect(layoutTitleText('', 500, measure)).toEqual([])
    expect(layoutTitleText('   \n  ', 500, measure)).toEqual([])
    const render = read('src/lib/editor-draft-render.ts')
    expect(render).not.toMatch(/shot\.titleCard\.text \|\| item\.shotId/)
    expect(render).toMatch(/activeLabel = ''\s*videoActive = false/)
  })

  it('내보낸 영상의 글자 줄바꿈이 미리보기와 같다', () => {
    // 같은 순수 함수가 두 곳의 줄을 정한다: 줄바꿈 문자는 그대로, 넘치면 단어 단위, 한 낱말이 넘치면 글자 단위.
    expect(layoutTitleText('겨울\n산맥', 500, measure)).toEqual(['겨울', '산맥'])
    expect(layoutTitleText('one two three four', 90, measure)).toEqual(['one two', 'three', 'four'])
    expect(layoutTitleText('가나다라마바사', 40, measure)).toEqual(['가나다라', '마바사'])
    expect(layoutTitleText('a\n\nb', 500, measure)).toEqual(['a', '', 'b'])
    const stage = read('src/features/editor/title-card-stage.tsx')
    expect(stage).toMatch(/layoutTitleText\(card\.text \?\? '', layout\.text\.w \* size\.w, measureWith\(titleCardFont\(size\.h\)\)\)/)
    expect(read('src/lib/editor/title-card.ts')).toMatch(/const lines = layoutTitleText\(card\.text \?\? '', boxW, \(s\) => ctx\.measureText\(s\)\.width\)/)
  })

  it('이미지와 글자는 자유 배치이고 레이어 순서는 우클릭 메뉴로 정한다', () => {
    const id = seedTitleCard()
    api().updateTitleCard(id, { layout: { ...DEFAULT_TITLE_CARD_LAYOUT, text: { x: 0.2, y: 0.1, w: 0.6 }, order: 'image-over-text' } })
    const card = api().shots.find((s) => s.shotId === id)!.titleCard!
    expect(resolveTitleCardLayout(card)).toMatchObject({ text: { x: 0.2, y: 0.1, w: 0.6 }, order: 'image-over-text' })
    // 카드 밖으로 못 나간다.
    expect(clampLayer({ x: 0.9, y: 2, w: 0.5 })).toEqual({ x: 0.5, y: 0.95, w: 0.5 })
    const stage = read('src/features/editor/title-card-stage.tsx')
    expect(stage).toMatch(/onPointerDown=\{startDrag\('text'\)\}/)
    expect(stage).toMatch(/onPointerDown=\{startDrag\('image'\)\}/)
    expect(stage).toMatch(/setOrder\('text-over-image'\)/)
    expect(stage).toMatch(/setOrder\('image-over-text'\)/)
    expect(stage).toMatch(/<ContextMenuContent/)
  })
})
