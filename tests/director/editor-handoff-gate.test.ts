// Director 의 [다음: Editor로]와 사이드바 Editor 는 같은 조건(완성 영상이 하나라도 있으면)으로 켜진다 (시안 R 416:4941, 결정 페이지 추천, 오너 2026-11-14)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { nextStepAction } from '@/lib/handoff-intent'
import { directorHasFinishedVideo, railEditorViaHandoff } from '@/lib/director/shot-state'
import type { DirectorNode } from '@/types/director'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const take = (id: string, status: string, url: string | null): DirectorNode =>
  ({ id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: 's1', status, videoUrl: url } }) as unknown as DirectorNode

describe('다음: Editor로', () => {
  it('다음 단계 단추 이름은 Director 에서 "다음: Editor로"다', () => {
    // 왜: 시안 D1 오른쪽 위 "다음: Editor로 →" — 다른 단계의 "다음: Director로"와 같은 꼴(design.md §16.1).
    const action = nextStepAction('director', { producerLocked: true })
    expect(action && ko(action.label)).toBe('다음: Editor로')
  })

  it('완성 영상이 하나도 없으면 Director 의 [다음: Editor로]가 꺼지고, 하나라도 있으면 켜진다', () => {
    // 왜: 시안 R "'다음: Editor로'와 사이드바 Editor 는 같은 조건으로 켜짐" — N 보드: 영상 0개인데 넘기기만 켜져 있던 것.
    expect(directorHasFinishedVideo([take('v1', 'generating', null), take('v2', 'failed', null)])).toBe(false)
    expect(directorHasFinishedVideo([take('v1', 'completed', 'https://x/v.mp4')])).toBe(true)
    expect(directorHasFinishedVideo([take('v1', 'completed', '')])).toBe(false)
  })

  it('다른 할 일이 있으면 [다음: Editor로]는 보조 단추이고, 만들 것이 없을 때만 크림이다', () => {
    // 왜: 시안 R "가장 밝은 버튼 = 지금 할 일 하나".
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(page).toContain("emphasis={primary === 'editor' ? 'primary' : 'secondary'}")
    expect(page).toContain('blocked={!canHandOff}')
  })
})

describe('사이드바 Editor', () => {
  it('아직 넘기기 전에는 Director 에 완성 영상이 있을 때만 사이드바 Editor 가 켜지고, 누르면 [다음: Editor로]와 같은 넘김을 한다', () => {
    // 왜: 같은 조건 · 같은 결과(혼자 정한 것 a). 넘김 없이 Editor 로 가면 단계가 안 바뀐다.
    expect(railEditorViaHandoff({ stage: 'editor', onDirector: true, reachedDirectorOnly: true, finishedVideo: true })).toBe(true)
    expect(railEditorViaHandoff({ stage: 'editor', onDirector: true, reachedDirectorOnly: true, finishedVideo: false })).toBe(false)
    expect(railEditorViaHandoff({ stage: 'editor', onDirector: true, reachedDirectorOnly: false, finishedVideo: true })).toBe(false)
    expect(railEditorViaHandoff({ stage: 'artist', onDirector: true, reachedDirectorOnly: true, finishedVideo: true })).toBe(false)
    const sidebar = readFileSync('src/components/layout/sidebar.tsx', 'utf8')
    expect(sidebar).toMatch(/if \(viaHandoff\) void requestNextStep\(\)/)
  })

  it('잠긴 사이드바 Editor 는 왜 잠겼는지 화면 언어로 알린다', () => {
    // 왜: N 보드 — 영어 "Complete previous step first" 그대로였고 넘기기 단추와 다른 말을 했다.
    expect(ko('A finished video lets you move on.')).toBe('완성된 영상이 하나 있으면 넘어갈 수 있어요')
    expect(ko('Complete previous step first')).toBe('이전 단계를 먼저 끝내세요')
  })
})

describe('넘김 조건 한 곳', () => {
  const sidebar = () => readFileSync('src/components/layout/sidebar.tsx', 'utf8')

  it('Director 화면 밖에서는 사이드바 Editor 를 넘김으로 열지 않는다 — 지금 단계의 넘김이 돌지 않게', () => {
    // 왜: Director 상점은 화면을 떠나도 남아 Artist · Writer 에서도 Editor 칸이 켜졌고, 누르면 그 단계의 넘김
    //   (Artist→Storyboard 등)이 돌았다(리드 검토 a S6 보통 2).
    expect(railEditorViaHandoff({ stage: 'editor', onDirector: false, reachedDirectorOnly: true, finishedVideo: true })).toBe(false)
    expect(sidebar()).toContain("onDirector: visibleStage === 'director'")
  })

  it('[다음: Editor로] · 사이드바 Editor · 채팅 넘김은 같은 조건 — 완성 영상이 하나라도 있으면 — 이고 같은 말을 한다', () => {
    // 왜: 위 단추는 샷 상태로, 사이드바는 완성 Take 로, 채팅은 조건 없이 넘겨 서로 달랐다
    //   ("Take1 완성 + Take2 다시 만드는 중" · "샷 없는 독립 영상만 완성", 리드 검토 a 낮음 7).
    const remaking = { ...take('v2', 'generating', null) }
    expect(directorHasFinishedVideo([take('v1', 'completed', 'https://x/v1.mp4'), remaking])).toBe(true)
    const standalone = { ...take('v3', 'completed', 'https://x/v3.mp4'), data: { ...take('v3', 'completed', 'https://x/v3.mp4').data, parentShotNodeId: null } } as DirectorNode
    expect(directorHasFinishedVideo([standalone])).toBe(true)
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(page).toContain('const canHandOff = directorHasFinishedVideo(nodes)')
    expect(sidebar()).toContain('directorHasFinishedVideo(s.nodes ?? [])')
    const chat = readFileSync('src/stores/global-chat-store.ts', 'utf8')
    const gate = chat.slice(chat.indexOf("if (spec.from === 'director') {"), chat.indexOf("if (spec.from === 'director') {") + 900)
    expect(gate).toContain('if (!directorHasFinishedVideo(nodes))')
    expect(gate).toContain("translate(locale, 'A finished video lets you move on.')")
  })

  it('Director 밖에서 새로 고쳐 Director 기록이 비어 있으면 사이드바 Editor 잠금 까닭에 "완성된 영상이…"를 쓰지 않는다', () => {
    // 왜: 영상이 있어도 기록을 아직 안 읽어 "완성된 영상이 하나 있으면…"이 떴다(리드 검토 a 낮음 8). 그 말은 Director 화면에서만.
    expect(sidebar()).toContain("stage.id === 'editor' && reachedStage === 'director' && visibleStage === 'director'")
  })
})
