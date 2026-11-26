// 콘티(Writer 의 두 번째 칸)가 씬 스토리와 Artist 사이의 단계로 열리는 순서 · 열림 · 잠금 · 넘김 · 모습을 검사한다 (오너 2026-11-26 O1 "콘티를 Artist 앞에", 리드 구조 C)
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STAGES, STAGE_AGENT_NAME, STAGE_BADGE_CLASS, STAGE_FACE_COLOR, STAGE_LABEL } from '@/lib/constants'
import { canEnterStage, proseLockedFromFacts, reachedStageFromFacts, type StageFacts } from '@/lib/stage-gate'
import { STAGE_PERSONA } from '@/lib/lumi'
import { translate } from '@/lib/i18n/translate'

const facts = (over: Partial<StageFacts>): StageFacts => ({ storedStage: 'producer', treatmentStarted: true, runContinued: false, hasShots: false, proseConfirmed: false, ...over })

describe('단계 순서', () => {
  // 왜: O1 — Writer = 씬 스토리 → 콘티(씬 · 샷 나누기 · 목각 러프) → [Artist로 가기] → Artist → [완료하기] → Storyboard. 콘티는 새 단계(id conti, /studio/conti)이고
  //   Storyboard 는 지금 단계(id writer)와 주소를 그대로 쓴다(리드 구조 C — 지금 Storyboard 단계 프로젝트의 데이터를 옮기지 않는다).
  it('단계는 Producer, Writer 씬 스토리, Writer 콘티, Artist, Storyboard, Director, Editor 순서로 열린다', () => {
    expect(STAGES.map((stage) => stage.id)).toEqual(['entry', 'producer', 'conti', 'artist', 'writer', 'director', 'editor'])
    expect(STAGES.map((stage) => stage.path)).toEqual(['/studio/start', '/studio/producer', '/studio/conti', '/studio/artist', '/studio/writer', '/studio/director', '/studio/editor'])
    expect(STAGES.map((stage) => stage.nextStage)).toEqual(['producer', 'conti', 'artist', 'writer', 'director', 'editor', null])
  })

  // 왜: O1 · W4 — 콘티를 마치고 Artist 로 가는 단추가 "Artist로 가기"다.
  it('콘티의 다음 단계는 Artist 이고 넘김 단추 이름은 "Artist로 가기"다', () => {
    const conti = STAGES.find((stage) => stage.id === 'conti')!
    expect(conti.nextStage).toBe('artist')
    expect(conti.handoffLabel).toBe('Go to Artist')
    expect(translate('ko', conti.handoffLabel)).toBe('Artist로 가기')
  })

  // 왜: 정상 경로 고정 — Artist [완료하기]는 지금처럼 Storyboard 를 연다(O1 "Artist [완료하기]는 Storyboard 를 연다").
  it('Artist 의 다음 단계는 지금처럼 Storyboard 다', () => {
    expect(STAGES.find((stage) => stage.id === 'artist')!.nextStage).toBe('writer')
    expect(STAGE_LABEL.writer).toBe('Storyboard')
  })
})

describe('단계 열림', () => {
  // 왜: O1 — 산문을 확정하면 씬 · 샷 나누기가 Artist 를 기다리지 않고 이어 돌고 콘티가 열린다. Artist 는 콘티의 [Artist로 가기]로 연다.
  it('산문을 확정하면 콘티가 열리고 Artist 는 아직 열리지 않는다', () => {
    const confirmed = facts({ storedStage: 'conti', runContinued: true, proseConfirmed: true })
    expect(reachedStageFromFacts(confirmed)).toBe('conti')
    expect(canEnterStage('conti', confirmed)).toBe(true)
    expect(canEnterStage('artist', confirmed)).toBe(false)
  })

  // 왜(혼자 정한 것): 산문 확정 뒤 실행이 이어 돌면(디자인 · 나누기) "실행이 초안이 아니다 · 샷이 있다"는 사실이 생긴다 —
  //   예전 흐름을 읽던 규칙대로면 산문 확정 직후 Artist · Storyboard 가 미리 열린다. 산문을 확정한 실행은 저장된 단계가 진실이다.
  it('산문을 확정한 실행은 씬 · 샷까지 이어 돌아도 저장된 단계만 보고 Artist · Storyboard 를 미리 열지 않는다', () => {
    expect(reachedStageFromFacts(facts({ storedStage: 'conti', runContinued: true, hasShots: true, proseConfirmed: true }))).toBe('conti')
    expect(reachedStageFromFacts(facts({ storedStage: 'artist', runContinued: true, hasShots: true, proseConfirmed: true }))).toBe('artist')
  })

  // 왜: 정상 경로 고정 — 산문을 확정하지 않은 예전 흐름 실행은 지금처럼 산출물로도 본다(리뉴얼 전 프로젝트).
  it('산문 확정을 거치지 않은 예전 흐름 실행은 지금처럼 실행 · 샷으로도 단계를 연다', () => {
    expect(reachedStageFromFacts(facts({ storedStage: 'producer', runContinued: true }))).toBe('artist')
    expect(reachedStageFromFacts(facts({ storedStage: 'producer', runContinued: true, hasShots: true }))).toBe('writer')
  })

  // 왜: 리드 구조 C — Artist 단계에서 아직 [만들기] 전인 프로젝트(산문 초안 실행)는 예전 길 그대로다. 콘티는 지난 칸이라 열려 있다.
  it('이미 Artist 단계인 프로젝트는 지금처럼 Artist 가 열려 있고 콘티도 열린다', () => {
    const legacy = facts({ storedStage: 'artist', proseConfirmed: true })
    expect(reachedStageFromFacts(legacy)).toBe('artist')
    expect(canEnterStage('conti', legacy)).toBe(true)
    expect(canEnterStage('writer', legacy)).toBe(false)
  })

  // 왜: O1 — 콘티가 열린 뒤(산문 확정 뒤)에는 산문을 고칠 수 없다. 아직 씬 스토리 단계면 고칠 수 있다.
  it('콘티가 열리면 씬 스토리 산문은 잠기고, 아직 씬 스토리 단계면 잠기지 않는다', () => {
    expect(proseLockedFromFacts(facts({ storedStage: 'conti', proseConfirmed: true }))).toBe(true)
    expect(proseLockedFromFacts(facts({ storedStage: 'producer' }))).toBe(false)
  })
})

describe('콘티의 모습', () => {
  // 왜: 콘티는 레일의 Writer 칸 안이다 — 이름표 · 색 · Lumi 옷이 Writer 와 다르면 다른 단계로 간 것처럼 보인다(dev D1 · 리드 11/22 결정 2 와 같은 뜻).
  it('콘티는 Writer 와 같은 이름표 · 색 · Lumi 옷을 쓴다', () => {
    expect(STAGE_LABEL.conti).toBe('Writer')
    expect(STAGE_AGENT_NAME.conti).toBe('Writer')
    expect(STAGE_BADGE_CLASS.conti).toBe(STAGE_BADGE_CLASS.producer)
    expect(STAGE_FACE_COLOR.conti).toBe(STAGE_FACE_COLOR.producer)
    expect(STAGE_PERSONA.conti).toBe('writer')
  })

  // 왜: O1 — 콘티는 지금 Storyboard 화면의 보드(씬 · 샷 · 목각 러프 · 화살표 · 대사 탭)다. 같은 보드 부품을 쓴다.
  it('콘티 화면은 씬 · 샷 · 러프 보드와 대사 탭을 보인다', () => {
    expect(existsSync('src/app/studio/conti/page.tsx')).toBe(true)
    expect(readFileSync('src/app/studio/conti/page.tsx', 'utf8')).toMatch(/<WriterWorkspace \/>/)
  })

  // 왜(혼자 정한 것): 보드는 열릴 때 씬 · 샷을 직접 읽는다 — 화면 틀이 미리 읽기(워밍)로 같은 것을 또 읽으면 콘티를 열 때마다 두 번 읽는다.
  it('콘티 화면을 열면 씬 · 샷을 보드가 한 번만 읽는다 — 화면 틀은 보드 단계(콘티 · Storyboard)에서 미리 읽지 않는다', () => {
    const layout = readFileSync('src/app/studio/layout.tsx', 'utf8')
    expect(layout).toMatch(/if \(!isBoardStage\(stage\)\) void useWriterStore\.getState\(\)\.loadProject\(\)/)
  })
})
