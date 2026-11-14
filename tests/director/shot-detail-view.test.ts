// Director 샷 상세 화면(D6 · D7) — 스토리보드형 팝업 · 노드형 왼쪽 패널이 같은 상세를 보이고, 이미지 탭은 시작 · 끝 나란히 · 설정 한 화면, 영상 탭은 Take 쌓기 · 이미지 고치기 · 영상 고치기다 (디자이너 11/13 시안 · 오너 2026-11-14)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 지금 도는 작업 목록 — [멈추기]는 이 목록에 든 작업에만 보인다(시험마다 바꿀 수 있게).
const queue = vi.hoisted(() => ({ jobs: [] as Array<{ id: string; kind: string; target: Record<string, unknown>; cancelledAt?: string | null }> }))
vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => queue.jobs,
  useGenerationQueueStatus: () => 'ready',
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))
// 운영은 shadow(숫자는 보이되 막지 않음) — Take 표시가 켜진 상태로 본다.
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }) }))

import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { DirectorDetailPanel } from '@/features/director/canvas-panels/DirectorDetailPanel'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import type { ShotNodeData, VideoNodeData } from '@/types/director'
import { StoryboardImageButton } from '@/features/director/storyboard-image-button'
import { keptStoryboardImage, withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { translate } from '@/lib/i18n/translate'

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
  queue.jobs = []
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

  it('openShotDetail 로 열면 노드형은 왼쪽 패널, 스토리보드형은 팝업이 상세를 맡고, 닫기는 closeShotDetail 이다', () => {
    // 왜: set 의 ⤢ · entry D8 의 [바꾸기]가 부르는 길 — set 이 ⤢ 를 바꿀 때까지 selectNode · openPopup 으로도 지금처럼 열린다.
    director.getState().setViewMode('node')
    director.getState().openShotDetail(shotId, 'video')
    syncStores()
    const nodeView = renderToStaticMarkup(createElement(DirectorDetailPanel))
    expect(nodeView).toContain('data-testid="director-shot-detail"')
    expect(nodeView).toContain('data-testid="shot-detail-video-tab"')
    director.getState().setViewMode('storyboard')
    syncStores()
    expect(renderToStaticMarkup(createElement(DirectorDetailPanel))).toBe('')
    const panel = readFileSync('src/features/director/canvas-panels/DirectorDetailPanel.tsx', 'utf8')
    const popup = readFileSync('src/features/director/canvas-popups/DirectorNodePopup.tsx', 'utf8')
    expect(popup).toMatch(/viewMode === 'storyboard' && detailNodeId/)
    for (const src of [panel, popup]) expect(src).toMatch(/closeShotDetail\(\)/)
    expect(panel).toMatch(/selectedNodeId/)
    expect(popup).toMatch(/popupNodeId/)
  })

  it('이미지 탭 [다음: 영상 만들기 · N Take]는 그 자리에서 새 Take 를 만들고 영상 탭으로 넘어간다', () => {
    // 왜: D6 단추 글 "다음: 영상 만들기 · 5 Take" — 누르면 영상을 만든다(조각 1은 탭만 바꿨다). 모델 · 해상도는 다시 만들기와 같다.
    expect(render('popup')).toContain('Next: make the video · 5 Takes')
    setLocale('ko')
    expect(render('popup')).toContain('다음: 영상 만들기 · 5 Take')
    expect(readFileSync('src/features/director/shot-detail/director-shot-detail.tsx', 'utf8')).toMatch(/remakeShotVideo\(shotNodeId\)/)
  })

  it('이미지 탭은 시작 · 끝 그림 아래 버전 줄(v1 · v2 …)을 하나 보이고, 지금 그림인 버전이 눌린 채 보인다', () => {
    // 왜: D6 "v1 · v2를 누르면 그 버전으로 돌아가요" — 1단계는 시작 · 끝이 함께라 줄은 하나(혼자 정한 것).
    //   많으면 옆으로 밀지 않고 5개씩 넘겨 본다(오너 11/14 답 5 — 예전 기대 overflow-x-auto · 리드 답 "옆으로 넘긴다", 넘기기는 image-version-row.test.ts).
    const version = (id: string, tag: string, at: number) => ({ id, url: `https://media.test/${tag}-s.png`, frames: { start: `https://media.test/${tag}-s.png`, direction: `https://media.test/${tag}-d.png`, end: `https://media.test/${tag}-e.png` }, generatedAt: at, source: 'generated' as const })
    const two = withStoryboardVersion(withStoryboardVersion(null, version('job-1', 'a', 1), { select: true }), version('job-2', 'b', 2), { select: true })
    director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: two })
    const out = render('popup')
    expect(out).toContain('data-testid="shot-detail-versions"')
    expect(out).toMatch(/aria-pressed="false"[^>]*>v1</)
    expect(out).toMatch(/aria-pressed="true"[^>]*>v2</)
    expect(out).not.toMatch(/class="[^"]*overflow-x-auto[^"]*" data-testid="shot-detail-versions"/)
    expect(out).toContain('Click v1 or v2 to go back to that version.')
    setLocale('ko')
    expect(render('popup')).toContain('버전(v1 · v2)을 누르면 그 버전으로 돌아가요.')
    expect(readFileSync('src/features/director/shot-detail/shot-image-tab.tsx', 'utf8')).toMatch(/selectStoryboardImageVersion\(nodeId, version\.id\)/)
  })

  it('Take 카드는 그 Take 가 쓴 이미지 버전을 "시작 v1 + 끝 v1 · 모델 · 해상도"로 보이고, 지금 버전과 다르면 "이미지가 바뀌었어요"를 보인다', () => {
    // 왜: D7 Take 카드 "시작 v1 + 끝 v1 · Seedance 2.0" — 어느 그림으로 만든 영상인지 보인다(리드 B). 지금 그림이 v2 면 그 Take 는 옛 그림이다.
    const version = (id: string, tag: string, at: number) => ({ id, url: `https://media.test/${tag}-s.png`, frames: { start: `https://media.test/${tag}-s.png`, direction: `https://media.test/${tag}-d.png`, end: `https://media.test/${tag}-e.png` }, generatedAt: at, source: 'generated' as const })
    const two = withStoryboardVersion(withStoryboardVersion(null, version('job-1', 'a', 1), { select: true }), version('job-2', 'b', 2), { select: true })
    director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: two })
    done(1, { madeFrames: { start: 'https://media.test/a-s.png?v=1', end: 'https://media.test/a-e.png' } })
    const out = render('panel', 'video')
    expect(out).toContain('Start v1 + End v1 · Seedance 2.0 · 720p')
    expect(out).toContain('The start and end images changed · A new Take will use them')
    setLocale('ko')
    expect(render('panel', 'video')).toContain('시작 v1 + 끝 v1 · Seedance 2.0 · 720p')
  })

  it('노드 위 이미지 단추는 그림이 있으면 "이미지 다시 만들기"다 — 시안 단추 이름(이미지 만들기 · 다시 만들기)과 같은 말', () => {
    // 왜: 리드 11/14 말 맞추기(set 이 찾음) — 노드 위 단추만 옛 말 "이미지 재생성"이었다. 위 툴바 [이미지 다시 만들기]와 같은 글 · 같은 영어.
    const shot = director.getState().nodes.find((n) => n.id === shotId)!.data as ShotNodeData
    const button = () => renderToStaticMarkup(createElement(StoryboardImageButton, { nodeId: shotId, data: shot }))
    expect(button()).toContain('>Make images again<')
    setLocale('ko')
    expect(button()).toContain('>이미지 다시 만들기<')
    expect(button()).not.toContain('이미지 재생성')
  })

  it('이미지를 다시 만들기 전 확인 창의 단추는 "다시 만들기"다 — 카드 · 꼬리 · 툴바 확인 창과 같은 말', () => {
    // 왜: 리드 11/14 말 맞추기 — 제목은 "이미지를 다시 만들까요?"인데 단추만 옛 말 "재생성"이었다(카드 · 꼬리 · 툴바는 set 84cf453b 가 맞춤).
    //   직접 추가한 이미지의 "다시 생성"은 출시 시험이 글자로 박고 있어 그대로다.
    const button = readFileSync('src/features/director/storyboard-image-button.tsx', 'utf8')
    expect(button).toContain("confirmLabel={confirm === 'manual-retry' ? t('Generate again') : t('Make again')}")
    expect(button).not.toContain("t('Regenerate')")
    expect(translate('ko', 'Make again')).toBe('다시 만들기')
  })

  it('이미지를 다시 만들기 전 확인 창은 지금 이미지가 버전으로 남는다고 알린다', () => {
    // 왜: 버전이 생겨(오너 답 5번) "기존 이미지가 새 결과로 교체됩니다"는 이제 틀린 말이다 — 앞 그림은 v1 로 남는다.
    const button = readFileSync('src/features/director/storyboard-image-button.tsx', 'utf8')
    expect(button).toContain("t('The new image becomes the current one. The current image stays in the versions.')")
    expect(button).not.toContain('Replaces the existing shooting image')
  })

  it('샷 상세의 이미지 다시 만들기 확인 창도 툴바와 같은 말이다 — 제목 "이미지를 다시 만들까요?" · 본문 "새 이미지가 지금 이미지가 되고, 지금 이미지는 버전으로 남아요." · [다시 만들기]', () => {
    // 왜: 영어 재점검(리드 11/14) — 영어 상세에 옛 말 "Regenerate the image? Generates a new shooting image for this shot."가 떴다(툴바는 "Make 2 images again?").
    //   한국어 제목은 이미 같은 말이었고, 옛 설명 줄("이 샷의 촬영용 이미지를 새로 생성해요.")은 뺀다. 직접 추가한 이미지의 "다시 생성" 창은 그대로.
    const button = readFileSync('src/features/director/storyboard-image-button.tsx', 'utf8')
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(button).toContain("t('Make the image again?')")
    expect(button).not.toContain("t('Generates a new shooting image for this shot.')")
    expect(translate('ko', 'Make the image again?')).toBe('이미지를 다시 만들까요?')
    // 본문 · 단추는 툴바 확인 창과 같은 글이다.
    for (const src of [button, page]) {
      expect(src).toContain("'The new image becomes the current one. The current image stays in the versions.'")
      expect(src).toContain("t('Make again')")
    }
    expect(translate('ko', 'The new image becomes the current one. The current image stays in the versions.')).toBe('새 이미지가 지금 이미지가 되고, 지금 이미지는 버전으로 남아요.')
    expect(translate('ko', 'Make again')).toBe('다시 만들기')
  })

  it('Take 를 만드는 중이면 그 카드에 [멈추기]가 있고, 멈춘 Take 는 "멈췄어요. 이미 생성이 시작된 영상의 경우 Take 는 돌려드리지 않아요"로 보이며 새 Take 단추가 켜진다', () => {
    // 왜: 오너 7번 "이미 생성이 진행 중인 것들은 UI로는 취소된걸로 보이게 해서 유저가 수정해서 다시 생성 요청할 수 있게" — Take 는 돌려주지 않는다.
    //   글은 오너 11/14 답 8 그대로(예전 "멈췄어요 · Take 는 돌려드리지 않아요."), 뒤의 "뒤늦게 끝나면 이 목록에 남아요."는 그대로(리드 11/14).
    done(1)
    const making = addTake({ takeNumber: 2, status: 'generating', lastAttemptStatus: 'generating', generationJobId: '11111111-1111-4111-8111-111111111111' })
    queue.jobs = [{ id: '11111111-1111-4111-8111-111111111111', kind: 'shot_video', target: {} }]
    const out = render('panel', 'video')
    // 시안 글 "멈추기"(리드 검토 a 4 — 기존 키 'Stop' 은 한국어 "정지"라 새 키).
    expect(out).toContain('>Stop making<')
    setLocale('ko')
    expect(render('panel', 'video')).toContain('>멈추기<')
    setLocale('en')
    expect(readFileSync('src/features/director/shot-detail/shot-video-tab.tsx', 'utf8')).toMatch(/cancelRunningJobs\(\[take\.data\.generationJobId!?\]\)/)
    director.getState().updateNodeData<'video'>(making, { cancelledAt: '2026-11-14T03:00:00Z' })
    const stopped = render('panel', 'video')
    expect(stopped.replace(/&#x27;/g, "'")).toContain("Stopped. Takes for videos that had already started aren't refunded. If it finishes later, it stays in this list.")
    expect(stopped).not.toContain('A Take is being made. You can make a new one when it is done.')
    expect(buttonTag(stopped, 'Make a new Take · 5 Takes')).not.toContain('disabled=""')
    setLocale('ko')
    expect(render('panel', 'video')).toContain('멈췄어요. 이미 생성이 시작된 영상의 경우 Take 는 돌려드리지 않아요. 뒤늦게 끝나면 이 목록에 남아요.')
  })

  it('만드는 중인 Take 의 [멈추기]는 지금 도는 작업 목록에 그 작업이 있을 때만 보이고, 요청이 오가는 동안에는 보이지 않는다', () => {
    // 왜: 검토 a — 요청이 오가는 동안 Take 에 든 것은 화면이 만든 요청 키라, 그때 누르면 아무 말 없이 멈추지 못하고 Take 는 그대로 만들어졌다.
    done(1)
    const making = addTake({ takeNumber: 2, status: 'generating', lastAttemptStatus: 'generating', generationJobId: 'request-key-before-response' })
    expect(render('panel', 'video')).not.toContain('>Stop making<')
    director.getState().updateNodeData<'video'>(making, { generationJobId: '11111111-1111-4111-8111-111111111111' })
    expect(render('panel', 'video')).not.toContain('>Stop making<')
    queue.jobs = [{ id: '11111111-1111-4111-8111-111111111111', kind: 'shot_video', target: {} }]
    expect(render('panel', 'video')).toContain('>Stop making<')
    queue.jobs = [{ id: '11111111-1111-4111-8111-111111111111', kind: 'shot_video', target: {}, cancelledAt: '2026-11-14T03:00:00Z' }]
    expect(render('panel', 'video')).not.toContain('>Stop making<')
  })

  it('멈춘 뒤 끝난 Take 는 목록에 남아 "멈춘 뒤 끝났어요"를 보이고 ★ 최종(자동)이 되지 않는다', () => {
    // 왜: 오너 7번 "백그라운드에서 끝나면 히스토리로" — 늦게 끝난 영상은 볼 수 있지만 Editor 로 가는 것을 저절로 바꾸지 않는다.
    done(1)
    done(2, { cancelledAt: '2026-11-14T03:00:00Z' })
    const out = render('panel', 'video')
    expect(out).toContain('Finished after it was stopped')
    const list = out.slice(out.indexOf('data-testid="shot-detail-takes"'))
    expect(list.indexOf('★ Final (auto)')).toBeGreaterThan(list.indexOf('Take 1'))
  })

  it('시작 · 끝 이미지를 다시 만드는 중이면 새 Take 단추와 [다음: 영상 만들기]를 끄고, 다 되면 만들라고 한 줄로 알린다', () => {
    // 왜: 리드 검토 c ① — 다시 만드는 동안 누르면 옛 그림으로 Take 가 나간다(Take 를 쓴다).
    done(1)
    // 상점이 다시 만들기를 시작할 때와 같은 모양 — 지금 그림의 프레임 · 버전은 그대로, 상태만 만드는 중.
    director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: { ...IMAGE, ...keptStoryboardImage(IMAGE), status: 'generating' } })
    const video = render('panel', 'video')
    expect(video).toContain('The start and end images are being remade. Make the Take when they are done.')
    expect(buttonTag(video, 'Make a new Take · 5 Takes')).toContain('disabled=""')
    expect(buttonTag(render('popup'), 'Next: make the video · 5 Takes')).toContain('disabled=""')
    setLocale('ko')
    expect(render('panel', 'video')).toContain('시작 · 끝 이미지를 다시 만드는 중이에요. 다 되면 Take 를 만들어요.')
  })

  it('가장 새 Take 가 실패했으면 상세는 그 Take 를 먼저 보이고, 다시 만들기는 그 Take 의 모델 · 해상도를 이어받는다', () => {
    // 왜: 리드 검토 c ② — ★(또는 가장 최근 완성)를 먼저 보이면 그대로 눌렀을 때 ★ 의 모델 · 해상도로 나간다. 담당표 "실패 다시 만들기는 마지막 모델 · 해상도".
    done(1, { final: true })
    addTake({ takeNumber: 2, status: 'failed', lastAttemptStatus: 'failed', override: { provider: 'kling-o3', resolution: '720p' }, lastAttemptError: 'provider failed' })
    const out = render('panel', 'video')
    const preview = out.slice(out.indexOf('data-testid="shot-detail-take-preview"'), out.indexOf('data-testid="shot-detail-takes"'))
    expect(preview).toContain('Take 2')
    expect(out).toMatch(/aria-pressed="true"[^>]*>Kling O3 Pro</)
  })

  it('영상 고치기 칸에는 보고 있던 Take 의 바꿀 점이 미리 채워져 있고, 안내는 "비워 두면 샷 프롬프트 그대로"다', () => {
    // 왜: 리드 검토 c ③ — 바꿀 점은 쌓지 않는 대신 이어서 고치기 쉽게 미리 채운다(고치거나 지울 수 있다). 안내 글은 시안 D7 그대로.
    done(1, { override: { changeNote: 'slow push in' } as VideoNodeData['override'] })
    const out = render('panel', 'video')
    expect(out).toMatch(/<textarea[^>]*placeholder="What to change in the motion or camera · Leave it empty to keep the shot prompt"[^>]*>slow push in<\/textarea>/)
    setLocale('ko')
    expect(render('panel', 'video')).toContain('placeholder="움직임·카메라에서 바꿀 점 · 비워 두면 샷 프롬프트 그대로"')
  })

  it('Writer 샷에 예전 모델이 저장돼 있으면 이미지 모델 칸은 실제로 도는 GPT Image 2 를 고른 것으로 보인다', () => {
    // 왜: 리드 검토 c ④ — 아무 칸도 안 골라져 보이면 무엇으로 도는지 모른다.
    director.getState().updateNodeData<'shot'>(shotId, { imageModel: 'nano-banana-2' })
    expect(render('popup')).toMatch(/aria-pressed="true"[^>]*>GPT Image 2</)
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
    expect(out).toContain('Make a new Take · 5 Takes')
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
    expect(out).toContain('Make a new Take with the changed image · 5 Takes')
    setLocale('ko')
    const ko = render('panel', 'video')
    expect(ko).toContain('시작 · 끝 이미지가 바뀌었어요 · 새 Take를 만들면 반영돼요')
    expect(ko).toContain('바뀐 이미지로 새 Take 만들기 · 5 Take')
  })

  it('영상이 없는 샷의 영상 탭은 "아직 영상이 없어요"와 "영상 만들기 · N Take"를 보인다', () => {
    // 왜: D6 "다음: 영상 만들기 · 5 Take" — 이미지 탭에서 넘어오면 바로 첫 Take 를 만든다. 지울 Take 는 없다.
    const out = render('popup', 'video')
    expect(out).toContain('No video for this shot yet.')
    expect(out).toContain('Make the video · 5 Takes')
    expect(buttonTag(out, 'Make the video · 5 Takes')).not.toContain('disabled=""')
    expect(out).not.toContain('Delete this Take')
  })

  it('시작 · 끝 이미지가 없으면 영상 단추를 끄고 이미지를 먼저 만들라고 알린다', () => {
    // 왜: R "영상 만들기는 이미지가 먼저 있어야 해요" — 눌러도 실패하는 단추를 켜 두지 않는다.
    director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: null })
    const out = render('popup', 'video')
    expect(out).toContain('Make the start and end images first.')
    expect(buttonTag(out, 'Make the video · 5 Takes')).toContain('disabled=""')
  })

  it('같은 샷에서 Take 를 만드는 중이면 새 Take 단추를 끄고 다 되면 새로 만들 수 있다고 알린다', () => {
    // 왜: 지금은 한 샷을 한 번에 하나만 만든다(서버가 같은 샷 동시 생성을 거절) — 눌러도 거절되는 단추를 켜 두지 않는다.
    done(1)
    addTake({ takeNumber: 2, status: 'generating', lastAttemptStatus: 'generating' })
    const out = render('panel', 'video')
    expect(out).toContain('A Take is being made. You can make a new one when it is done.')
    expect(buttonTag(out, 'Make a new Take · 5 Takes')).toContain('disabled=""')
  })
})
