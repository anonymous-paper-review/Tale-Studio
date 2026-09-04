// 약속 K — 클립마다 자막 한 덩어리를 쓰고 옮길 수 있고 내보낸 영상에도 박힌다 (_tdd.md K, 2026-09-04)
//
//   자막의 진실은 편집기 샷의 subtitle(글자·자리 비율)이고, 손대기 전에는 Writer 대사가 초기값이다. 미리보기 오버레이와 내보내기
//   캔버스가 같은 모듈(src/lib/editor/subtitle.ts)로 자리·줄바꿈을 정한다. 문장 하나 = 테스트 하나.
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isTitleCardShotId, useEditorStore } from '@/stores/editor-store'
import { DEFAULT_SUBTITLE_POS, initialSubtitleText, nudgeSubtitle, resolveSubtitle } from '@/lib/editor/subtitle'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const api = () => useEditorStore.getState()

function seedTitleCard(): string {
  api().addTitleCard(0)
  return api().shots.find((s) => isTitleCardShotId(s.shotId))!.shotId
}
const line = (text: string) => ({ characterId: 'c1', text, emotion: '', delivery: '', durationHint: 1 })

beforeEach(() => {
  api().reset()
})

describe('약속 K — 클립 자막', () => {
  it('클립마다 자막 한 덩어리를 쓸 수 있다', () => {
    const id = seedTitleCard()
    api().setSubtitle(id, { text: '겨울이 왔다' })
    expect(resolveSubtitle(api().shots.find((s) => s.shotId === id)!)).toMatchObject({ text: '겨울이 왔다' })
    // 샷(클립)마다 subtitle 하나 — 타입에 한 덩어리로 정의.
    expect(read('src/types/shot.ts')).toMatch(/subtitle\?: ShotSubtitle \| null/)
  })

  it('자막은 그 클립이 재생되는 동안만 보인다', () => {
    // 미리보기는 지금 재생 중인 샷(activeShot)의 자막만 얹고, 내보내기는 세그먼트가 바뀔 때마다 그 샷의 자막으로 바꾼다.
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer.match(/subtitle=\{resolveSubtitle\(activeShot\)\}/g)?.length).toBe(2)
    const render = read('src/lib/editor-draft-render.ts')
    expect(render).toMatch(/activeSubtitle = shot \? resolveSubtitle\(shot\) : null/)
    expect(render).toMatch(/if \(activeSubtitle\) drawSubtitle\(ctx, W, H, activeSubtitle\)/)
  })

  it('Writer가 쓴 대사가 있는 클립은 그 대사가 자막 초기값으로 들어 있다', () => {
    expect(initialSubtitleText([line('안녕'), line(' 잘 지냈어? ')])).toBe('안녕\n잘 지냈어?')
    expect(resolveSubtitle({ dialogueLines: [line('첫 대사')] })).toEqual({ text: '첫 대사', ...DEFAULT_SUBTITLE_POS })
    expect(resolveSubtitle({ dialogueLines: [] }).text).toBe('')
  })

  it('미리보기에서 자막을 누르면 바로 고칠 수 있다', () => {
    const layer = read('src/features/editor/subtitle-layer.tsx')
    expect(layer).toMatch(/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\)\s*if \(!editing\) \{\s*onBeforeChange\(\)\s*setEditing\(true\)/)
    expect(layer).toMatch(/<Textarea[\s\S]*onChange=\{\(e\) => onChange\(\{ text: e\.target\.value \}\)\}/)
  })

  it('자막을 마우스로 끌거나 방향키로 옮길 수 있고, 옮긴 위치가 저장된다', () => {
    const id = seedTitleCard()
    api().setSubtitle(id, { text: 'a' })
    api().setSubtitle(id, { x: 0.3, y: 0.2 })
    expect(api().shots.find((s) => s.shotId === id)!.subtitle).toEqual({ text: 'a', x: 0.3, y: 0.2 })
    // 방향키: 1%씩, Shift 는 5%씩. 화면 밖으로 못 나간다.
    expect(nudgeSubtitle({ text: 'a', x: 0.5, y: 0.9 }, 'ArrowLeft', false)).toEqual({ text: 'a', x: 0.49, y: 0.9 })
    expect(nudgeSubtitle({ text: 'a', x: 0.5, y: 0.9 }, 'ArrowUp', true)).toEqual({ text: 'a', x: 0.5, y: 0.85 })
    expect(nudgeSubtitle({ text: 'a', x: 0.5, y: 0.99 }, 'ArrowDown', true)?.y).toBe(1)
    expect(nudgeSubtitle({ text: 'a', x: 0.5, y: 0.9 }, 'Enter', false)).toBeNull()
    const layer = read('src/features/editor/subtitle-layer.tsx')
    expect(layer).toMatch(/onPointerDown=\{startDrag\}/)
    expect(layer).toMatch(/const next = nudgeSubtitle\(subtitle, e\.key, e\.shiftKey\)/)
  })

  it('자막 내용과 위치가 내보낸 영상에 그대로 반영된다', () => {
    // 같은 순수 함수(resolveSubtitle → drawSubtitle)가 자리(x·W, y·H)와 줄바꿈(layoutTitleText)을 정한다.
    const lib = read('src/lib/editor/subtitle.ts')
    expect(lib).toMatch(/ctx\.strokeText\(line, sub\.x \* W, y\)\s*ctx\.fillText\(line, sub\.x \* W, y\)/)
    expect(lib).toMatch(/layoutTitleText\(sub\.text \?\? '', SUBTITLE_MAX_WIDTH_RATIO \* W/)
    const layer = read('src/features/editor/subtitle-layer.tsx')
    expect(layer).toMatch(/left: `\$\{subtitle\.x \* 100\}%`,\s*top: `\$\{subtitle\.y \* 100\}%`/)
    expect(layer).toMatch(/layoutTitleText\(subtitle\.text \?\? '', SUBTITLE_MAX_WIDTH_RATIO \* size\.w/)
  })

  it('자막을 지우면 아무것도 보이지 않는다', () => {
    const id = seedTitleCard()
    api().setSubtitle(id, { text: '지울 글자' })
    api().setSubtitle(id, null)
    expect(resolveSubtitle(api().shots.find((s) => s.shotId === id)!).text).toBe('')
    // 대사가 있어도 지운 것은 빈 글자로 남는다.
    expect(resolveSubtitle({ subtitle: null, dialogueLines: [line('대사')] }).text).toBe('')
    // 빈 글자는 내보내기에서 아무것도 그리지 않는다.
    expect(read('src/lib/editor/subtitle.ts')).toMatch(/if \(!lines\.length\) return/)
  })

  it('자막은 새로고침해도 남는다', () => {
    // 스냅샷은 shots 전체를 저장하고, 복원은 DB 원본 샷에도 저장된 자막을 다시 입힌다.
    const store = read('src/stores/editor-store.ts')
    expect(store).toMatch(/savedSubtitleById\.set\(savedShot\.shotId, savedShot\.subtitle \?\? null\)/)
    expect(store).toMatch(/const combinedShots = restoredShots\.length \? \[\.\.\.baseShots, \.\.\.restoredShots\] : baseShots/)
    expect(read('src/lib/editor-persistence.ts')).toMatch(/shots: Shot\[\]/)
  })

  it('처음 위치는 아래 가운데다', () => {
    expect(DEFAULT_SUBTITLE_POS).toEqual({ x: 0.5, y: 0.9 })
    expect(resolveSubtitle({ dialogueLines: [line('x')] })).toMatchObject({ x: 0.5, y: 0.9 })
    // 글자 모양: 흰 글자에 검은 테두리(미리보기 text-stroke, 내보내기 strokeText 검정 + fillText 흰색).
    expect(read('src/features/editor/subtitle-layer.tsx')).toMatch(/WebkitTextStroke: `\$\{Math\.max\(1, fontPx \* SUBTITLE_STROKE_RATIO\)\}px #000`/)
    expect(read('src/lib/editor/subtitle.ts')).toMatch(/ctx\.strokeStyle = '#000000'\s*ctx\.fillStyle = '#ffffff'/)
  })
})
