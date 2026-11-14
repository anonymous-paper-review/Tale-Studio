// 채팅의 씬 · 샷 이름(@멘션 · 말풍선 · Lumi 에게 보내는 목록과 프롬프트)이 그 글의 언어를 따르고, 사용자가 치는 이름은 두 말 모두 알아듣는지 검사한다 (오너 2026-11-14 답 7)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { backgroundMentions, castMentions, sceneShotMentions } from '@/lib/card-mention'
import { writerSceneShotMentions, serializeWriterScriptContext } from '@/lib/script-lines'
import { scrubInternalIdsInProse } from '@/lib/display-names'
import { boardShotLabels } from '@/lib/writer/board-summary'
import { boardNodeNames, directorMentionTargets } from '@/features/director/node-label'
import { resolveChatShotRef } from '@/lib/writer/chat-id-resolve'
import { mentionedShotNumbers } from '@/lib/director/chat-video-targets'
import { directorShotRefs } from '@/lib/director/lumi-chat-runs'
import { serializeDirectorCanvasContext } from '@/stores/director-store'
import { CHAT_OUTPUT_FORMAT_GUIDE } from '@/lib/chat-format'
import type { DirectorNode } from '@/types/director'
import type { SceneManifest, Shot } from '@/types'

const read = (file: string) => readFileSync(file, 'utf8')
const HANGUL = /[가-힣]/

// 보드: 씬 1(sc_01) = 샷 1 · 2, 씬 2(sc_02) = 샷 3 · 4 — 샷 id 숫자(sh_02_01)와 보드 번호(샷 3)가 다르다.
const manifest = { scenes: [{ sceneId: 'sc_01' }, { sceneId: 'sc_02' }] }
const boardShots = [
  { shotId: 'sh_01_01', sceneId: 'sc_01' },
  { shotId: 'sh_01_02', sceneId: 'sc_01' },
  { shotId: 'sh_02_01', sceneId: 'sc_02' },
  { shotId: 'sh_02_02', sceneId: 'sc_02' },
]
function writerShot(shotId: string, sceneId: string): Shot {
  return {
    shotId, sceneId, actionDescription: `${shotId} 행동`, shotType: 'MS', characters: [], durationSeconds: 4, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
  }
}
const writerManifest: SceneManifest = {
  scenes: manifest.scenes.map((s) => ({ sceneId: s.sceneId, narrativeSummary: '', originalTextQuote: '', location: '골목', timeOfDay: '밤', mood: '', charactersPresent: [], estimatedDurationSeconds: 8 })),
  characters: [], locations: [],
}
const writerShots = boardShots.map((s) => writerShot(s.shotId, s.sceneId))
function sceneNode(id: string, writerSceneId: string): DirectorNode {
  return { id, type: 'scene', position: { x: 0, y: 0 }, data: { kind: 'scene', label: writerSceneId, writerSceneId, location: '', timeOfDay: '', mood: '', description: '' } } as unknown as DirectorNode
}
function shotNode(id: string, writerShotId: string, parentSceneNodeId: string): DirectorNode {
  return {
    id, type: 'shot', position: { x: 0, y: 0 },
    data: {
      kind: 'shot', label: writerShotId, writerShotId, parentSceneNodeId, prompt: 'p', referenceImages: [], imageInputs: [], storyboardImage: null, characterAssetIds: [], worldAssetIds: [],
      camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 }, cameraPreset: {}, provider: 'seedance', durationSeconds: 4, generationMethod: 'I2V',
    },
  } as unknown as DirectorNode
}
const nodes = [sceneNode('s1', 'sc_01'), sceneNode('s2', 'sc_02'), shotNode('n1', 'sh_01_01', 's1'), shotNode('n3', 'sh_02_01', 's2')]

describe('같이 정한 것 — 채팅의 씬 · 샷 이름도 화면 언어 (오너 2026-11-14 답 7)', () => {
  // 왜: 답 7 "전역" — @멘션 고르기 목록은 카드와 같은 이름이어야 고를 때 헷갈리지 않는다. Director 는 보기 단추 이름(러프 · 실사)을 앞에 붙인다.
  it('한국어 화면이면 @멘션 목록의 씬 · 샷 이름이 "씬 1" · "샷 3" · "실사 샷 3" · "러프 샷 3"이다', () => {
    expect(writerSceneShotMentions(writerManifest, writerShots, 'ko').map((m) => [m.label, m.hint])).toEqual([
      ['씬 1', '씬'], ['씬 2', '씬'], ['샷 1', '샷'], ['샷 2', '샷'], ['샷 3', '샷'], ['샷 4', '샷'],
    ])
    const targets = directorMentionTargets(nodes, boardNodeNames(manifest, boardShots, 'ko'))
    expect(sceneShotMentions(targets, 'real', 'ko').map((m) => [m.label, m.hint])).toEqual([
      ['실사 씬 1', '실사 씬'], ['실사 씬 2', '실사 씬'], ['실사 샷 1', '실사 샷'], ['실사 샷 3', '실사 샷'],
    ])
    expect(sceneShotMentions(targets, 'previz', 'ko').map((m) => m.label)).toEqual(['러프 씬 1', '러프 씬 2', '러프 샷 1', '러프 샷 3'])
    // 고르기 목록은 화면 언어(UI)로 짓는다 — 카드 이름과 같은 말.
    const chat = read('src/components/layout/global-chat.tsx')
    expect(chat).toMatch(/writerSceneShotMentions\(writerManifest, writerShots, locale\)/)
    expect(chat).toMatch(/boardNodeNames\(writerManifest, writerShots, locale\)/)
    expect(chat).toMatch(/sceneShotMentions\(targets, 'previz', locale\)/)
    expect(chat).toMatch(/sceneShotMentions\(targets, 'real', locale\)/)
  })

  // 왜: 답 7 — 영어 화면에는 한국어가 나오지 않는다. 이름 없는 카드의 @멘션도 영어 화면에서는 카드에 보이는 영어 이름("Unnamed person")이다(리드 11/14).
  it('영어 화면이면 @멘션 목록은 "Scene 1" · "Shot 3" · "Real Shot 3" · "Previz Shot 3"이고 이름 없는 카드도 영어라 한국어가 없다', () => {
    const writer = writerSceneShotMentions(writerManifest, writerShots, 'en')
    expect(writer.map((m) => m.label)).toEqual(['Scene 1', 'Scene 2', 'Shot 1', 'Shot 2', 'Shot 3', 'Shot 4'])
    const targets = directorMentionTargets(nodes, boardNodeNames(manifest, boardShots, 'en'))
    expect(sceneShotMentions(targets, 'real', 'en').map((m) => m.label)).toEqual(['Real Scene 1', 'Real Scene 2', 'Real Shot 1', 'Real Shot 3'])
    expect(sceneShotMentions(targets, 'previz', 'en').map((m) => m.label)).toContain('Previz Shot 3')
    const cast = castMentions([{ localId: 'p1' }, { localId: 'p2', name: ' ' }, { localId: 'o1', entityType: 'object' }, { localId: 'c1', name: '카르타' }], 'en')
    expect(cast.map((m) => m.label)).toEqual(['Unnamed person', 'Unnamed person 2', 'Unnamed object', '카르타'])
    expect(backgroundMentions([{ localId: 'b1' }, { localId: 'b2' }], 'en').map((m) => m.label)).toEqual(['Unnamed background', 'Unnamed background 2'])
    const all = [...writer, ...sceneShotMentions(targets, 'real', 'en'), ...sceneShotMentions(targets, 'previz', 'en'), ...cast.slice(0, 3), ...backgroundMentions([{ localId: 'b1' }], 'en')]
    for (const m of all) {
      expect(m.label).not.toMatch(HANGUL)
      expect(m.hint).not.toMatch(HANGUL)
    }
  })
})

describe('혼자 정한 것', () => {
  // 왜: 한국어 화면에서 이름 없는 카드의 @멘션은 예전 그대로다(정상 경로 고정) — 그리고 Producer 채팅 모델은 두 말 이름을 모두 받아, 화면 언어를 바꾸기 전에 넣은 @멘션도 찾는다.
  it('이름 없는 인물 · 배경 카드의 @멘션은 한국어 화면에서 "이름 미정 인물"이고 Producer 채팅 모델은 두 말 이름을 모두 받는다', () => {
    expect(castMentions([{ localId: 'p1' }, { localId: 'p2' }, { localId: 'o1', entityType: 'object' }], 'ko').map((m) => m.label)).toEqual(['이름 미정 인물', '이름 미정 인물 2', '이름 미정 사물'])
    expect(backgroundMentions([{ localId: 'b1' }], 'ko').map((m) => m.label)).toEqual(['이름 미정 배경'])
    const route = read('src/app/api/produce/chat/route.ts')
    expect(route).toMatch(/castMentions\(castList, 'ko'\)/)
    expect(route).toMatch(/castMentions\(castList, 'en'\)/)
    expect(route).toMatch(/backgroundMentions\(bgList, 'ko'\)/)
    expect(route).toMatch(/backgroundMentions\(bgList, 'en'\)/)
    expect(read('src/app/api/produce/chat/system-prompt.ts')).toContain('@Unnamed person')
  })

  // 왜: 한 문장 안에서 말이 섞이지 않게 — 채팅 줄 · 말풍선 · Lumi 에게 보내는 목록의 이름은 채팅 언어(잠긴 프로젝트는 프로젝트 언어)로 짓는다.
  //   영어로 잠긴 프로젝트를 한국어 화면에서 열면 카드는 "샷 3", 채팅 문장 속은 "Shot 3"이다.
  it('채팅 줄 · 말풍선 · Lumi 에게 보내는 목록의 씬 · 샷 이름은 채팅 언어로 짓는다', () => {
    const store = read('src/stores/global-chat-store.ts')
    expect(store).toMatch(/function directorBoardNames\(locale: AppLocale\)/)
    expect(store).not.toMatch(/directorBoardNames\(\)/)
    expect(store).toMatch(/serializeDirectorCanvasContext\(canvasState, boardNodeNames\(writerBoard\.sceneManifest, writerBoard\.shots, contentLocale\(\)\)/)
    expect(store).toMatch(/serializeWriterScriptContext\(\s*writerState\.sceneManifest,\s*writerState\.shots,\s*contentLocale\(\),/)
    expect(read('src/stores/chat-tool-bindings.ts')).toMatch(/boardShotLabels\(writer\.sceneManifest, writer\.shots, contentLocale\(\)\)/)
    const chat = read('src/components/layout/global-chat.tsx')
    expect(chat).toMatch(/boardShotLabels\(writerManifest, writerShots, chatLocale\)/)
    expect(chat).toMatch(/scrubInternalIdsInProse\(text, chatLocale, scrubNameById, shotLabelById\)/)
  })

  // 왜: 말풍선 속에 새어 나온 내부 id(sh_02_07)는 그릴 때 이름으로 바꾼다 — 그 이름은 지금 채팅 언어다. 저장된 글 속 영어 이름("Scene 2 · Shot 8")은 그대로 둔다(옛 줄을 고쳐 보이지 않음).
  it('말풍선 속 내부 id 는 지금 채팅 언어의 보드 이름으로 보이고 저장된 글의 영어 이름은 그대로 둔다', () => {
    expect(scrubInternalIdsInProse('sh_02_07 의 구도를 sc_04 톤에 맞췄어요.', 'ko')).toBe('씬 2 · 샷 7 의 구도를 씬 4 톤에 맞췄어요.')
    expect(scrubInternalIdsInProse('sh_02_01 저장 확인', 'ko', undefined, boardShotLabels(manifest, boardShots, 'ko'))).toBe('씬 2 · 샷 3 저장 확인')
    expect(scrubInternalIdsInProse('I matched sh_02_01 to the mood.', 'en', undefined, boardShotLabels(manifest, boardShots, 'en'))).toBe('I matched Scene 2 · Shot 3 to the mood.')
    expect(scrubInternalIdsInProse('Scene 2 · Shot 8 을 고쳤어요.', 'ko')).toBe('Scene 2 · Shot 8 을 고쳤어요.')
  })

  // 왜: 사용자는 화면 언어와 상관없이 두 말 어느 쪽으로든 부른다(언어를 바꾸기 전 버릇 · 복사한 이름). Writer 채팅 고치기는 모델이 낸 이름도 이 규칙으로 풀어 본다.
  it('사용자가 "샷 3" · "Shot 3" · "씬 2 · 샷 3" · "Scene 2 · Shot 3"으로 부르면 화면 언어와 상관없이 같은 샷이다', () => {
    for (const said of ['샷 3', 'Shot 3', '씬 2 · 샷 3', 'Scene 2 · Shot 3', '씬2 샷3']) {
      expect(resolveChatShotRef(boardShots, said, { manifest }), said).toEqual({ kind: 'shot', shotId: 'sh_02_01' })
    }
  })

  // 왜: 지우기는 되돌릴 수 없어 정확한 id 나 보드 이름으로만 찾는다 — 지금은 영어 보드 이름만 받아, 한국어 대화에서 모델이 "씬 2 · 샷 3"을 지우라고 하면 못 찾았다.
  it('Writer 채팅의 샷 지우기는 한국어 보드 이름 "씬 2 · 샷 3"으로도 그 샷을 찾는다', () => {
    expect(resolveChatShotRef(boardShots, '씬 2 · 샷 3', { manifest, strict: true })).toEqual({ kind: 'shot', shotId: 'sh_02_01' })
    expect(resolveChatShotRef(boardShots, 'Scene 2 · Shot 3', { manifest, strict: true })).toEqual({ kind: 'shot', shotId: 'sh_02_01' })
    // 씬이 맞지 않는 보드 이름은 찾지 않는다(지우기는 엄격).
    expect(resolveChatShotRef(boardShots, '씬 1 · 샷 3', { manifest, strict: true })).toBeNull()
  })

  // 왜: 한국어 화면의 @멘션은 "@실사 샷 3" · "@러프 샷 3"이다 — 영상 부탁을 읽는 쪽이 이것을 샷 3 으로 읽어야 바로 만들 수 있다.
  it('Director 영상 부탁의 "@실사 샷 3" · "@러프 샷 3" · "@Real Shot 3"은 샷 3 이다', () => {
    expect([...mentionedShotNumbers('@실사 샷 3 영상 만들어 줘')]).toEqual([3])
    expect([...mentionedShotNumbers('@러프 샷 3 영상 다시 만들어 줘')]).toEqual([3])
    expect([...mentionedShotNumbers('@Real Shot 3 make the video')]).toEqual([3])
  })

  // 왜: Lumi 실행 줄은 화면 이름을 /^(?:Shot|Scene) (\d+)$/ 로 다시 읽어 보드 번호를 얻었다 — 이름이 "샷 3"이 되면 번호를 잃는다.
  it('Lumi 실행 줄의 샷 번호는 이름의 말과 상관없이 보드 번호다', () => {
    for (const locale of ['ko', 'en'] as const) {
      expect(directorShotRefs(nodes, boardNodeNames(manifest, boardShots, locale)).map((ref) => [ref.nodeId, ref.shotNo])).toEqual([['n1', 1], ['n3', 3]])
    }
  })

  // 왜: Lumi 는 목록에 적힌 이름을 따라 답한다 — 목록이 영어면 한국어 답 속에도 "Scene 2 · Shot 3"이 섞였다. 목록을 채팅 언어로 싣는다.
  it('Lumi 에게 보내는 Director 캔버스 목록과 Writer 대본 목록의 보드 이름은 채팅 언어다', () => {
    const state = { nodes, edges: [], selectedNodeId: null }
    expect(serializeDirectorCanvasContext(state, boardNodeNames(manifest, boardShots, 'ko'))).toContain('Shot "sh_02_01" (board: 씬 2 · 샷 3)')
    expect(serializeDirectorCanvasContext(state, boardNodeNames(manifest, boardShots, 'en'))).toContain('Shot "sh_02_01" (board: Scene 2 · Shot 3)')
    expect(serializeWriterScriptContext(writerManifest, writerShots, 'ko')).toMatch(/sh_02_01 \(씬 2 · 샷 3\)/)
    expect(serializeWriterScriptContext(writerManifest, writerShots, 'en')).toMatch(/sh_02_01 \(Scene 2 · Shot 3\)/)
  })

  // 왜: 모든 단계가 함께 쓰는 답 규칙이 "한국어 응답에서도 이 영문 표기를 그대로 쓴다"고 가르쳤다(8/26 단일형). 이제는 목록에 적힌 보드 이름 그대로 —
  //   그리고 사용자가 어느 말로 불러도 같은 샷이라고 알린다.
  it('Lumi 프롬프트는 보드 이름을 목록에 적힌 그대로 쓰라고 하고 한국어 대화에서 영문 표기를 쓰라고 하지 않는다', () => {
    expect(CHAT_OUTPUT_FORMAT_GUIDE).not.toContain('영문 표기를 그대로')
    expect(CHAT_OUTPUT_FORMAT_GUIDE).toContain('씬 2 · 샷 8')
    expect(CHAT_OUTPUT_FORMAT_GUIDE).toContain('Scene 2 · Shot 8')
    const director = read('src/app/api/director/chat/route.ts')
    expect(director).toContain('"@실사 샷 8"')
    expect(director).toContain('"@러프 샷 8"')
    expect(director).toMatch(/written in the conversation language/)
    const canvas = serializeDirectorCanvasContext({ nodes, edges: [], selectedNodeId: null }, boardNodeNames(manifest, boardShots, 'ko'))
    expect(canvas).toContain('"@실사 샷 8"')
    expect(canvas).toContain('"샷 8"')
    expect(read('src/app/api/writer/chat/route.ts')).toMatch(/written in the conversation language/)
    expect(read('src/lib/chat-tools/protocol.ts')).toMatch(/written in the conversation language/)
    expect(serializeWriterScriptContext(writerManifest, writerShots, 'ko')).toContain('"씬 2 · 샷 8"')
  })

  // 왜: Writer 채팅이 "어느 샷인지" 되묻는 문장은 화면 언어로 쓰인다 — 그 안의 두 샷 이름도 같은 말이어야 한다.
  it('Writer 채팅이 되묻는 두 샷 이름도 그 문장의 언어다', () => {
    expect(read('src/stores/writer-store.ts')).toMatch(/const labels = boardShotLabels\(boardBefore\.manifest, boardBefore\.shots, locale\)/)
  })
})
