// Cinema 단계가 Storyboard 와 Director 사이에 서고, 이름 · 주소 · 다음 단계 · 단축키 · 색 · 열림 규칙이 단계 표 한 곳대로 맞는지 검사한다 (오너 2026-11-22 D2~D5)
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
// 그림체 잠금은 Camera 단계 값만으로 정해져야 한다 — DB 를 읽으면 이 시험은 실패한다.
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: () => { throw new Error('단계 값만으로 정해야 한다') } } }))
import { STAGES, STAGE_AGENT_NAME, STAGE_BADGE_CLASS, STAGE_CHAT_TITLE, STAGE_FACE_COLOR, STAGE_FULL_NAME, STAGE_LABEL } from '@/lib/constants'
import { STAGE_PERSONA } from '@/lib/lumi'
import { STAGE_ACCESS_KEY, stageForShortcut } from '@/lib/stage-shortcuts'
import { canEnterStage, type StageFacts } from '@/lib/stage-gate'
import { projectOpenPath } from '@/lib/project/open-path'
import { projectStageDot } from '@/features/projects/project-list'
import { artistStyleLocked } from '@/lib/artist/style-versions-server'
import { handoffMarker, parseHandoffMarker } from '@/lib/chat-blocks'
import { workflowStageReached } from '@/stores/chat-workflow-bindings'
import { translate } from '@/lib/i18n/translate'

// 산문을 확정하고 [만들기]까지 한 프로젝트 — 단계 값(storedStage)만 바꿔 가며 본다.
const facts = (storedStage: string): StageFacts => ({ storedStage, treatmentStarted: true, runContinued: true, hasShots: true, proseConfirmed: true })
const alt = (digit: string) => stageForShortcut({ code: `Digit${digit}`, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })

describe('Cinema 단계 등록', () => {
  it('Cinema 는 Storyboard 다음 · Director 앞의 단계이고 주소는 /studio/camera 다', () => {
    // 왜: 오너 D2~D5 "director 의 storyboard 뷰를 없애고 새로운 탭을 만들거야(director 앞에)". 정상 경로 고정.
    expect(STAGES.map((s) => s.id)).toEqual(['entry', 'producer', 'artist', 'writer', 'camera', 'director', 'editor'])
    expect(STAGES.find((s) => s.id === 'camera')?.path).toBe('/studio/camera')
  })

  it('Storyboard 의 다음 단계는 Cinema, Cinema 의 다음 단계는 Director 다', () => {
    // 왜: 콘티에서 [다음]을 누르면 Camera, Camera 에서 [다음]을 누르면 Director 다(리드 단계 구조 11/22).
    const next = Object.fromEntries(STAGES.map((s) => [s.id, s.nextStage]))
    expect(next.writer).toBe('camera')
    expect(next.camera).toBe('director')
  })

  it('탭 이름은 두 말 모두 Cinema 이고(레일 · 위 막대 칩 · 넘김 단추 · 채팅 머리), 마우스를 올리면 풀네임 Cinematographer 가 보이며, 문장 속 이름도 Cinematographer 다', () => {
    // 왜: 오너 2026-11-22 E1 — 짧은 탭 이름 Cinema, 레일 칸 · 칩에 마우스를 올리면 풀네임. 내부 id camera · 주소 /studio/camera 는 그대로(바꾸지 않는 내부 이름).
    // 탭 이름은 번역하지 않는다(문구의 {stage} 자리에 그대로 들어간다 — 'Cinema' 키의 '시네마'는 화면비 이름이다).
    expect(STAGE_LABEL.camera).toBe('Cinema')
    expect(STAGE_AGENT_NAME.camera).toBe('Cinematographer')
    expect(STAGE_FULL_NAME.camera).toBe('Cinematographer')
    expect(STAGES.find((s) => s.id === 'camera')).toMatchObject({ name: 'Cinematographer', path: '/studio/camera' })
    expect(translate('ko', STAGE_CHAT_TITLE.camera, { stage: STAGE_LABEL.camera })).toBe('Lumi · Cinema')
    expect(translate('ko', 'Next: {stage}', { stage: STAGE_LABEL.camera })).toBe('다음: Cinema로')
    expect(readFileSync('src/components/layout/global-chat.tsx', 'utf8')).toContain('t(STAGE_CHAT_TITLE[currentStage], { stage: STAGE_LABEL[currentStage] })')
    // 마우스를 올리면: 레일 칸 툴팁의 이름 줄과 위 막대 칩의 설명(title)이 풀네임.
    expect(readFileSync('src/components/layout/sidebar.tsx', 'utf8')).toMatch(/\{STAGE_FULL_NAME\[stage\.id\] \?\? stage\.name\}/)
    expect(readFileSync('src/components/controls/stage-chip.tsx', 'utf8')).toMatch(/title=\{STAGE_FULL_NAME\[stage\]\}/)
  })

  it('Cinema 는 옛 Storyboard 단계의 색 · Lumi 옷 · 아이콘을 쓴다', () => {
    // 왜: 레일 여섯 칸 = 로고 여섯 색 — 콘티가 Writer 칸 안으로 들어가며 비는 Storyboard 자리를 Camera 가 받는다(리드 11/22, design.md §2.9).
    expect(STAGE_PERSONA.camera).toBe('storyboard')
    expect(STAGE_FACE_COLOR.camera).toBe('var(--stage-storyboard)')
    expect(STAGE_BADGE_CLASS.camera).toContain('bg-stage-storyboard/15')
    expect(projectStageDot('camera')).toBe('bg-stage-storyboard')
    expect(readFileSync('src/components/layout/sidebar.tsx', 'utf8')).toMatch(/camera: StoryboardIcon/)
  })

  it('Alt+4 는 Cinema, Alt+5 는 Director, Alt+6 은 Editor 로 가고 Storyboard 에는 따로 Alt 키가 없다', () => {
    // 왜: 레일은 Producer · Writer · Artist · Camera · Director · Editor 여섯 칸이고 콘티는 Writer 칸 안에 있다(리드 단계 구조) — 숫자가 칸 순서와 맞게.
    expect([alt('4'), alt('5'), alt('6')]).toEqual(['camera', 'director', 'editor'])
    expect(STAGE_ACCESS_KEY.writer).toBe('')
    expect(STAGES.map((s) => STAGE_ACCESS_KEY[s.id]).filter(Boolean)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('Director · Editor 까지 간 프로젝트는 Cinema 에 들어갈 수 있고, Storyboard 까지만 연 프로젝트는 아직 못 들어간다', () => {
    // 왜: 새 탭이 생기기 전에 Director 를 지난 프로젝트가 Camera 앞에서 막히지 않게 — 단계는 순서로만 연다. 정상 경로 고정.
    expect(canEnterStage('camera', facts('director'))).toBe(true)
    expect(canEnterStage('camera', facts('editor'))).toBe(true)
    expect(canEnterStage('camera', facts('camera'))).toBe(true)
    expect(canEnterStage('camera', facts('writer'))).toBe(false)
  })

  it('홈 · 프로젝트 목록에서 Cinema 단계 프로젝트를 누르면 Cinema 화면으로 연다', () => {
    // 왜: 정상 경로 고정 — 목록은 단계 표의 주소로만 연다.
    expect(projectOpenPath('camera', 'p1')).toBe('/studio/camera?projectId=p1')
  })

  it('Cinema 까지 간 프로젝트는 Artist 그림체가 잠겨 있다', async () => {
    // 왜: 그림체는 Storyboard 를 연 뒤 잠긴다 — Camera 를 빼먹으면 Camera 단계 프로젝트에서 그림체를 바꿔 이미 만든 실사와 어긋난다.
    await expect(artistStyleLocked({ id: 'p1', current_stage: 'camera' })).resolves.toBe(true)
  })

  it('채팅의 ⇄ 넘김 표시는 Storyboard → Cinema 와 Cinema → Director 도 알아본다', () => {
    // 왜: 넘김 표시를 못 알아보면 채팅에 "⇄ writer → camera" 글자가 그대로 보인다.
    expect(parseHandoffMarker(handoffMarker('writer', 'camera'))).toEqual({ from: 'writer', to: 'camera' })
    expect(parseHandoffMarker(handoffMarker('camera', 'director'))).toEqual({ from: 'camera', to: 'director' })
  })

  it('Cinema 까지 간 프로젝트도 채팅 작업 흐름에서는 Writer 를 지난 프로젝트로 본다', () => {
    // 왜: 채팅이 단계를 확인할 때 Camera 를 모르면 Camera 단계 프로젝트를 "단계를 확인하지 못함"으로 본다.
    expect(workflowStageReached('camera', 'writer')).toBe(true)
    expect(workflowStageReached('camera', 'producer')).toBe(true)
    expect(workflowStageReached('director', 'camera')).toBe(true)
    expect(workflowStageReached('producer', 'writer')).toBe(false)
  })
})
