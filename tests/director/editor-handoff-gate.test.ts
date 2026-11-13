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
    expect(railEditorViaHandoff({ stage: 'editor', reachedDirectorOnly: true, finishedVideo: true })).toBe(true)
    expect(railEditorViaHandoff({ stage: 'editor', reachedDirectorOnly: true, finishedVideo: false })).toBe(false)
    expect(railEditorViaHandoff({ stage: 'editor', reachedDirectorOnly: false, finishedVideo: true })).toBe(false)
    expect(railEditorViaHandoff({ stage: 'artist', reachedDirectorOnly: true, finishedVideo: true })).toBe(false)
    const sidebar = readFileSync('src/components/layout/sidebar.tsx', 'utf8')
    expect(sidebar).toMatch(/if \(viaHandoff\) void requestNextStep\(\)/)
  })

  it('잠긴 사이드바 Editor 는 왜 잠겼는지 화면 언어로 알린다', () => {
    // 왜: N 보드 — 영어 "Complete previous step first" 그대로였고 넘기기 단추와 다른 말을 했다.
    expect(ko('A finished video lets you move on.')).toBe('완성된 영상이 하나 있으면 넘어갈 수 있어요')
    expect(ko('Complete previous step first')).toBe('이전 단계를 먼저 끝내세요')
  })
})
