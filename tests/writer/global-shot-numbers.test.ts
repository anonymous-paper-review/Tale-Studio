// 샷 번호를 보드 카드와 같은 전체 번호(씬마다 다시 세지 않는 번호)로 채팅 · 멘션 · 도구 · 말풍선 · Artist · Editor · 내보내기에 똑같이 쓰는지 검사한다
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rows = vi.hoisted(() => ({
  shots: [] as Array<Record<string, unknown>>,
  scenes: [] as Array<Record<string, unknown>>,
  characters: [{ character_id: 'min_ho', name: '민호' }] as Array<Record<string, unknown>>,
  locations: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => {
        const result = { data: (rows as Record<string, unknown>)[table] ?? [], error: null }
        const chain = { eq: () => chain, order: async () => result, then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) }
        return chain
      },
    }),
  }),
}))
vi.mock('@/lib/shots-cache', () => ({ loadShotsResult: async () => ({ data: rows.shots, error: null }), invalidateShots: async () => {} }))

import { writerSceneShotMentions, serializeWriterScriptContext } from '@/lib/script-lines'
import { boardShotLabels } from '@/lib/writer/board-summary'
import { scrubInternalIdsInProse } from '@/lib/display-names'
import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { useWriterStore } from '@/stores/writer-store'
import { collectProjectImages } from '@/features/editor/title-image-picker'
import { collectWriterBoardArtifacts } from '@/lib/export/writer-board'
import { STAGE_PLACEHOLDER } from '@/lib/constants'
import { translate } from '@/lib/i18n/translate'
import type { SceneManifest, Shot } from '@/types'

function shot(shotId: string, sceneId: string): Shot {
  return {
    shotId, sceneId, actionDescription: `${shotId} 행동`, shotType: 'MS', characters: ['min_ho'], durationSeconds: 4, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
  }
}
const manifest: SceneManifest = {
  scenes: [
    { sceneId: 'sc_01', narrativeSummary: '', originalTextQuote: '', location: 'corridor', timeOfDay: '밤', mood: '', charactersPresent: [], estimatedDurationSeconds: 8 },
    { sceneId: 'sc_02', narrativeSummary: '', originalTextQuote: '', location: 'corridor', timeOfDay: '밤', mood: '', charactersPresent: [], estimatedDurationSeconds: 8 },
  ],
  characters: [{ characterId: 'min_ho', name: '민호', role: 'protagonist', description: '', fixedPrompt: '', referenceImages: [] }],
  locations: [],
}
// 씬1에 샷을 하나 더한 뒤의 순서 — 씬2 첫 샷(sh_02_03)은 보드에서 Shot 4, id 숫자(03)와 다르다.
const shots = [shot('sh_01_01', 'sc_01'), shot('sh_01_02', 'sc_01'), shot('sh_01_04', 'sc_01'), shot('sh_02_03', 'sc_02'), shot('sh_02_05', 'sc_02')]

beforeEach(() => {
  useWriterStore.setState({ sceneManifest: manifest, shots, error: null })
  rows.shots = shots.map((s, i) => ({ shot_id: s.shotId, scene_id: s.sceneId, shot_type: 'MS', action_description: s.actionDescription, action_description_native: s.actionDescription, characters: s.characters, duration_seconds: 4, dialogue_lines: [], sort_order: i, rough_storyboard: { url: `https://m/${s.shotId}.png`, status: 'completed' } }))
  rows.scenes = manifest.scenes.map((s, i) => ({ scene_id: s.sceneId, location: s.location, time_of_day: s.timeOfDay, mood: '', narrative_summary: '', original_text_quote: '', sort_order: i }))
})

describe('샷 번호는 보드와 같은 전체 번호', () => {
  // 왜: 오너 2026-11-02 "전체 번호로 통일" — 보드는 "Scene 2 · Shot 4"인데 멘션은 "Shot 2.1"이라 같은 샷을 다르게 불렀다.
  it('채팅 @멘션의 샷 이름은 보드 카드와 같은 전체 번호다', () => {
    const labels = writerSceneShotMentions(manifest, shots).map((m) => m.label)
    expect(labels).toEqual(['Scene 1', 'Scene 2', 'Shot 1', 'Shot 2', 'Shot 3', 'Shot 4', 'Shot 5'])
  })

  // 왜: 번호는 id 가 아니라 지금 순서에서 센다 — 샷을 더하거나 지우면 보드 카드처럼 다시 센다.
  it('샷을 더하거나 지우면 번호는 지금 순서로 다시 센다', () => {
    expect(boardShotLabels(manifest, shots).get('sh_02_03')).toBe('Scene 2 · Shot 4')
    expect(boardShotLabels(manifest, shots.filter((s) => s.shotId !== 'sh_01_02')).get('sh_02_03')).toBe('Scene 2 · Shot 3')
  })

  // 왜: "샷 8 고쳐줘"가 씬 안 순서로 풀리거나 모델이 "Scene 2 · Shot 3"처럼 씬 안 번호로 답했다 — 목록에 전체 번호를 붙이고 그 번호로 찾고 답하게 한다.
  it('채팅 모델에 보내는 샷 목록에 보드 전체 번호가 붙고, 그 번호로 찾고 답하라고 알린다', () => {
    const context = serializeWriterScriptContext(manifest, shots)
    expect(context).toMatch(/sh_02_03 \(Scene 2 · Shot 4\)/)
    expect(context).toContain('전체 번호')
    expect(context).not.toContain('씬N의 M번째 샷')
    const route = readFileSync('src/app/api/writer/chat/route.ts', 'utf8')
    expect(route).toContain('<shot-numbers>')
  })

  // 왜: 2026-11-02 리뷰 L5 — 한국어 대사 이어 쓰기는 씬 하나만 담은 목록을 보내 "Scene 1 · Shot 1"처럼 그 씬 안에서 다시 셌다.
  //   <shot-numbers> 규칙(보드 전체 번호)과 어긋난다 — 번호는 보드 전체에서 센다.
  it('한국어 대사 이어 쓰기에 보내는 샷 목록도 보드 전체 번호다', () => {
    const oneScene = { ...manifest, scenes: manifest.scenes.filter((s) => s.sceneId === 'sc_02') }
    const context = serializeWriterScriptContext(oneScene, shots.filter((s) => s.sceneId === 'sc_02'), undefined, { manifest, shots })
    expect(context).toMatch(/sh_02_03 \(Scene 2 · Shot 4\)/)
    expect(context).toContain('(씬2)')
    const store = readFileSync('src/stores/global-chat-store.ts', 'utf8')
    expect(store).toMatch(/serializeWriterScriptContext\(manifest, shots, buildScriptLines\(manifest, shots\), \{ manifest: writer\.sceneManifest, shots: writer\.shots \}\)/)
  })

  // 왜: 도구로 읽은 샷에도 같은 이름이 있어야 모델이 고친 샷을 보드 번호로 말한다.
  it('채팅 도구로 읽은 샷에 보드 전체 번호(boardLabel)가 붙는다', async () => {
    const r = createStudioToolResources({ stage: 'writer', projectId: 'p', traceId: 't', signal: new AbortController().signal, isCurrent: () => true })
    const records = await r.shots.read()
    expect(records.find((rec) => rec.id === 'sh_02_03')?.values.boardLabel).toBe('Scene 2 · Shot 4')
  })

  // 왜: 말풍선 · 실행 결과 · 승인 카드는 저장된 글 속 샷 id(sh_02_03)를 그릴 때 이름으로 바꾼다 — id 숫자로 바꾸면 보드와 어긋난다(Shot 3 ≠ Shot 4).
  it('채팅 말풍선 · 실행 결과 · 승인 카드에 나오는 샷 id는 지금 보드의 전체 번호로 보인다', () => {
    expect(scrubInternalIdsInProse('sh_02_03 저장 확인', undefined, boardShotLabels(manifest, shots))).toBe('Scene 2 · Shot 4 저장 확인')
    const chat = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(chat).toMatch(/scrubInternalIdsInProse\(text, scrubNameById, shotLabelById\)/)
  })

  // 왜: Artist 는 "S1-2"(씬 안 번호), Editor 제목 그림은 내부 id(sh_01_02)를 그대로 보였다.
  it('Artist 인물 · 배경 팝업의 나오는 샷과 Editor 제목 그림 고르기의 러프 그림 이름도 보드 전체 번호다', () => {
    const labeled = shots.map((s) => ({ ...s, boardLabel: boardShotLabels(manifest, shots).get(s.shotId), roughStoryboard: { status: 'completed', frames: { start: `https://m/${s.shotId}.png` } } }))
    const options = collectProjectImages({ projectId: 'p', characters: {}, worlds: {}, shots: labeled })
    expect(options.find((o) => o.id === 'rough:sh_02_03')?.label).toBe('Scene 2 · Shot 4')
    for (const file of ['src/features/artist/character-view-dialog.tsx', 'src/features/artist/world-view-dialog.tsx']) {
      const src = readFileSync(file, 'utf8')
      expect(src).toContain('boardShotLabels(')
      expect(src).not.toContain('sceneShotLabel(')
    }
  })

  // 왜: Storyboard 내보내기(트리트먼트 · 보드 한 장 · 그림 파일 이름)도 씬마다 1부터 셌고 파일 이름에 내부 id 가 들어갔다.
  it('Storyboard 내보내기의 샷 번호도 보드 전체 번호이고 파일 이름에 내부 id가 없다', async () => {
    const files = await collectWriterBoardArtifacts('p', 'ko')
    const treatment = files.find((f) => f.path === 'writer/treatment.md')
    expect(treatment && 'content' in treatment ? treatment.content : '').toContain('### Shot 4')
    const names = files.filter((f) => f.path.startsWith('writer/rough-storyboard/')).map((f) => f.path)
    expect(names).toContain('writer/rough-storyboard/scene-02_shot-04.png')
    expect(names.join(' ')).not.toMatch(/sh_\d/)
  })

  // 왜: 입력칸 예시 "씬2 샷3"이 씬 안 번호를 가르쳤다.
  it('채팅 입력칸 예시는 "샷 8"처럼 전체 번호로 쓴다', () => {
    expect(translate('ko', STAGE_PLACEHOLDER.writer)).toContain('샷 8')
    expect(translate('ko', STAGE_PLACEHOLDER.writer)).not.toContain('씬2 샷3')
    expect(translate('en', STAGE_PLACEHOLDER.writer)).toContain('shot 8')
  })
})
