// V2 대사(plannedTiming 칸이 있는 줄)를 채팅으로 고쳐도 plannedTiming 이 거절되거나 지워지지 않고 그대로 남는지 검사한다
import { describe, expect, it, vi } from 'vitest'

const rows = vi.hoisted(() => ({
  shots: [{
    shot_id: 'sh_02_07', scene_id: 'sc_02',
    // V2 파이프라인이 저장하는 모양(v2/persist dialogueLines) — 말투는 빈 글, 길이 힌트는 0, plannedTiming 은 계획한 대사 시점.
    dialogue_lines: [{ characterId: 'nurse', text: 'Not tonight...', emotion: 'Frustrated', delivery: '', durationHint: 0, plannedTiming: '2.0-3.5s' }],
  }],
  characters: [{ character_id: 'nurse' }],
} as Record<string, Array<Record<string, unknown>>>))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: (table: string) => ({ select: () => ({ eq: async () => ({ data: rows[table] ?? [], error: null }) }) }) }),
}))

import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { validateWriterUpdates } from '@/lib/writer-chat-updates'
import { serializeWriterScriptContext } from '@/lib/script-lines'
import type { SceneManifest, Shot } from '@/types'

const resources = () => createStudioToolResources({ stage: 'writer', projectId: 'p', traceId: 't', signal: new AbortController().signal, isCurrent: () => true })
const v2Line = { characterId: 'nurse', text: 'Not now...', emotion: 'Frustrated', delivery: '', durationHint: 0, plannedTiming: '2.0-3.5s' }

describe('채팅으로 V2 대사 고치기', () => {
  // 왜: V2 파이프라인은 대사마다 plannedTiming(계획한 대사 시점)을 저장한다. 채팅 검사가 이 칸을 몰라, 지시대로 읽은 칸을 모두 보존해 보낸
  //   고치기는 "모르는 칸"으로 거절됐고, 칸을 빼고 보내면 저장하면서 plannedTiming 을 지웠다(2026-11-02 확인 — 대사 고치기는 줄 전체를 다시 쓴다).
  it('V2 대사를 채팅 고치기 도구로 고쳐도 plannedTiming 은 그대로 남는다', async () => {
    const r = resources()
    await r.dialogue.read()
    const saved = { dialogueLines: [{ characterId: 'nurse', text: 'Not now...', emotion: 'Frustrated', plannedTiming: '2.0-3.5s' }] }
    expect(r.dialogue.validate({ dialogueLines: [v2Line] })).toEqual(saved)
    expect(r.shots.validate({ dialogueLines: [v2Line] })).toEqual(saved)
  })

  // 왜: 도구를 쓰지 않는 길(채팅 답의 고치기 목록)도 같은 검사를 지난다. 모델은 보이는 칸만 다시 보낼 수 있어, 채팅에 보내는 샷 목록에도 plannedTiming 을 보인다.
  it('V2 대사를 채팅 답의 고치기 목록으로 고쳐도 plannedTiming 은 그대로 남는다', () => {
    const [update] = validateWriterUpdates([{ type: 'updateShot', id: 'sh_02_07', patch: { dialogueLines: [v2Line] } }], new Set(['nurse'])) as Array<{ patch: { dialogueLines: Array<Record<string, unknown>> } }>
    expect(update.patch.dialogueLines[0]).toMatchObject({ text: 'Not now...', plannedTiming: '2.0-3.5s' })

    const manifest = {
      scenes: [{ sceneId: 'sc_02', narrativeSummary: '', originalTextQuote: '', location: 'corridor', timeOfDay: 'Night', mood: '', charactersPresent: ['nurse'], estimatedDurationSeconds: 5 }],
      characters: [{ characterId: 'nurse', name: 'The Nurse', role: 'protagonist', description: '', fixedPrompt: '', referenceImages: [] }],
      locations: [],
    } as unknown as SceneManifest
    const shot = { shotId: 'sh_02_07', sceneId: 'sc_02', shotType: 'CU', actionDescription: 'She strikes the glass.', characters: ['nurse'], durationSeconds: 5, generationMethod: 'T2V', dialogueLines: rows.shots[0].dialogue_lines } as unknown as Shot
    expect(serializeWriterScriptContext(manifest, [shot])).toContain('plannedTiming: 2.0-3.5s')
  })

  // 왜: 칸을 받아 주더라도 모양이 다른 값은 지금처럼 막는다(2026-11-01 리뷰 L6 — 이상한 값을 그대로 저장하지 않는다). 정상 경로 고정.
  it('plannedTiming 이 글이 아니면 지금처럼 고치기 전에 막는다', async () => {
    const r = resources()
    await r.dialogue.read()
    expect(() => r.dialogue.validate({ dialogueLines: [{ ...v2Line, plannedTiming: 3 }] })).toThrow(/character IDs/)
  })
})
