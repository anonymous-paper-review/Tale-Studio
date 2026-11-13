// Director 샷 상세 화면(D6 · D7) — 스토리보드형 팝업 · 노드형 왼쪽 패널이 같은 상세를 보이고, 이미지 탭은 시작 · 끝 나란히 · 설정 한 화면이다 (디자이너 11/13 시안 · 오너 2026-11-14)
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

import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'

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
})
