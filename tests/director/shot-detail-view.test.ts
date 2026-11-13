// Director 샷 상세 화면(D6 · D7) — 스토리보드형 팝업 · 노드형 왼쪽 패널이 같은 상세를 보이고, 이미지 탭은 시작 · 끝 나란히 · 설정 한 화면, 영상 탭은 Take 쌓기 · 이미지 고치기 · 영상 고치기다 (디자이너 11/13 시안 · 오너 2026-11-14)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => [],
  useGenerationQueueStatus: () => 'ready',
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))
// 운영은 shadow(숫자는 보이되 막지 않음) — Take 표시가 켜진 상태로 본다.
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }) }))

import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import type { VideoNodeData } from '@/types/director'

let shotId = ''
const IMAGE = { url: 'https://media.test/start.png', status: 'completed' as const, errorMessage: null, generatedAt: 1, frames: { start: 'https://media.test/start.png', direction: 'https://media.test/dir.png', end: 'https://media.test/end.png' } }

function setLocale(locale: 'ko' | 'en') {
  useLocaleStore.setState({ locale })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
}
function syncStores() {
  Object.assign(director.getInitialState(), director.getState())
  Object.assign(useProjectFormatStore.getInitialState(), useProjectFormatStore.getState())
}
const render = (layout: 'popup' | 'panel', tab: 'image' | 'video' = 'image') => {
  syncStores()
  return renderToStaticMarkup(createElement(DirectorShotDetail, { shotNodeId: shotId, initialTab: tab, layout, onClose: () => {} }))
}
function addTake(over: Partial<VideoNodeData>): string {
  const id = director.getState().addVideoTake(shotId)!
  director.getState().updateNodeData<'video'>(id, over)
  return id
}
const done = (n: number, over: Partial<VideoNodeData> = {}) =>
  addTake({ takeNumber: n, status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://media.test/take-${n}.mp4`, ...over })
/** 글자를 담은 단추의 여는 태그 — 꺼짐(disabled)을 본다. */
function buttonTag(out: string, label: string): string {
  const at = out.indexOf(label)
  expect(at, label).toBeGreaterThan(-1)
  const start = out.lastIndexOf('<button', at)
  return out.slice(start, out.indexOf('>', start) + 1)
}

beforeEach(() => {
  director.setState({ projectId: 'detail-project', nodes: [], edges: [], realBatchBusy: false, generatingNodeIds: {} })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId: 'sh_01_01', storyboardImage: IMAGE })
  useProjectFormatStore.setState({ format: 'vertical_9:16' })
  setLocale('en')
})

describe('Director 샷 상세 화면', () => {
  it('스토리보드형 팝업과 노드형 왼쪽 패널은 같은 샷 상세를 보인다', () => {
    // 왜: D6 · D7 — 스토리보드형은 팝업, 노드형은 왼쪽 패널이고 내용은 같다(디자이너 확정안).
    for (const file of ['src/features/director/canvas-popups/DirectorNodePopup.tsx', 'src/features/director/canvas-panels/DirectorDetailPanel.tsx']) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/<DirectorShotDetail\b/)
    }
    expect(readFileSync('src/features/director/canvas-popups/DirectorNodePopup.tsx', 'utf8')).toMatch(/layout="popup"/)
    expect(readFileSync('src/features/director/canvas-panels/DirectorDetailPanel.tsx', 'utf8')).toMatch(/layout="panel"/)
    const popup = render('popup')
    const panel = render('panel')
    for (const out of [popup, panel]) {
      expect(out).toContain('data-testid="director-shot-detail"')
      expect(out).toContain('data-testid="shot-detail-frames"')
      expect(out).toContain('data-testid="shot-detail-settings"')
    }
  })

  it('상세 머리의 샷 · 씬 이름은 캔버스와 같은 이름("Shot 4" · "Scene 1")이고 Writer 의 원래 id 를 보이지 않는다', () => {
    // 왜: 실제 화면에서 머리에 "sh_01_04", 줄에 "sc_01" 이 보였다 — 캔버스 · 보드는 같은 샷을 "Shot 4" 로 부른다(오너 2026-08-26 · 11-02).
    const sceneId = director.getState().addSceneNode({ x: 0, y: 0 }, 'sc_01')
    director.getState().updateNodeData<'shot'>(shotId, { label: 'sh_01_04', writerShotId: 'sh_01_04', parentSceneNodeId: sceneId })
    for (const layout of ['popup', 'panel'] as const) {
      const out = render(layout)
      expect(out).toContain('>Shot 4<')
      expect(out).toContain('Scene 1 · ')
      expect(out).not.toMatch(/sh_01_04|sc_01/)
    }
    expect(readFileSync('src/features/director/canvas-popups/DirectorNodePopup.tsx', 'utf8')).not.toMatch(/<DialogTitle[^>]*>\{node\.data\.label\}/)
  })

  it('세로 프로젝트의 상세에서 시작 · 끝 그림과 영상 미리보기 틀은 세로(9:16)다', () => {
    // 왜: 오너 2026-09-30 "Producer 에서 정한 화면비를 Director 화면이 그대로 따른다" — 옛 상세가 지키던 약속(project-aspect)을 새 상세도 지킨다.
    done(1)
    expect(render('popup').match(/aspect-ratio:9 \/ 16/g)?.length).toBeGreaterThanOrEqual(2)
    const video = render('panel', 'video')
    expect(video).toMatch(/<figure[^>]*style="aspect-ratio:9 \/ 16[^"]*"[^>]*data-testid="shot-detail-take-preview"/)
    expect(video.match(/aspect-ratio:9 \/ 16/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('상세에는 이미지 · 영상 탭이 있고 영상이 없으면 "영상 · 없음"이다', () => {
    // 왜: D6 — 영상이 아직 없는 샷은 탭에서 바로 알 수 있다.
    const out = render('popup')
    expect(out).toContain('>Image<')
    expect(out).toContain('>Video · none<')
    setLocale('ko')
    const ko = render('popup')
    expect(ko).toContain('>이미지<')
    expect(ko).toContain('>영상 · 없음<')
  })

  it('이미지 탭은 시작 · 끝 그림을 나란히 보이고 둘 다 고른 채 바꿀 수 없게 보인다', () => {
    // 왜: 오너 답 5번 — 1단계 다시 만들기는 지금처럼 시작 · 끝 함께다. 따로 고를 수 있게 보이면 따로 되는 줄 안다(혼자 정한 것).
    const out = render('popup')
    expect(out).toContain('src="https://media.test/start.png"')
    expect(out).toContain('src="https://media.test/end.png"')
    expect(out.match(/role="checkbox" aria-checked="true" aria-disabled="true"/g)?.length).toBe(2)
    expect(out).toContain('Start and end images are remade together for now.')
  })

  it('이미지 탭의 설정은 한 화면에 바꾸고 싶은 점 · 프롬프트 · 이미지 모델 · 비율 · 해상도 · 개수 · 참고 이미지 · 등장인물 · 장소를 보이고 고치기 · 설정 탭이 없다', () => {
    // 왜: D6 — 디자이너 확정안이 "고치기 / 설정" 탭을 없애고 한 화면에 모았다.
    const out = render('popup')
    for (const label of ['What to change', 'Prompt', 'Image model', 'Aspect ratio', 'Resolution', 'Count', 'Reference images (0)', 'People (0/0)', 'Places (0/0)']) {
      expect(out, label).toContain(label)
    }
    expect(out).toContain('9:16')
    expect(out).not.toMatch(/>Edit<|>Settings</)
  })

  it('Writer 샷의 이미지 탭 모델 칸에는 실제로 도는 GPT Image 2 · Seedream 4 만 보인다', () => {
    // 왜: 오너 답 5번 "모델 칸에는 실제로 도는 것만" — 나머지 넷은 말없이 GPT Image 2 로 바뀌었다.
    const out = render('popup')
    expect(out).toContain('GPT Image 2')
    expect(out).toContain('Seedream 4')
    for (const hidden of ['Nano Banana', 'FLUX.2 Klein', 'Grok Imagine']) expect(out, hidden).not.toContain(hidden)
  })

  it('이미지 탭에서 참고 이미지를 올리면 지금처럼 사용 권리 확인을 먼저 받고, 다시 만들기는 지금 단추(만드는 동안 잠김 · 바꾸기 전 확인)를 쓴다', () => {
    // 왜: 정상 경로 고정 — 상세 모양이 바뀌어도 올리기 동의(출시 시험 image-upload-consent)와 다시 만들기 잠금 · 확인(image-generation-ui)은 그대로다.
    const tab = readFileSync('src/features/director/shot-detail/shot-image-tab.tsx', 'utf8')
    expect(tab).toMatch(/if \(!\(await requestImageUploadConsent\(\[file\]\)\)\) return/)
    expect(tab).toMatch(/<StoryboardImageButton nodeId=\{nodeId\} data=\{data\}/)
  })

  it('이미지 탭의 다시 만들기 단추는 "시작·끝 이미지 다시 만들기 · Takes 0" 하나이고 바꾸고 싶은 점을 이번 생성에 실어 보낸다', () => {
    // 왜: D6 · 오너 답 5번 — 시작 · 끝 함께 다시 만든다. 바꾸고 싶은 점은 이번 생성에만 붙는다(혼자 정한 것).
    expect(render('popup')).toContain('Remake start and end images · Takes 0')
    const button = readFileSync('src/features/director/storyboard-image-button.tsx', 'utf8')
    expect(button).toMatch(/changeNote\.trim\(\) \? generateStoryboardImage\(nodeId, \{ changeNote \}\) : generateStoryboardImage\(nodeId\)/)
  })

  it('영상 탭은 그 샷의 Take 를 새것부터 카드로 쌓고, 고른 ★ 가 없으면 가장 최근 완성 Take 에 "★ 최종 (자동)"을 보인다', () => {
    // 왜: D7 · R — Take 는 덮어쓰지 않고 쌓이고, ★ 최종 Take 가 Editor 로 간다(고르지 않았으면 가장 최근 완성).
    done(1)
    addTake({ takeNumber: 2, status: 'generating', lastAttemptStatus: 'generating' })
    const out = render('panel', 'video')
    const list = out.slice(out.indexOf('data-testid="shot-detail-takes"'))
    expect(list.indexOf('Take 2')).toBeGreaterThan(-1)
    expect(list.indexOf('Take 2')).toBeLessThan(list.indexOf('Take 1'))
    expect(out).toContain('★ Final (auto)')
    expect(out).toContain('>Making<')
    expect(out).toContain('>View<')
    expect(out).toContain('Seedance 2.0 · 720p')
    expect(out).toContain('data-testid="shot-detail-take-preview"')
    expect(out).toContain('src="https://media.test/take-1.mp4"')
    setLocale('ko')
    const ko = render('panel', 'video')
    expect(ko).toContain('★ 최종 (자동)')
    expect(ko).toContain('>만드는 중<')
    expect(ko).toContain('Take 2')
  })

  it('영상 탭은 이미지 고치기와 영상 고치기를 한 화면에 보이고, 영상 고치기에는 다섯 영상 모델 · 해상도 · 이번에 쓸 Take 를 보인다', () => {
    // 왜: D7 — 장면 · 인물 · 구도는 이미지 고치기, 움직임 · 카메라 · 길이는 영상 고치기에서 고친다. Take 값은 지금 계산 그대로(오너 답 11번).
    done(1)
    const out = render('panel', 'video')
    expect(out).toContain('data-testid="shot-detail-fix-image"')
    expect(out).toContain('data-testid="shot-detail-fix-video"')
    for (const label of ['Fix the image', 'Fix the video', 'Seedance 2.0', 'Seedance 2.5', 'Happy Horse', 'Kling O3 Pro', 'Veo 3.1', '720p', '1080p']) {
      expect(out, label).toContain(label)
    }
    expect(out.match(/role="checkbox" aria-checked="true" aria-disabled="true"/g)?.length).toBe(2)
    expect(out).toContain('Remake start and end images · Takes 0')
    expect(out).toContain('Make a new Take · 5 Take')
    expect(out).toContain('Delete this Take')
    setLocale('ko')
    const ko = render('panel', 'video')
    for (const label of ['이미지 고치기', '영상 고치기', '새 Take 만들기 · 5 Take', '이 Take 삭제']) expect(ko, label).toContain(label)
  })

  it('보고 있는 Take 를 만든 뒤 시작 · 끝 이미지를 다시 만들었으면 "이미지가 바뀌었어요"를 보이고 단추는 "바뀐 이미지로 새 Take 만들기"다', () => {
    // 왜: D7 "시작 이미지가 바뀌었어요 · 새 Take를 만들면 반영돼요" — 그 Take 는 옛 이미지로 만든 것이라 새 Take 를 만들어야 바뀐 이미지가 영상에 들어간다.
    director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: { ...IMAGE, generatedAt: Date.parse('2026-11-14T02:00:00.000Z') } })
    done(1, { lastAttemptAt: '2026-11-14T01:00:00.000Z' })
    const out = render('panel', 'video')
    expect(out).toContain('The start and end images changed · A new Take will use them')
    expect(out).toContain('Make a new Take with the changed image · 5 Take')
    setLocale('ko')
    const ko = render('panel', 'video')
    expect(ko).toContain('시작 · 끝 이미지가 바뀌었어요 · 새 Take를 만들면 반영돼요')
    expect(ko).toContain('바뀐 이미지로 새 Take 만들기 · 5 Take')
  })

  it('영상이 없는 샷의 영상 탭은 "아직 영상이 없어요"와 "영상 만들기 · N Take"를 보인다', () => {
    // 왜: D6 "다음: 영상 만들기 · 5 Take" — 이미지 탭에서 넘어오면 바로 첫 Take 를 만든다. 지울 Take 는 없다.
    const out = render('popup', 'video')
    expect(out).toContain('No video for this shot yet.')
    expect(out).toContain('Make the video · 5 Take')
    expect(buttonTag(out, 'Make the video · 5 Take')).not.toContain('disabled=""')
    expect(out).not.toContain('Delete this Take')
  })

  it('시작 · 끝 이미지가 없으면 영상 단추를 끄고 이미지를 먼저 만들라고 알린다', () => {
    // 왜: R "영상 만들기는 이미지가 먼저 있어야 해요" — 눌러도 실패하는 단추를 켜 두지 않는다.
    director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: null })
    const out = render('popup', 'video')
    expect(out).toContain('Make the start and end images first.')
    expect(buttonTag(out, 'Make the video · 5 Take')).toContain('disabled=""')
  })

  it('같은 샷에서 Take 를 만드는 중이면 새 Take 단추를 끄고 다 되면 새로 만들 수 있다고 알린다', () => {
    // 왜: 지금은 한 샷을 한 번에 하나만 만든다(서버가 같은 샷 동시 생성을 거절) — 눌러도 거절되는 단추를 켜 두지 않는다.
    done(1)
    addTake({ takeNumber: 2, status: 'generating', lastAttemptStatus: 'generating' })
    const out = render('panel', 'video')
    expect(out).toContain('A Take is being made. You can make a new one when it is done.')
    expect(buttonTag(out, 'Make a new Take · 5 Take')).toContain('disabled=""')
  })
})
