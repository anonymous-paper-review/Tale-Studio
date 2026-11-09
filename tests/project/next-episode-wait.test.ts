// 다음 화를 만드는 동안 보이는 기다리는 카드(앞 화 열기 → 인물·배경 불러오기 → 그림체 맞추기) — 11/5 시안 R5 (리드 2026-11-09)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NEXT_EPISODE_WAIT_STEPS, NEXT_EPISODE_WAIT_STEP_MS, nextEpisodeWaitStep } from '@/features/projects/series-list'
import { translate } from '@/lib/i18n'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const dialogs = () => readFileSync('src/features/projects/next-episode-dialog.tsx', 'utf8')

describe('다음 화 기다리는 카드', () => {
  // 왜: 다음 화 만들기는 AI 한 번 + 그림 복사라 몇 초 걸린다 — 단추 안 도는 표시만으로는 무엇을 하는지 모른다.
  it('다음 화 만들기를 누르면 앞 화 열기 · 인물·배경 불러오기 · 그림체 맞추기 세 단계가 적힌 기다리는 카드를 띄운다', () => {
    expect(NEXT_EPISODE_WAIT_STEPS.map((step) => ko(step))).toEqual(['앞 화 열기', '인물·배경 불러오는 중', '그림체 맞추기'])
    expect(ko('Loading the previous episode')).toBe('앞 화를 불러오고 있어요')
    expect(ko('Carrying over the characters, backgrounds and art style of "{title}".', { title: '자판기의 반란' })).toBe(
      '「자판기의 반란」의 인물·배경·그림체를 이어받는 중이에요.',
    )
    const source = dialogs()
    expect(source).toContain('<AiBusyOverlay')
    expect(source).toContain('open={creating}')
    expect(source).toContain('lumi="pearl"')
    expect(source).toContain('layer="dialog"')
  })

  // 왜: 서버는 한 번에 답해서 단계를 알려 주지 않는다 — Producer 자료 읽기와 같은 빠르기로 넘기고, 끝난 척하지 않는다.
  it('기다리는 카드는 1.4초마다 다음 단계로 넘어가고 마지막 그림체 맞추기는 답이 올 때까지 지금 단계로 남는다', () => {
    expect(NEXT_EPISODE_WAIT_STEP_MS).toBe(1400)
    expect(nextEpisodeWaitStep(0)).toBe(1)
    expect(nextEpisodeWaitStep(1)).toBe(2)
    expect(nextEpisodeWaitStep(2)).toBe(2)
    expect(nextEpisodeWaitStep(9)).toBe(2)
  })

  // 왜: 만들지 못하면 카드 뒤 창에서 이유(다시 시도 · 앞 화 없음)를 읽어야 한다. 만들어졌으면 카드를 띄운 채 새 프로젝트로 간다.
  it('다음 화를 만들지 못하면 기다리는 카드를 닫고 창에 실패 안내를 보이고, 만들어지면 카드를 띄운 채 새 프로젝트 시작 화면으로 간다', () => {
    const source = dialogs()
    const create = source.slice(source.indexOf('const create = useCallback'), source.indexOf('const error = failureText'))
    expect(create).toContain('setFailure(mapped)')
    expect(create).toMatch(/router\.push\(`\/studio\/start\?projectId=\$\{body\.projectId\}`\)\s*\n\s*return/)
    expect(create).not.toContain('finally')
  })
})
