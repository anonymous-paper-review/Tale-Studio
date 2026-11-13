// Editor 새 배치(판 여섯 개, 시안 E1)가 지금 기능을 새 자리에 그대로 옮겨 보이는지 — 시퀀스 정보 · 효과 컨트롤 · 프로젝트 판 · 모니터 단추 · 내보내기 탭 · 단축키를 검사한다 (2단계 ①, 2026-11-14)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
  return { projectId: 'project-panels' as string | null }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign((pick: (s: { projectId: string | null }) => unknown) => pick({ projectId: mocks.projectId }), {
    getState: () => ({ projectId: mocks.projectId }),
  }),
}))

import { useEditorStore, selectTimelineLayout } from '@/stores/editor-store'
import { useLocaleStore } from '@/stores/locale-store'
import { editPointTarget } from '@/lib/editor/timeline-segments'
import { SEQUENCE_FPS, exportFrameSize, formatTimecode, sequenceInfoLine } from '@/lib/editor/sequence-info'
import { EffectControls } from '@/features/editor/effect-controls'
import { ProjectPanel } from '@/features/editor/video-source-panel'
import { EditorTopActions, ExportTab, ShortcutsList, EDITOR_SHORTCUTS } from '@/features/editor/editor-workbar'
import { finishEditorOpen } from '@/features/editor/open-editor'
import { handleEditorKey } from '@/features/editor/use-editor-playback'
import type { AudioTrackClip, Shot, VideoClip } from '@/types'

const read = (file: string) => readFileSync(file, 'utf8')
const api = () => useEditorStore.getState()
const shot = (shotId: string, shotType: string, durationSeconds = 3): Shot =>
  ({ shotId, sceneId: 'sc_1', shotType, actionDescription: '', characters: [], durationSeconds, generationMethod: 'T2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as Shot
const clip = (shotId: string, patch: Partial<VideoClip> = {}): VideoClip => ({ shotId, url: `https://video.test/${shotId}.mp4`, status: 'completed', thumbnailUrl: null, takeNumber: 1, ...patch })
const music = (patch: Partial<AudioTrackClip> = {}): AudioTrackClip => ({ id: 'bgm', name: '잔잔한 피아노.mp3', url: 'blob:bgm', startSec: 0, durationSec: 4, volume: 0.6, muted: false, trackId: 'atrack_1', linkedShotId: null, ...patch })
/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(tests/writer/prose-proposal-box.test.ts 와 같은 방법). */
function html(el: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useEditorStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(el)
}
/** 그린 글자만(태그 · 속성 빼고). */
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
/** 골라져 있는(aria-pressed="true") 칩 글자. */
const pressed = (markup: string) => [...markup.matchAll(/aria-pressed="true"[^>]*>([^<]*)</g)].map((m) => m[1].trim())

function seed() {
  api().reset()
  useEditorStore.setState({
    shots: [shot('A', 'WS'), shot('B', 'MS'), shot('C', 'CU'), shot('D', 'MCU')],
    videoClips: [clip('A'), clip('B', { takeNumber: 3 }), clip('C', { url: null, status: 'pending', takeNumber: undefined }), clip('D')],
    clipOrder: { sc_1: ['A', 'B', 'D'] },
    audioClips: [music()],
    audioTracks: [{ id: 'atrack_1' }],
    selectedSceneId: 'sc_1',
    loadStatus: 'ready',
  })
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  seed()
})
afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
})

describe('위 둘째 줄 · 시퀀스 정보', () => {
  it('시퀀스 정보는 길이 · 가로×세로 · 초당 장 수를 내보내기가 만드는 값으로 보인다 — 세로 9:16 이면 "00:00:33:00 · 720×1280 · 30fps"', () => {
    // 왜: 시안 E1 409:4639 "00:00:15:00 · 1080×1920 · 24fps"는 예시다. 지금 내보내기는 첫 영상 비율로 긴 변 1280, 초당 30장으로 녹화한다.
    expect(sequenceInfoLine(33, 'vertical_9:16')).toBe('00:00:33:00 · 720×1280 · 30fps')
    expect(exportFrameSize('horizontal_16:9')).toEqual({ width: 1280, height: 720 })
    expect(exportFrameSize('square_1:1')).toEqual({ width: 1280, height: 1280 })
    // 시네마는 영상 모델이 16:9 로 만든다. 포맷을 모르면 내보내기의 기본 1280×720.
    expect(exportFrameSize('cinema_2.39:1')).toEqual({ width: 1280, height: 720 })
    expect(exportFrameSize(null)).toEqual({ width: 1280, height: 720 })
  })

  it('시:분:초:장의 장은 내보내기와 같은 초당 30장으로 센다', () => {
    // 왜: 시간 표시와 내보낸 영상의 장 수가 다르면 "00:00:04:05"가 가리키는 장면이 어긋난다.
    expect(SEQUENCE_FPS).toBe(30)
    expect(formatTimecode(4 + 5 / 30)).toBe('00:00:04:05')
    expect(formatTimecode(3725.5)).toBe('01:02:05:15')
    expect(read('src/lib/editor-draft-render.ts')).toMatch(/captureStream\(SEQUENCE_FPS\)/)
    expect(read('src/features/editor/timeline.tsx')).not.toMatch(/function formatTimecode/)
  })

  it('맨 위 오른쪽의 크림 단추는 [내보내기]이고, [← Director로]는 보조 단추다', () => {
    // 왜: 결정 페이지 "Editor 는 크림이 [내보내기], ← Director로는 보조 단추"(design.md 메인 단추 크림 하나).
    const markup = html(createElement(EditorTopActions, { onBack: () => {}, onExport: () => {} }))
    const buttons = [...markup.matchAll(/<button[^>]*data-variant="([a-z]+)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => [m[1], text(m[2])])
    expect(buttons).toEqual([['secondary', 'Director로'], ['default', '내보내기']])
  })
})

describe('효과 컨트롤', () => {
  it('타임라인 클립을 고르면 효과 컨트롤에 "샷 N · 종류 · Take N"과 "V1 · 시작 → 끝 · 길이"가 보인다', () => {
    // 왜: 시안 E1 409:4656 · 409:4657 — 지금 우클릭 메뉴 머리에만 있던 클립 정보를 고른 자리에서 바로 본다.
    api().selectClip('B')
    const markup = html(createElement(EffectControls))
    expect(text(markup)).toContain('샷 2 · MS · Take 3')
    expect(text(markup)).toContain('V1 · 00:00:03:00 → 00:00:06:00 · 3.00초')
  })

  it('효과 컨트롤의 속도는 50 · 100 · 150 · 200% 칸이고 지금 빠르기가 골라져 있다 — 그 밖의 빠르기면 그 값 칸이 하나 더 붙는다', () => {
    // 왜: 시안 E1 409:4703–4713. 우클릭 메뉴는 0.25~4배를 고를 수 있어, 그 값으로 바꾼 클립도 지금 값을 보여야 한다.
    api().selectClip('B')
    expect(pressed(html(createElement(EffectControls)))).toContain('100%')
    api().setSpeed('B', 0.25)
    const markup = html(createElement(EffectControls))
    expect(text(markup)).toMatch(/50% 100% 150% 200% 25%/)
    expect(pressed(markup)).toContain('25%')
  })

  it('효과 컨트롤의 전환은 시작 전환 "검정으로 물들이기"를 없음 · 0.5 · 1 · 2초로 고르고 지금 길이가 골라져 있다', () => {
    // 왜: 오너 답 4 — 지금 디졸브의 이름은 "검정으로 물들이기". 끝 전환 · 교차 디졸브는 효과 탭 조각(⑤)에서 더한다.
    api().selectClip('B')
    expect(pressed(html(createElement(EffectControls)))).toContain('없음')
    api().setTransitionIn('B', { type: 'dissolve', durationSec: 1 })
    const markup = html(createElement(EffectControls))
    expect(text(markup)).toContain('검정으로 물들이기')
    expect(pressed(markup)).toContain('1초')
    expect(text(markup)).not.toContain('교차 디졸브')
  })

  it('소리 조각을 고르면 효과 컨트롤에 이름 · 줄 · 시작 → 끝과 볼륨이 보인다', () => {
    // 왜: 추천 "속도 · 소리 볼륨은 효과 컨트롤로" — 지금 볼륨은 소리 조각 우클릭에만 있다.
    api().selectAudioClip('bgm')
    const markup = html(createElement(EffectControls))
    expect(text(markup)).toContain('잔잔한 피아노.mp3')
    expect(text(markup)).toContain('A1 · 00:00:00:00 → 00:00:04:00 · 4.00초')
    expect(text(markup)).toContain('볼륨 60%')
  })

  it('처음 연 Editor 는 아무 클립도 고르지 않은 채 열린다 — 효과 컨트롤은 안내를 보인다', async () => {
    // 왜: 처음 열 때 영상마다 소리를 놓으면서 마지막 소리 조각이 골라진 채 열려, 효과 컨트롤이 그 소리를 보였다(2단계 ② 화면 확인).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    useEditorStore.setState({ audioClips: [], editorPrep: { done: 0, total: 0 } })
    await finishEditorOpen({
      projectId: 'project-panels', restored: false, isCancelled: () => false, audioName: () => 'audio',
      measureClips: async () => {}, decodeAudio: async () => ({ durationSec: 3, peaks: [0.5] }),
    })
    expect(api().audioClips.length).toBeGreaterThan(0)
    expect(api().selectedAudioIds).toEqual([])
    expect(api().selectedShotIds).toEqual([])
    vi.unstubAllGlobals()
  })

  it('아무것도 고르지 않으면 효과 컨트롤은 지금 바꿀 수 있는 것만 안내한다 — 속도 · 전환 · 볼륨, 빈 곳의 잔물결 삭제', () => {
    // 왜: 시안 E4 409:6662 안내는 아직 없는 위치 · 비율 · 불투명도 · 효과도 말한다. 없는 기능을 안내하지 않는다.
    const markup = text(html(createElement(EffectControls)))
    expect(markup).toContain('타임라인에서 클립을 고르면 여기서 속도 · 전환 · 볼륨을 바꿔요.')
    expect(markup).toContain('컷과 컷 사이 빈 곳을 누르면 그 자리에 "잔물결 삭제"가 떠요.')
    expect(markup).not.toMatch(/위치|불투명도/)
  })
})

describe('프로젝트 판', () => {
  const panel = () =>
    html(createElement(ProjectPanel, {
      shots: api().shots, videoClips: api().videoClips, audioSources: [],
      newItems: [{ label: '타이틀 카드', onSelect: () => {} }],
      onOpenSource: () => {}, onAddClip: () => {}, onAddClipAtPlayhead: () => {}, onAddAudioFromSource: () => {},
      onAddAudioSource: () => {}, onRemoveAudioSource: () => {}, onBinDragStart: () => {}, onBinDragEnd: () => {}, onSetBinDropSec: () => {},
    }))

  it('프로젝트 판은 "Director 샷 · N" 줄마다 "샷 N · 종류 · Take N"과 "V · 길이"를 보인다 — 영상 없는 샷은 길이 대신 상태', () => {
    // 왜: 시안 E1 409:4753–4765. 영상이 없는 샷은 타임라인에 넣을 수 없어(오너 답 8) 길이 대신 지금 상태를 보인다.
    const markup = text(panel())
    expect(markup).toContain('Director 샷 · 4')
    expect(markup).toMatch(/샷 2 · MS · Take 3 V · 03:00/)
    expect(markup).toMatch(/샷 3 · CU 대기/)
  })

  it('"내 파일"이 비어 있으면 오디오 파일을 끌어 놓거나 [가져오기…]를 누르라고 안내하고, 위에 [가져오기…] · [새 항목] 단추가 있다', () => {
    // 왜: 시안 E1 409:4750 · 409:4776. 지금 올릴 수 있는 것은 소리뿐이다 — 이미지 · 영상은 3단계(내 파일)에서 안내에 더한다.
    const markup = text(panel())
    expect(markup).toContain('내 파일 · 0')
    expect(markup).toContain('오디오 파일을 여기로 끌어 놓거나 [가져오기…]를 눌러요')
    expect(markup).toMatch(/가져오기… 새 항목/)
  })
})

describe('프로그램 모니터 단추', () => {
  it('앞 편집점 · 다음 편집점 단추는 Ctrl+← · Ctrl+→ 와 같은 자리로 간다 — 빈 곳의 양 끝도 편집점이다', () => {
    // 왜: 시안 E1 409:4729 · 409:4737. 단추와 단축키가 서로 다른 자리로 가면 헷갈린다.
    api().deleteClip('B')
    const layout = selectTimelineLayout(api())
    expect(editPointTarget(layout, 1, 1)).toBe(3)
    expect(editPointTarget(layout, 3, 1)).toBe(6)
    expect(editPointTarget(layout, 6.5, -1)).toBe(6)
    expect(editPointTarget(layout, 0, -1)).toBe(0)
    expect(read('src/features/editor/video-previewer.tsx')).toMatch(/editPointTarget\(layout, st\.currentTime, -1\)/)
    expect(read('src/features/editor/video-previewer.tsx')).toMatch(/editPointTarget\(layout, st\.currentTime, 1\)/)
    expect(read('src/features/editor/use-editor-playback.ts')).toMatch(/editPointTarget\(layout, s\.currentTime, dir\)/)
  })
})

describe('내보내기 탭 · 단축키', () => {
  it('내보내기 탭에는 영상 파일(드래프트 렌더)과 샷 ZIP 두 칸이 있다', () => {
    // 왜: 추천 "드래프트 렌더 · 샷 ZIP 은 [내보내기]로". 시안에 이 탭 그림이 없어 지금 단추를 그대로 옮긴다.
    const markup = text(html(createElement(ExportTab, { renderLabel: null, onDraftRender: () => {}, exportingZip: false, onShotZip: () => {} })))
    expect(markup).toContain('영상 파일')
    expect(markup).toContain('드래프트 렌더')
    expect(markup).toContain('샷 ZIP')
  })

  it('단축키 창은 Editor 가 받는 단축키를 모두 보인다', () => {
    // 왜: 시안 E1 409:4646 [단축키]. 목록이 실제 단축키와 어긋나면 안 된다 — 단축키를 받는 코드에 같은 키가 있다.
    const markup = text(html(createElement(ShortcutsList)))
    for (const item of EDITOR_SHORTCUTS) expect(markup).toContain(item.keys)
    // Ctrl+K · M 은 2단계 ③(tests/editor/split-snap-markers.test.ts).
    expect(EDITOR_SHORTCUTS.map((s) => s.keys)).toEqual(['Space', '← →', 'Shift+← →', 'Ctrl+← →', 'Ctrl+Z', 'Ctrl+Y', 'V', 'C', 'Ctrl+K', 'M', 'Delete', 'Shift+Delete'])
    const handler = read('src/features/editor/use-editor-playback.ts')
    for (const key of ["case ' ':", "e.key === 'ArrowRight'", "case 'v':", "case 'c':", "case 'Delete':", 'e.shiftKey) s.rippleDeleteSelectedClips()']) expect(handler).toContain(key)
  })

  it('한글 입력 상태여도 V · C 자리 키를 누르면 선택 · 자르기 도구로 바뀐다', () => {
    // 왜: 한글 입력 상태에서는 V · C 키가 ㅍ · ㅊ 으로 들어와 도구가 바뀌지 않았다 — M · Ctrl+K 와 같게 키 자리로도 알아본다(리드 2026-11-14).
    const press = (key: string, code: string) =>
      handleEditorKey({ key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: null, preventDefault: () => {} } as unknown as KeyboardEvent)
    press('ㅊ', 'KeyC')
    expect(api().toolMode).toBe('cut')
    press('ㅍ', 'KeyV')
    expect(api().toolMode).toBe('select')
  })
})

describe('없앤 것', () => {
  it('화면 머리 "최종 편집 · 컷 N · M초 · 영상 a/b"는 Editor 에 보이지 않는다', () => {
    // 왜: 결정 페이지 추천 "머리 숫자는 없앰" — 시안 E1 의 위 둘째 줄이 시퀀스 이름 · 길이를 대신 보인다.
    const page = read('src/app/studio/editor/page.tsx')
    expect(page).not.toMatch(/<PageHeader/)
    expect(page).not.toMatch(/editorHeaderMeta\(/)
  })
})
