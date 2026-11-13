// Editor 다섯 가지 (2026-09-08 오너 지시) — 타이틀 카드 삽입 시 오디오 동행 · 디졸브 · 자막 자리표시 숨김 · 안내 문구 삭제 · 축척 +/−
//
//   디졸브는 브라우저 렌더링 부담을 피해 검은 막의 투명도만 시간에 따라 바꿔 그린다(오너 결정). 문장 하나 = 테스트 하나.
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PX_PER_SEC_MAX, PX_PER_SEC_MIN, isTitleCardShotId, selectTimelineLayout, useEditorStore, zoomStep } from '@/stores/editor-store'
import { DISSOLVE_DEFAULT_SEC, dissolveOpacityAt } from '@/lib/editor/transition'
import type { Shot, VideoClip } from '@/types'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const api = () => useEditorStore.getState()

function shot(shotId: string, durationSeconds: number): Shot {
  return {
    shotId, sceneId: 'sc_01', shotType: 'MS', actionDescription: shotId, characters: [], durationSeconds,
    generationMethod: 'T2V', dialogueLines: [], camera: {} as Shot['camera'], lighting: {} as Shot['lighting'], referenceImageUrl: null,
  } as Shot
}
function clip(shotId: string): VideoClip {
  return { shotId, url: `https://x/${shotId}.mp4`, status: 'completed', thumbnailUrl: null }
}
/** 5초짜리 영상 두 개와 오디오 두 개(2초·6초 시작)를 깐다. */
function seedTwoShotsWithAudio() {
  api().reset()
  useEditorStore.setState({
    shots: [shot('sh_1', 5), shot('sh_2', 5)],
    videoClips: [clip('sh_1'), clip('sh_2')],
    clipOrder: { sc_01: ['sh_1', 'sh_2'] },
    selectedSceneId: 'sc_01',
  })
  const before = api().addAudioClip({ name: 'before', url: 'blob:a', startSec: 2, durationSec: 2 })
  const after = api().addAudioClip({ name: 'after', url: 'blob:b', startSec: 6, durationSec: 3 })
  return { before, after }
}

beforeEach(() => {
  api().reset()
})

describe('1 · 타이틀 카드를 끼워 넣으면 오디오도 영상처럼 밀린다', () => {
  it('타이틀 카드를 끼워 넣으면 그 자리 뒤에서 시작하는 오디오는 카드 길이만큼 뒤로 밀리고, 앞의 오디오는 그대로다', () => {
    const { before, after } = seedTwoShotsWithAudio()
    api().addTitleCard(5) // 두 영상 사이(5초 지점)
    const layout = selectTimelineLayout(api())
    const card = layout.find((l) => isTitleCardShotId(l.shotId))!
    expect(card.startSec).toBe(5)
    expect(api().audioClips.find((a) => a.id === after)!.startSec).toBe(6 + card.durationSec)
    expect(api().audioClips.find((a) => a.id === before)!.startSec).toBe(2)
  })
})

describe('2 · 디졸브 — 검은 막의 투명도만 시간에 따라 바뀐다', () => {
  it('클립 앞에 디졸브를 넣으면 경계에서 검은 막이 가장 짙고(1), 디졸브 길이의 절반 밖에서는 없다(0)', () => {
    const layout = [
      { shotId: 'a', startSec: 0, durationSec: 5 },
      { shotId: 'b', startSec: 5, durationSec: 5 },
    ]
    const clips: VideoClip[] = [clip('a'), { ...clip('b'), transitionIn: { type: 'dissolve', durationSec: 2 } }]
    expect(dissolveOpacityAt(layout, clips, 5)).toBe(1)
    expect(dissolveOpacityAt(layout, clips, 4.5)).toBeCloseTo(0.5, 5)
    expect(dissolveOpacityAt(layout, clips, 5.5)).toBeCloseTo(0.5, 5)
    expect(dissolveOpacityAt(layout, clips, 4)).toBe(0)
    expect(dissolveOpacityAt(layout, clips, 6)).toBe(0)
    expect(dissolveOpacityAt(layout, clips, 2)).toBe(0)
    expect(DISSOLVE_DEFAULT_SEC).toBe(1)
  })

  it('디졸브는 클립 우클릭 메뉴에서 넣고 빼며 길이를 고르고, 되돌리기가 되며, 새로고침해도 남는다', () => {
    seedTwoShotsWithAudio()
    api().setTransitionIn('sh_2', { type: 'dissolve', durationSec: 2 })
    expect(api().videoClips.find((c) => c.shotId === 'sh_2')!.transitionIn).toEqual({ type: 'dissolve', durationSec: 2 })
    api().undo()
    expect(api().videoClips.find((c) => c.shotId === 'sh_2')!.transitionIn ?? null).toBeNull()
    api().redo()
    api().setTransitionIn('sh_2', null)
    expect(api().videoClips.find((c) => c.shotId === 'sh_2')!.transitionIn ?? null).toBeNull()
    const store = read('src/stores/editor-store.ts')
    expect(store.match(/transitionIn: savedClip\?\.transitionIn \?\? null/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    // 우클릭 메뉴는 시작 · 끝 전환에서 세 전환(검정으로 물들이기 = 예전 디졸브)과 길이를 고른다(2단계 ⑤, 오너 결정 4 · 리드 승인 2026-11-14).
    //   (옛 글자: 메뉴 이름 t('Dissolve (dip to black)') · onSetTransitionIn( 부름)
    const timeline = read('src/features/editor/timeline.tsx')
    expect(timeline).toMatch(/t\('Start transition'\)/)
    expect(timeline).toMatch(/onSetTransition\(/)
  })

  it('드래프트 렌더도 같은 검은 막을 프레임에 얹는다 — 미리보기와 내보내기가 같은 함수를 쓴다', () => {
    // 미리 보기 · 내보내기가 같은 그릴 것 목록의 검은 막을 쓰고, 목록이 이 함수로 센다(2단계 ⑦-2 — 옛 글자: 내보내기 안의
    //   const dip = dissolveOpacityAt(layout, videoClips, clock)).
    const render = read('src/lib/editor-draft-render.ts')
    expect(render).toMatch(/const dip = plan\.black/)
    expect(render).toMatch(/ctx\.fillStyle = `rgba\(0,0,0,\$\{dip\}\)`/)
    expect(read('src/stores/editor-store.ts')).toMatch(/dissolveOpacityAt\(program, input\.videoClips, t\)/)
  })

  it('미리보기는 검은 막의 투명도만 바꿔 디졸브를 그린다(영상 픽셀은 손대지 않는다)', () => {
    // 검은 막의 투명도는 그릴 것 목록(selectFrameAt)이 같은 함수로 센다 — 2단계 ⑦-1 에서 모니터의 셈을 목록 한 곳으로 옮겼다
    //   (옛 글자: 미리보기 안의 dissolveOpacityAt(layout, st.videoClips, t)).
    expect(read('src/stores/editor-store.ts')).toMatch(/dissolveOpacityAt\(program, input\.videoClips, t\)/)
    const previewer = read('src/features/editor/video-previewer.tsx')
    expect(previewer).toMatch(/dissolveRef\.current\.style\.opacity = String\(plan\.black\)/)
    expect(previewer).toMatch(/data-testid="dissolve-overlay"/)
    expect(previewer).toMatch(/bg-black/)
  })
})

describe('3 · 자막 자리표시 문구', () => {
  it('"누르면 자막을 넣어요"는 자막 상자에 마우스를 올렸을 때만 보이고, 재생 중에는 보이지 않는다', () => {
    const layer = read('src/features/editor/subtitle-layer.tsx')
    expect(layer).toMatch(/group\/sub/)
    expect(layer).toMatch(/opacity-0 [^"]*group-hover\/sub:opacity-100/)
    expect(layer).toMatch(/isPlaying/)
    expect(layer).toMatch(/!isPlaying[^\n]*t\('Click to add a subtitle'\)|t\('Click to add a subtitle'\)[^\n]*!isPlaying/)
  })
})

describe('4 · 안내 문구 삭제', () => {
  it('타임라인 위의 "클립 우클릭 → 속도·분할·삭제" 문구는 없다', () => {
    expect(read('src/app/studio/editor/page.tsx')).not.toMatch(/Right-click a clip/)
    expect(read('src/lib/i18n/messages-ko.ts')).not.toMatch(/클립 우클릭 → 속도·분할·삭제/)
  })
})

describe('5 · 축척 지표와 +/− 버튼', () => {
  it('+/− 는 축척을 한 단계씩 키우고 줄이며 한계 안에 머문다', () => {
    expect(zoomStep(40, 'in')).toBeCloseTo(50, 5)
    expect(zoomStep(40, 'out')).toBeCloseTo(32, 5)
    expect(zoomStep(PX_PER_SEC_MAX, 'in')).toBe(PX_PER_SEC_MAX)
    expect(zoomStep(PX_PER_SEC_MIN, 'out')).toBe(PX_PER_SEC_MIN)
    api().setPxPerSec(zoomStep(api().pxPerSec, 'in'))
    expect(api().pxPerSec).toBeGreaterThan(PX_PER_SEC_MIN)
  })

  it('타임라인 머리의 −·+ 는 축척을 한 단계씩 바꾸고, 축척 숫자("1초 = N px")와 [전체 보기]는 없다', () => {
    // 왜: 결정 페이지 추천(2026-11-14 오너 "나머지는 추천대로") — "전체 보기는 모니터 재생으로", "1초 = N px 는 없앰".
    //   축척 −·+ 는 시안 E1 409:4806 · 409:4808 타임라인 머리에 남는다. (옛 이름: 전체 보기 왼쪽에 −·지표·+ 가 있고 지표는 "1초 = N px" 를 보여 준다)
    const page = read('src/app/studio/editor/page.tsx')
    expect(page).toMatch(/t\('Zoom out timeline'\)/)
    expect(page).toMatch(/zoomStep\(pxPerSec, 'in'\)/)
    expect(page).toMatch(/zoomStep\(pxPerSec, 'out'\)/)
    expect(page).not.toMatch(/1s = \{px\}px/)
    expect(page).not.toMatch(/t\('Watch all'\)/)
    const ko = read('src/lib/i18n/messages-ko.ts')
    expect(ko).not.toMatch(/'1s = \{px\}px'/)
  })
})
