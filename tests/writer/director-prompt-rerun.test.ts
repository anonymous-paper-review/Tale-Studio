// Writer 파이프라인을 다시 돌려 샷을 새로 넣어도, 샷 글과 샷 이야기가 그대로인 샷은 Director 에서 고친 글을 남기고 바뀐 샷은 남기지 않는다 (리드 2026-11-26 — 고친 글이 말없이 지워지는 길 막기)
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { applyShotCarryForward } from '@/lib/writer/pipeline/util/persist_manifest'

const row = (extra: Record<string, unknown> = {}) => ({
  project_id: 'p1', shot_id: 'sh_01_01', prompt: 'A woman waits on a rainy platform.', action_description: 'She waits for the train.', ...extra,
})

describe('파이프라인 다시 돌리기와 Director 고친 글', () => {
  it('파이프라인을 다시 돌려도 샷 글과 샷 이야기가 그대로인 샷은 Director 에서 고친 글을 남긴다', () => {
    // 왜: 다시 돌리기는 샷을 지우고 새로 넣는다 — 글이 그대로여도(글 캐시) Director 에서 고친 글이 말없이 사라졌다. DB 방아쇠와 같은 규칙: 그대로면 남긴다.
    const existing = { ...row(), director_prompt: 'A woman waits on a rainy platform holding a red umbrella.' }
    expect(applyShotCarryForward(row(), existing)).toMatchObject({ director_prompt: 'A woman waits on a rainy platform holding a red umbrella.' })
  })

  it('다시 돌린 샷의 글이나 샷 이야기가 바뀌었으면 Director 에서 고친 글을 남기지 않는다', () => {
    // 왜: 승인된 규칙 "Writer 가 샷 글을 다시 쓰면 Director 고친 글을 비운다" — 옛 글을 고친 글이 새 이야기를 덮지 않게.
    const edited = { director_prompt: 'A woman waits on a rainy platform holding a red umbrella.' }
    expect(applyShotCarryForward(row(), { ...row({ prompt: 'An older prompt.' }), ...edited })).not.toHaveProperty('director_prompt')
    expect(applyShotCarryForward(row(), { ...row({ action_description: 'She runs for the train.' }), ...edited })).not.toHaveProperty('director_prompt')
  })

  it('고친 글이 없던 샷은 지금처럼 고친 글 칸 없이 넣는다', () => {
    // 왜: 정상 경로 고정 — 고친 적 없는 샷의 새 행은 지금과 같다.
    expect(applyShotCarryForward(row(), { ...row(), director_prompt: null })).toEqual(row())
    expect(applyShotCarryForward(row(), { ...row(), canvas_position: { x: 1, y: 2 } })).toEqual({ ...row(), canvas_position: { x: 1, y: 2 } })
  })
})
