// 씬 · 샷 이름이 화면 언어를 따르는지 검사한다 — 한국어 화면은 "씬 2 · 샷 8", 영어 화면은 "Scene 2 · Shot 8" (오너 2026-11-14 답 7, 8/26 단일형을 바꿈)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pipelineLocationName, sceneName, sceneShotName, shotName } from '@/lib/board-names'
import { boardShotLabels, directorConfirmView, directorHandoffSummary, type DirectorConfirmExtra } from '@/lib/writer/board-summary'
import { boardNodeNames, directorFullLabel, directorNodeLabel, prettyNodeLabel } from '@/features/director/node-label'
import { editorHandoverView } from '@/lib/director/editor-handover'
import { classifyDirectorReadiness } from '@/lib/director-readiness'
import { sceneShotLabel } from '@/lib/writer/shot-edit'
import { collectDirectorArtifacts, type DirectorExportData } from '@/lib/export/director'
import { KO } from '@/lib/i18n/messages-ko'
import { translate } from '@/lib/i18n/translate'
import type { DirectorNode } from '@/types/director'

const read = (file: string) => readFileSync(file, 'utf8')
const HANGUL = /[가-힣]/

// 씬 2 를 나중에 끼워 넣은 보드 — 보드: 씬 1(sc_01) = 샷 1 · 2, 씬 2(sc_03) = 샷 3, 씬 3(sc_02) = 샷 4. id 숫자와 보드 번호가 다르다.
const manifest = { scenes: [{ sceneId: 'sc_01' }, { sceneId: 'sc_03' }, { sceneId: 'sc_02' }] }
const writerShots = [
  { shotId: 'sh_01_01', sceneId: 'sc_01' },
  { shotId: 'sh_01_04', sceneId: 'sc_01' },
  { shotId: 'sh_03_05', sceneId: 'sc_03' },
  { shotId: 'sh_02_02', sceneId: 'sc_02' },
]
const shotData = (writerShotId: string | null, label = writerShotId ?? 'New Shot') => ({ kind: 'shot', label, writerShotId }) as never
const sceneData = (writerSceneId: string | null, label = writerSceneId ?? 'New Scene') => ({ kind: 'scene', label, writerSceneId }) as never
function shotNode(writerShotId: string): DirectorNode {
  return {
    id: `n_${writerShotId}`, type: 'shot', position: { x: 0, y: 0 },
    data: { kind: 'shot', label: writerShotId, writerShotId, durationSeconds: 3, storyboardImage: null },
  } as unknown as DirectorNode
}
const boardShot = (shotId: string, sceneId: string, drawn: boolean) => ({
  shotId, sceneId, durationSeconds: 3, actionDescription: `${shotId} 행동`,
  roughStoryboard: drawn ? { status: 'completed', url: `https://m/${shotId}.png`, errorMessage: null, generatedAt: 1 } : null,
}) as never
const extra: DirectorConfirmExtra = { characters: 1, backgrounds: 1, imagesToMake: 0, takesPerShot: 5 }

describe('같이 정한 것 — 씬 · 샷 이름은 화면 언어를 따른다 (오너 2026-11-14 답 7)', () => {
  // 왜: 오너 11/14 답 7 "언어가 한국어일 때는 한국어로 영어일 때는 영어로 해줘. 이 규칙은 전역으로" — 8/26 의 단일형(로케일 무관 "Scene 2 · Shot 8")을 바꿨다. 정상 경로 고정.
  it('한국어 화면이면 씬 · 샷 이름이 "씬 2" · "샷 8" · "씬 2 · 샷 8"로 보인다', () => {
    expect(sceneName('ko', 2)).toBe('씬 2')
    expect(shotName('ko', 8)).toBe('샷 8')
    expect(sceneShotName('ko', 2, 8)).toBe('씬 2 · 샷 8')
    const names = boardNodeNames(manifest, writerShots, 'ko')
    expect(directorNodeLabel(shotData('sh_02_02'), names)).toBe('샷 4')
    expect(directorNodeLabel(sceneData('sc_03'), names)).toBe('씬 2')
    expect(directorFullLabel(shotData('sh_02_02'), names)).toBe('씬 3 · 샷 4')
    expect(boardShotLabels(manifest, writerShots, 'ko').get('sh_03_05')).toBe('씬 2 · 샷 3')
    expect(prettyNodeLabel('sh_02_07', 'ko')).toBe('샷 7')
    expect(prettyNodeLabel('sc_04', 'ko')).toBe('씬 4')
  })

  // 왜: 같은 답 — 영어 화면은 지금 이름 그대로다. 정상 경로 고정.
  it('영어 화면이면 씬 · 샷 이름이 "Scene 2" · "Shot 8" · "Scene 2 · Shot 8"로 보인다', () => {
    expect(sceneName('en', 2)).toBe('Scene 2')
    expect(shotName('en', 8)).toBe('Shot 8')
    expect(sceneShotName('en', 2, 8)).toBe('Scene 2 · Shot 8')
    const names = boardNodeNames(manifest, writerShots, 'en')
    expect(directorNodeLabel(shotData('sh_02_02'), names)).toBe('Shot 4')
    expect(directorNodeLabel(sceneData('sc_03'), names)).toBe('Scene 2')
    expect(directorFullLabel(shotData('sh_02_02'), names)).toBe('Scene 3 · Shot 4')
    expect(boardShotLabels(manifest, writerShots, 'en').get('sh_03_05')).toBe('Scene 2 · Shot 3')
    expect(prettyNodeLabel('sh_02_07', 'en')).toBe('Shot 7')
  })

  // 왜: 답 7 "전역" — Storyboard 의 씬 머리 · 카드 · 그리는 중 카드 · 고치기 창 · 연출 화살표 창 · 대사 탭 · 더하기 창이 이름을 "Scene {n}"처럼 손으로 박아
  //   한국어 화면에도 영어가 보였다. 이름은 한 곳(board-names)에서 화면 언어로 짓는다.
  it('한국어 화면이면 Storyboard 의 씬 머리 · 카드 · 고치기 창 · 연출 화살표 창 · 대사 탭 · 더하기 창도 한국어 이름을 쓴다', () => {
    expect(sceneShotLabel(manifest, writerShots, 'sh_03_05', 'ko')).toBe('씬 2 · 샷 3')
    for (const file of [
      'src/features/writer/rough-storyboard-view.tsx',
      'src/features/writer/shot-detail-dialog.tsx',
      'src/features/writer/dialogue-view.tsx',
      'src/features/writer/add-item-dialog.tsx',
      'src/features/writer/storyboard-shot-dialog.tsx',
    ]) {
      const src = read(file)
      expect(src, file).not.toMatch(/>\s*(Scene|Shot) \{/)
      expect(src, file).not.toMatch(/`(Scene|Shot) \$\{/)
      expect(src, file).not.toMatch(/'(Scene|Shot) \$1'/)
    }
  })

  // 왜: 답 7 — Director 격자 · 노드 · 영상 카드 · 상세 머리 · 지우기 창 · 그림 받기 파일 이름은 모두 보드 이름표 하나(useBoardNodeNames)를 쓴다 — 그 이름표가 화면 언어로 지어야 다 같이 바뀐다.
  it('한국어 화면이면 Director 격자 · 노드 · 영상 카드 · 상세 머리 · 지우기 창 · 그림 받기 파일 이름도 한국어 이름을 쓴다', () => {
    const hook = read('src/features/director/hooks/use-board-node-names.ts')
    expect(hook).toContain('useLocaleStore((s) => s.locale)')
    expect(hook).toMatch(/boardNodeNames\(manifest, shots \?\? \[\], locale\)/)
    for (const file of [
      'src/features/director/canvas-views/StoryboardGridView.tsx',
      'src/features/director/canvas-nodes/ShotNode.tsx',
      'src/features/director/canvas-nodes/VideoNode.tsx',
      'src/features/director/canvas-popups/CanvasContextMenu.tsx',
      'src/features/director/canvas-popups/DeleteConfirmModal.tsx',
      'src/features/director/canvas-popups/DirectorNodePopup.tsx',
      'src/features/director/shot-detail/director-shot-detail.tsx',
    ]) {
      expect(read(file), file).toContain('useBoardNodeNames()')
    }
    // 노드 머리(BaseNode)는 남은 원래 id(take_v1 · sh_02_07)를 이름으로 바꿀 때도 화면 언어로 짓는다.
    expect(read('src/features/director/canvas-nodes/BaseNode.tsx')).toMatch(/prettyNodeLabel\(title, locale\)/)
    // 그림 받기 파일 이름은 카드 이름 그대로 — 한국어 이름의 한글은 지우지 않는다.
    expect('샷 8'.replace(/[^\w가-힣-]+/g, '_')).toBe('샷_8') // i18n-ok: 시험 값
    expect(read('src/features/director/canvas-popups/CanvasContextMenu.tsx')).toMatch(/directorNodeLabel\(node\.data, boardNames\)\.replace\(\/\[\^\\w가-힣-\]\+\/g, '_'\)/)
  })

  // 왜: 답 7 — 두 넘기기 창(Storyboard → Director 의 러프 없는 샷 경고, Director → Editor 의 영상 없는 샷 줄)과 Director 준비 창이 한국어 화면에도 "Scene 1 · Shot 2"를 보였다.
  it('한국어 화면이면 두 넘기기 창과 Director 준비 창이 샷 이름을 한국어로 보인다', () => {
    const board = [boardShot('sh_01_01', 'sc_01', true), boardShot('sh_01_04', 'sc_01', false), boardShot('sh_03_05', 'sc_03', true), boardShot('sh_02_02', 'sc_02', true)]
    expect(directorConfirmView(directorHandoffSummary(manifest, board), 'ko', extra).warning).toBe('러프가 없는 씬 1 · 샷 2은(는) 이번에 빠져요.')
    expect(directorConfirmView(directorHandoffSummary(manifest, board), 'en', extra).warning).toBe('These shots have no rough and are left out this time: Scene 1 · Shot 2.')
    const nodes = writerShots.map((s) => shotNode(s.shotId))
    expect(editorHandoverView(nodes, boardNodeNames(manifest, writerShots, 'ko')).missing.map((row) => row.label)).toEqual(['씬 1 · 샷 1', '씬 1 · 샷 2', '씬 2 · 샷 3', '씬 3 · 샷 4'])
    expect(read('src/components/handoff/editor-handover-dialog.tsx')).toMatch(/boardNodeNames\(manifest, writerShots \?\? \[\], locale\)/)
    const readiness = classifyDirectorReadiness({
      scenes: [{ sceneId: 'sc_1', sortOrder: 0, locationId: null, timeOfDay: '낮' }],
      shots: [{ shotId: 'sh_1', sceneId: 'sc_1', sortOrder: 0, description: '', characterIds: [], locationIds: [], rough: null }],
      characters: [], locations: [],
    })
    expect(readiness.scenes[0].shots[0].shotNo).toBe(1)
    const dialog = read('src/components/handoff/director-readiness-dialog.tsx')
    expect(dialog).toContain("t('Scene {n}', { n: scene.sceneNumber })")
    expect(dialog).toMatch(/t\('Shot \{n\}', \{ n: shot\.shotNo \?\? '\?' \}\)/)
  })

  // 왜: 답 7 — Artist 인물 · 배경 창의 "나오는 샷"과 Editor 제목 그림 고르기의 러프 이름도 같은 이름표를 화면 언어로 쓴다.
  it('한국어 화면이면 Artist 의 나오는 샷과 Editor 제목 그림의 러프 이름이 한국어다', () => {
    for (const file of ['src/features/artist/character-view-dialog.tsx', 'src/features/artist/world-view-dialog.tsx']) {
      expect(read(file), file).toMatch(/boardShotLabels\(sceneManifest, shots, locale\)/)
    }
    expect(read('src/features/editor/title-image-picker.tsx')).toMatch(/boardShotLabels\(sceneManifest, writerShots, locale\)/)
  })

  // 왜: 답 7 — 영어 화면에는 한국어 씬 · 샷 이름이 나오지 않는다(오너 "영어를 쓰는 유저는 한국어가 나오면 당황스러울거야").
  it('영어 화면에는 한국어 씬 · 샷 이름이 나오지 않는다', () => {
    const names = boardNodeNames(manifest, writerShots, 'en')
    const labels = [
      ...[...boardShotLabels(manifest, writerShots, 'en').values()],
      ...writerShots.map((s) => directorFullLabel(shotData(s.shotId), names)),
      ...manifest.scenes.map((s) => directorNodeLabel(sceneData(s.sceneId), names)),
      prettyNodeLabel('New Shot', 'en'), prettyNodeLabel('New Scene', 'en'), prettyNodeLabel('take_v2', 'en'),
    ]
    for (const label of labels) expect(label).not.toMatch(HANGUL)
  })
})

describe('혼자 정한 것', () => {
  // 왜: 사람이 지은 이름("river_gaze", 사람이 적은 "Shot 1")은 사람이 쓴 글이라 바꾸지 않는다 — 앱이 지은 이름(보드 번호 · 기본 이름)만 화면 언어로 짓는다.
  it('사람이 지은 노드 이름은 화면 언어로 바꾸지 않는다', () => {
    const names = boardNodeNames(manifest, writerShots, 'ko')
    expect(directorNodeLabel(shotData('sh_02_02', 'river_gaze'), names)).toBe('river_gaze')
    expect(directorNodeLabel(shotData('w-1', 'Shot 1'), names)).toBe('Shot 1')
    expect(directorNodeLabel(sceneData(null, 'Opening'), names)).toBe('Opening')
  })

  // 왜: Director 에서 만든 노드는 DB 에 기본 이름 "New Shot" · "New Scene"으로 저장된다 — 한국어 화면에 영어가 보였다. DB 는 그대로 두고 보일 때만 바꾼다.
  it('Director 에서 새로 만든 노드의 기본 이름은 한국어 화면에서 "새 샷" · "새 씬"으로 보이고 영어 화면은 그대로다', () => {
    const ko = boardNodeNames(manifest, writerShots, 'ko')
    expect(directorNodeLabel(shotData(null), ko)).toBe('새 샷')
    expect(directorNodeLabel(sceneData(null), ko)).toBe('새 씬')
    const en = boardNodeNames(manifest, writerShots, 'en')
    expect(directorNodeLabel(shotData(null), en)).toBe('New Shot')
    expect(directorNodeLabel(sceneData(null), en)).toBe('New Scene')
  })

  // 왜: 멈춘 이미지 · Take 가 뒤늦게 끝났다는 채팅 알림은 id 숫자("sh_02_07" → "Shot 7")로 불러 보드 번호(샷 8)와 달랐다 — 같은 샷을 다른 번호로 불렀다.
  it('멈춘 이미지 · Take 가 뒤늦게 끝났다는 알림은 그 샷을 화면 언어의 보드 이름으로 부른다', () => {
    const store = read('src/stores/director-store.ts')
    expect(store).not.toMatch(/prettyNodeLabel\(shot\.data\.label/)
    expect(store.match(/stoppedShotName\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(store).toMatch(/function stoppedShotName\([\s\S]{0,400}?directorNodeLabel\([\s\S]{0,200}?boardNodeNames\(writer\.sceneManifest, writer\.shots \?\? \[\], locale\)/)
  })

  // 왜: Director 내보내기 shotlist.md 는 씬을 "Scene sc_01", 샷을 "sh_02_07"처럼 내부 id 로 적었다 — 이름 규칙이 내보낸 파일에서만 깨졌다(리드 11/14 H7).
  //   그림 · 영상 파일 경로는 그대로 둔다(묶음 안 경로는 바꾸지 않는다).
  it('Director 내보내기는 내부 id 대신 프로젝트 언어의 보드 이름으로 씬 · 샷을 적고 그림 · 영상 파일 경로는 그대로다', () => {
    const data: DirectorExportData = {
      scenes: [
        { scene_id: 'sc_01', location: '옥상', sort_order: 0 },
        { scene_id: 'sc_03', location: '골목', sort_order: 1 },
      ],
      shots: [
        { scene_id: 'sc_01', shot_id: 'sh_01_01', sort_order: 0, storyboard_image: { url: 'https://cdn.test/a.png', status: 'completed' } },
        { scene_id: 'sc_01', shot_id: 'sh_01_04', sort_order: 1 },
        { scene_id: 'sc_03', shot_id: 'sh_03_05', sort_order: 2 },
      ],
      videoClips: [],
    }
    const shotlist = (locale: 'ko' | 'en') => {
      const files = collectDirectorArtifacts(data, locale)
      const file = files.find((f) => f.path === 'director/shotlist.md')
      return { text: file && 'content' in file ? String(file.content) : '', paths: files.map((f) => f.path) }
    }
    const ko = shotlist('ko')
    expect(ko.text).toContain('## 씬 1 — 옥상')
    expect(ko.text).toContain('## 씬 2 — 골목')
    expect(ko.text).toMatch(/\| 샷 1 \|/)
    expect(ko.text).toMatch(/\| 샷 3 \|/)
    // 씬 머리 · 샷 칸에 내부 id 가 없다(그림 경로 칸의 파일 이름은 그대로라 id 가 남는다).
    expect(ko.text).not.toMatch(/## Scene sc|\| sh\\?_0/)
    const en = shotlist('en')
    expect(en.text).toContain('## Scene 1 — 옥상')
    expect(en.text).toMatch(/\| Shot 2 \|/)
    expect(ko.paths).toContain('director/shots/sc_01-sh_01_01.png')
  })

  // 왜: 관리자만 보는 연출 점검 줄도 화면 글이다 — 파이프라인 순번(shot_2)을 "Shot 2"로만 바꿔 한국어 화면에 영어가 보였다.
  it('관리자 연출 점검 줄의 샷 · 씬 이름도 화면 언어를 따른다', () => {
    expect(pipelineLocationName('shot_2~shot_3', 'ko')).toBe('샷 2~샷 3')
    expect(pipelineLocationName('scene_1 shot_4', 'ko')).toBe('씬 1 샷 4')
    expect(pipelineLocationName('shot_2', 'en')).toBe('Shot 2')
    expect(read('src/features/writer/rough-storyboard-view.tsx')).toContain('pipelineLocationName(issue.location, locale)')
  })

  // 왜: 리드 11/14 — 오너 "전역" 규칙 안이다. 러프 보기 카드 배지가 한국어 화면에도 "Previz"였다. 보기 단추 이름(러프 · Rough)과 같게 한다.
  it('Director 러프 보기 카드의 배지는 보기 단추와 같은 이름이고 한국어 화면에서 "러프"다', () => {
    const grid = read('src/features/director/canvas-views/StoryboardGridView.tsx')
    const badge = grid.slice(grid.indexOf('const stageBadge ='), grid.indexOf('const runImage'))
    expect(badge).toContain("label: t('Rough')")
    expect(badge).not.toContain("label: 'Previz'")
    expect(translate('ko', 'Rough')).toBe('러프')
  })

  // 왜: 리드 11/14 — 한국어 화면에 "Shot 라벨" · "Scene 라벨" · "Shot 표현" · "… Shot {shots}개"처럼 영어 Shot · Scene 낱말이 보였다. "Take"는 제품 낱말이라 그대로(H9).
  it('한국어 사전의 화면 글에는 영어 Shot · Scene 낱말이 없다', () => {
    const leaks = Object.entries(KO).filter(([, value]) => /\b(Shot|Shots|Scene|Scenes)\b/.test(value)).map(([key, value]) => `${key} → ${value}`)
    expect(leaks).toEqual([])
  })
})
