// 정사각(1:1) 프로젝트에서 Director 의 독립 영상 · 영상 노드가 Veo 를 고르거나 다시 만들지 못하게 막고 까닭 한 줄을 보이며, 채팅이 Veo 로 바꾸려 하면 받지 않는지 검사한다 (오너 2026-11-22 V3 "Veo 는 16:9 · 9:16 프로젝트에서만", 리드 11/23 q1 · q2)
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notes = vi.hoisted(() => ({ lines: [] as Array<{ stage: string; content: string }> }))
vi.mock('@/lib/generation-notify', async (original) => ({
  ...(await original<typeof import('@/lib/generation-notify')>()),
  notifyRefusedChange: (stage: string, content: string) => notes.lines.push({ stage, content }),
}))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { modelBlockedByAspect, projectVideoAspect, shownVideoError } from '@/features/director/video-aspect'
import { videoModelButtons } from '@/features/director/video-model-buttons'
import { VIDEO_MODEL_ASPECT_TEXT } from '@/lib/video-models'
import { translate } from '@/lib/i18n/translate'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { isShotData } from '@/types/director'

const KO_REASON = translate('ko', VIDEO_MODEL_ASPECT_TEXT)
const render = (value: string, aspectRatio: string) =>
  renderToStaticMarkup(videoModelButtons({ value: value as never, aspectRatio, onSelect: () => {}, t: (text) => translate('ko', text) }))
const veoButton = (html: string) => html.match(/<button[^>]*>(?:(?!<\/button>).)*Veo 3\.1(?:(?!<\/button>).)*<\/button>/)?.[0] ?? ''

beforeEach(() => {
  notes.lines.length = 0
  useProjectFormatStore.setState({ format: null })
  useLocaleStore.setState({ locale: 'ko' })
})

describe('프로젝트 화면비', () => {
  it('화면비는 프로젝트 포맷으로 정한다 — 가로 · 시네마 16:9, 세로 9:16, 정사각 1:1, 모르면 16:9', () => {
    // 왜: 리드 지시 공식(videoAspectRatioFromFormat ?? '16:9') — 서버(video-submit)와 같은 판정이어야 화면이 고르게 한 것을 서버가 막지 않는다.
    expect(projectVideoAspect('horizontal_16:9')).toBe('16:9')
    expect(projectVideoAspect('cinema_2.39:1')).toBe('16:9')
    expect(projectVideoAspect('vertical_9:16')).toBe('9:16')
    expect(projectVideoAspect('square_1:1')).toBe('1:1')
    expect(projectVideoAspect(null)).toBe('16:9')
  })
})

describe('독립 영상 · 영상 노드 상세의 모델 단추', () => {
  it('정사각(1:1) 프로젝트에서는 Veo 단추가 꺼지고 모델 단추 아래에 까닭 한 줄을 보인다', () => {
    // 왜: 오너 V3 — Veo 3.1 은 가로 · 세로 영상만 만든다. 서버는 Take 전에 거절한다(fb-video H8) — 누르기 전에 화면이 알려 준다.
    const html = render('seedance', '1:1')
    expect(veoButton(html)).toMatch(/disabled=""/)
    expect(veoButton(html)).toContain(`title="${KO_REASON}"`)
    expect(html).toContain(`>${KO_REASON}</p>`)
    expect(html.match(/disabled=""/g)).toHaveLength(1)
  })

  it('가로 · 세로 프로젝트에서는 Veo 를 지금처럼 고를 수 있고 까닭 줄도 없다', () => {
    // 왜: 정상 경로 고정 — 16:9 · 9:16 은 Veo 가 만든다.
    for (const aspect of ['16:9', '9:16']) {
      const html = render('veo', aspect)
      expect(veoButton(html)).not.toMatch(/disabled=""/)
      expect(html).not.toContain(KO_REASON)
    }
  })

  it('이미 Veo 로 골라 둔 영상은 고른 표시를 남기고 까닭 줄로 알린다 — 다른 모델로 몰래 바꾸지 않는다', () => {
    // 왜: 사람이 정한 값을 화면이 저절로 바꾸지 않는다(혼자 정한 것 h6 · 서버도 자동 대체 없음 q1). 다른 모델은 사람이 고른다.
    const html = render('veo', '1:1')
    expect(veoButton(html)).toContain('aria-pressed="true"')
    expect(veoButton(html)).toMatch(/disabled=""/)
    expect(html).toContain(KO_REASON)
  })

  it('독립 영상 패널은 이 모델 단추와 프로젝트 화면비를 쓴다', () => {
    // 왜: 리드 범위 — 내 몫의 Veo 끄기는 노드와 독립 영상 패널(VideoDetailPanel)이다. 샷 상세 영상 탭은 fb-camera 몫.
    const panel = readFileSync('src/features/director/canvas-panels/VideoDetailPanel.tsx', 'utf8')
    expect(panel).toMatch(/\{videoModelButtons\(\{\s*value: effective\.provider,\s*aspectRatio: projectVideoAspect\(projectFormat\),/)
  })
})

describe('영상 노드의 [영상 리테이크]', () => {
  it('정사각 프로젝트에서 Veo 로 만든 Take 노드의 [영상 리테이크]는 꺼지고 같은 까닭을 보인다', () => {
    // 왜: 리테이크는 그 Take 의 모델 그대로 다시 만든다 — 눌러서 서버 거절을 받게 하지 않는다(혼자 정한 것 5b, 리드 승인). 모델을 바꾸려면 상세를 연다.
    expect(modelBlockedByAspect('veo', 'square_1:1')).toBe(true)
    expect(modelBlockedByAspect('veo', 'vertical_9:16')).toBe(false)
    expect(modelBlockedByAspect('seedance', 'square_1:1')).toBe(false)
    expect(modelBlockedByAspect(null, 'square_1:1')).toBe(false)
    const node = readFileSync('src/features/director/canvas-nodes/VideoNode.tsx', 'utf8')
    expect(node).toMatch(/disabled=\{ownerGenerating \|\| generating \|\| retakeReading \|\| retakeModelBlocked\}/)
    expect(node).toMatch(/\{retakeModelBlocked && \(\s*<p[^>]*>\{t\(VIDEO_MODEL_ASPECT_TEXT\)\}<\/p>/)
  })

  it('정사각 프로젝트에서 Veo 로 고른 독립 영상은 상세 패널의 [영상 생성]도 꺼지고 같은 까닭을 보인다', () => {
    // 왜: 패널의 [영상 생성]은 노드의 [영상 리테이크]와 같은 일을 한다 — 한쪽만 막으면 다른 쪽에서 눌러 서버 거절을 받는다(혼자 정한 것 5c, 5b 를 넓힘).
    const panel = readFileSync('src/features/director/canvas-panels/VideoDetailPanel.tsx', 'utf8')
    expect(panel).toContain('const modelBlocked = modelBlockedByAspect(effective.provider, projectFormat)')
    expect(panel).toMatch(/disabled=\{isGenerating \|\| standalonePromptMissing \|\| modelBlocked \|\| checkingIds\.has\(nodeId\)\}\s*title=\{modelBlocked \? t\(VIDEO_MODEL_ASPECT_TEXT\) : undefined\}/)
  })

  it('서버가 화면비로 거절한 영상의 실패 줄은 계약 문구를 화면 말로 보인다', () => {
    // 왜: 서버 거절(409 model_aspect_unsupported)의 error 는 영어 원문 계약 문구다 — 한국어 화면에 영어가 나오면 안 된다(q1 "계약 문구에 맞춰").
    const ko = (text: string) => translate('ko', text)
    expect(shownVideoError(VIDEO_MODEL_ASPECT_TEXT, ko)).toBe(KO_REASON)
    expect(shownVideoError('fal timeout', ko)).toBe('fal timeout')
    const node = readFileSync('src/features/director/canvas-nodes/VideoNode.tsx', 'utf8')
    expect(node).toContain('shownVideoError(data.lastAttemptError, t)')
  })
})

describe('채팅이 모델을 Veo 로 바꾸려 할 때', () => {
  function seedShot() {
    const api = useDirectorCanvasStore.getState()
    api.reset()
    useDirectorCanvasStore.setState({ projectId: 'veo-aspect-test' })
    const sceneId = api.addSceneNode({ x: 0, y: 0 }, 'Scene')
    const shotId = api.addShotNode(sceneId, { x: 360, y: 0 }, 'Shot')
    useDirectorCanvasStore.getState().updateNodeData<'shot'>(shotId, { provider: 'seedance' })
    return shotId
  }
  const providerOf = (id: string) => {
    const node = useDirectorCanvasStore.getState().nodes.find((n) => n.id === id)
    return node && isShotData(node.data) ? node.data.provider : null
  }

  it('정사각 프로젝트에서 채팅이 샷 모델을 Veo 로 바꾸려 하면 화면이 받지 않고 채팅에 까닭 한 줄을 남긴다', () => {
    // 왜: 리드 q2 "예 — 화면이 받지 않고 채팅에 까닭 한 줄". 받아 두면 다음 영상이 Take 전에 거절된다.
    useProjectFormatStore.setState({ format: 'square_1:1' })
    const shotId = seedShot()
    const result = useDirectorCanvasStore.getState().applyUpdates([{ type: 'updateShot', id: shotId, patch: { provider: 'veo' } }])
    expect(providerOf(shotId)).toBe('seedance')
    expect(result.skipped.map((item) => item.reason)).toEqual(['model_aspect_unsupported'])
    expect(notes.lines).toHaveLength(1)
    // 영상 알림은 Cinema 로 낸다 — 받는 쪽이 보고 있는 Director 면 Director 구간에 둔다(오너 D2~D5, tests/camera/notice-home).
    expect(notes.lines[0]).toMatchObject({ stage: 'camera' })
    expect(notes.lines[0]!.content).toContain(KO_REASON)
  })

  it('정사각 프로젝트에서 채팅이 Veo 로 새 Take 를 더하려 해도 모델은 받지 않는다', () => {
    // 왜: 새 Take 의 모델 바꿈도 같은 막이 — Take 는 더하되 모델은 그대로(마더 샷 모델), 까닭은 같은 한 줄.
    useProjectFormatStore.setState({ format: 'square_1:1' })
    const shotId = seedShot()
    useDirectorCanvasStore.getState().applyUpdates([{ type: 'addVideoTake', shotId, override: { provider: 'veo' }, tempId: 'V1' }])
    const take = useDirectorCanvasStore.getState().nodes.find((n) => n.data.kind === 'video' && (n.data as { parentShotNodeId?: string }).parentShotNodeId === shotId)
    expect(take).toBeDefined()
    expect((take!.data as { override?: { provider?: string } }).override?.provider).toBeUndefined()
    expect(notes.lines).toHaveLength(1)
  })

  it('가로 · 세로 프로젝트에서는 채팅이 Veo 로 바꾸는 것을 지금처럼 받는다', () => {
    // 왜: 정상 경로 고정.
    useProjectFormatStore.setState({ format: 'vertical_9:16' })
    const shotId = seedShot()
    const result = useDirectorCanvasStore.getState().applyUpdates([{ type: 'updateShot', id: shotId, patch: { provider: 'veo' } }])
    expect(providerOf(shotId)).toBe('veo')
    expect(result.skipped).toEqual([])
    expect(notes.lines).toHaveLength(0)
  })
})
