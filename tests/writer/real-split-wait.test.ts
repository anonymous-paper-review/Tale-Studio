// Storyboard 실사 보기가 씬 · 샷 나누기를 기다리는 동안 무엇을 보이는지 — 나누는 중이면 예전 Storyboard 와 같은 잠금 표시, 끝나 다시 읽는 틈에는 기다림, 멈췄으면 까닭과 [이어서 다시 시도]인지 검사한다
import { describe, expect, it } from 'vitest'
import { storyboardSplitState } from '@/lib/storyboard/split-wait'

// 이 시험을 위해 지은 Writer 실행 상태.
const running = (stage: string) => ({ started: true, current_status: 'running', current_stage: stage, pipeline_completed: false, pipeline_failed: false, error: null })
const completed = { started: true, current_status: 'completed', current_stage: 'persistShots', pipeline_completed: true, pipeline_failed: false, error: null }
const failed = { started: true, current_status: 'failed', current_stage: 'decoupage', pipeline_completed: false, pipeline_failed: true, error: '연출 단계 응답이 비었어요' }
const base = { hasShots: false, reloadSettled: false, sceneCount: 3 }

describe('Storyboard 가 씬 · 샷 나누기를 기다리는 동안', () => {
  // 왜(검토 2026-11-26 rev-flow): 예전 흐름 프로젝트는 나누기 중에 Artist [완료하기]를 누를 수 있다(10/19 이후 늘) —
  //   그때 Storyboard 가 "아직 생성된 씬·샷이 없어요"로 멈춰 있었다. 예전 Storyboard 보드처럼 단계 · 진행이 보이는 잠금 표시를 띄운다.
  it('씬 · 샷을 나누는 중이면 예전 Storyboard 와 같은 잠금 표시(단계 · 진행 · 큰 Lumi)를 보인다', () => {
    const state = storyboardSplitState({ ...base, status: running('decoupage') }, 'ko')
    expect(state.kind).toBe('split')
    if (state.kind !== 'split') return
    expect(state.busy).toMatchObject({ open: true, phase: 'split', title: 'Storyboard로 넘어가는 중이에요', progress: 50, progressLabel: '3/4 단계 · 50%', lumi: true })
    expect(state.busy.steps?.map((step) => step.state)).toEqual(['done', 'done', 'current', 'todo', 'todo'])
    expect(state.busy.steps?.[1].label).toBe('씬 3개로 나누기')
  })

  // 왜: Storyboard 는 콘티 그림을 카드마다 그리며 화면을 잠그지 않는다(덧붙임 2 w) — 잠금 안내도 나누기가 끝날 때까지만 잠근다고 말하고,
  //   마지막 단계 이름도 이 화면의 말("콘티 그림")로 쓴다.
  it('잠금 안내는 나누기가 끝날 때까지 잠그고 그 뒤 카드마다 콘티 그림을 그린다고 말하고, 마지막 단계는 "콘티 그림 그리기"다', () => {
    const state = storyboardSplitState({ ...base, status: running('sceneCinematography') }, 'ko')
    expect(state.kind === 'split' && state.busy.description).toBe('씬 · 샷을 나누고 있어요. 몇 분 걸릴 수 있어요. 나누기가 끝날 때까지 화면과 채팅은 잠기고, 그 뒤 카드마다 콘티 그림을 그려요.')
    expect(state.kind === 'split' && state.busy.steps?.at(-1)).toEqual({ label: '콘티 그림 그리기', state: 'todo' })
  })

  // 왜(예전 보드와 같은 규칙): 나누기가 끝난 순간 저장된 샷이 아직 화면에 없다 — 다시 읽기가 끝날 때까지 빈 보드 안내가 번쩍이지 않게 기다림을 보인다.
  it('나누기가 끝나 씬 · 샷을 다시 읽는 동안에는 빈 보드 안내 대신 기다림을 보이고, 다 읽으면 그때의 모습을 보인다', () => {
    expect(storyboardSplitState({ ...base, status: completed }, 'ko')).toEqual({ kind: 'reloading' })
    expect(storyboardSplitState({ ...base, status: completed, reloadSettled: true }, 'ko')).toEqual({ kind: 'empty' })
    expect(storyboardSplitState({ ...base, status: completed, hasShots: true }, 'ko')).toEqual({ kind: 'board' })
  })

  // 왜(예전 보드의 실패 안내): 나누기가 멈추면 까닭을 알리고 [이어서 다시 시도]로 멈춘 자리부터 다시 하게 한다.
  it('나누기가 멈췄으면 까닭과 함께 이어서 다시 시도하게 한다', () => {
    expect(storyboardSplitState({ ...base, status: failed }, 'ko')).toEqual({ kind: 'failed', error: '연출 단계 응답이 비었어요' })
  })

  // 왜(예전 보드와 같은 말): 실행이 Artist [완료하기]를 기다리면 아직 나누지 않았다 — 그 진행 문구를 보인다.
  it('실행이 Artist [완료하기]를 기다리는 중이면 그 진행 문구를 보인다', () => {
    const state = storyboardSplitState({ ...base, status: { ...running('characterDesign'), current_status: 'awaiting_artist' } }, 'ko')
    expect(state.kind).toBe('waiting')
  })

  // 왜(정상 경로 고정): 샷이 있으면 보드다. 샷이 있어도 다시 나누는 중이면 예전 보드처럼 잠근다.
  it('샷이 있으면 보드를 보이고, 샷이 있어도 다시 나누는 중이면 잠금 표시를 보인다', () => {
    expect(storyboardSplitState({ ...base, hasShots: true, status: null }, 'ko')).toEqual({ kind: 'board' })
    expect(storyboardSplitState({ ...base, hasShots: true, status: running('shotsAndDialogue') }, 'ko').kind).toBe('split')
    expect(storyboardSplitState({ ...base, status: null }, 'ko')).toEqual({ kind: 'empty' })
  })
})
