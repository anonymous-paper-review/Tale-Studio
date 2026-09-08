// 정지 프롬프트 위생 (2026-09-05, 오너 5번: 전후 생성으로 판단 — 코드 계약은 여기서 못박는다)
//   배경은 카메라 시야 안의 무대 표지로 고정하고, 정지 프롬프트에서 카메라 무브 서술을 빼며, 작가에게 환경 사건의 출처·방향을 요구한다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { backgroundClauseFromView, landmarksInView, stripCameraMoveSentences } from '@/lib/writer/pipeline/stage/view'
import { buildRoughGridCell } from '@/lib/writer/rough-storyboard-grid'
import type { ShotStaticSpec, StageCamera } from '@/lib/writer/types/pipeline'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

// 남쪽 8m 에서 북쪽을 보는 카메라(35mm).
const CAM: StageCamera = { x: 0, y: -8, z: 1.5, look_at: { x: 0, y: 0, z: 1.2 }, lens_mm: 35, hfov_deg: 54 }
const LANDMARKS = [
  { id: 'rock', label: 'floating rock cluster', x: 0, y: 30 },
  { id: 'gate', label: 'gap between inverted trees', x: -8, y: 10 },
  { id: 'behind', label: 'cave mouth', x: 0, y: -30 },
  { id: 'far_right', label: 'distant crater', x: 60, y: 5 },
]

describe('배경은 시야 안 표지로 고정된다', () => {
  it('카메라 앞의 표지만 시야에 들고, 뒤의 표지는 빠지며, 좌우·거리가 붙는다', () => {
    const items = landmarksInView(CAM, LANDMARKS, 16 / 9)
    expect(items.map((i) => i.id)).toEqual(['gate', 'rock'])
    expect(items.find((i) => i.id === 'rock')).toMatchObject({ side: 'center', distance: 'far' })
    expect(items.find((i) => i.id === 'gate')).toMatchObject({ side: 'left', distance: 'mid' })
    expect(items.some((i) => i.id === 'behind' || i.id === 'far_right')).toBe(false)
  })

  it('배경 문장은 시야 안 표지만 나열하고, 표지가 없으면 문장이 없다', () => {
    const clause = backgroundClauseFromView(landmarksInView(CAM, LANDMARKS, 16 / 9))
    expect(clause).toBe('background fixed by the stage (draw exactly these, nothing else invented): gap between inverted trees on the left, in the middle distance; floating rock cluster straight ahead, far away')
    expect(backgroundClauseFromView([])).toBeNull()
  })
})

describe('정지 프롬프트에 카메라 무브 서술이 없다', () => {
  it('"as the camera pushes in" 같은 앞말과 "the camera tracks left." 같은 문장을 뺀다', () => {
    expect(stripCameraMoveSentences('As the camera pushes in, the beast chieftain rises. The camera tracks left. Dirt begins to crack.')).toBe(
      'The beast chieftain rises. Dirt begins to crack.',
    )
    expect(stripCameraMoveSentences('Three leaders lie scattered on floating mounds.')).toBe('Three leaders lie scattered on floating mounds.')
    expect(stripCameraMoveSentences('')).toBe('')
  })
})

describe('러프 셀이 위생 규칙을 쓴다', () => {
  const spec: ShotStaticSpec = {
    shot_id: 'sh', lens_mm: 35, shot_type: 'WS', camera_angle: 'eye_level', depth_of_field: 'medium',
    framing: { rule: 'thirds', layers: {}, focal_point: 'the leaders' },
    lighting: { key_fill_ratio: '4:1', color_temp_kelvin: 5000, quality: 'soft', key_direction: 'top_left' },
    character_blocking: [{ character_id: 'char', position_in_frame: 'center_third', pose: 'standing', gaze: 'ahead', asset_version: 'v1' }],
    prop_placement: [], palette_emphasis: [], texture_notes: '', color_grading_intent: '', first_frame_prompt: '',
    screen_layout: { beat: 0, camera: CAM, characters: [], issues: [] },
  }
  const cell = buildRoughGridCell(
    {
      shotType: 'WS',
      actionDescription: 'As the camera drifts up, the ground splits and soil pours down from the ceiling.',
      characterNames: ['A'],
      characterNameById: new Map([['char', 'A']]),
      spec: { staticSpec: spec, dynamicSpec: { shot_id: 'sh', camera_motion: { type: 'dolly_in', direction: 'forward', speed: 'slow', magnitude: 'moderate' }, character_motion: [], motion_prompt: '' } },
      stageLandmarks: LANDMARKS,
      frameAspect: 16 / 9,
    },
    'sh',
  )
  it('시야 안 표지 배경 문장이 실리고, moment 에서 카메라 무브 앞말이 빠진다', () => {
    expect(cell.start).toMatch(/background fixed by the stage/)
    expect(cell.start).toMatch(/floating rock cluster straight ahead, far away/)
    expect(cell.start).not.toMatch(/cave mouth/)
    expect(cell.start).toMatch(/moment: The ground splits and soil pours down from the ceiling\./)
    expect(cell.start).not.toMatch(/camera drifts/)
  })
  it('러프 라우트가 씬 무대의 표지와 화면 비율을 셀에 넘긴다', () => {
    const route = read('src/app/api/writer/rough-storyboard/route.ts')
    expect(route).toMatch(/\.select\('scene_id, location, time_of_day, mood, stage'\)/)
    expect(route).toMatch(/stageLandmarks: scene\n\s+\? stageLandmarksOf\(scene\.stage\)\.map\(/)
    // 표지 라벨은 콘텐츠 언어로 적히므로 영어 셀에 넣기 전에 EN 으로 번역한다(실측: 겨울_6 씬 1 러프에 한국어 라벨이 섞임).
    //   #name-en(2026-09-08): 번역은 한 번 정해 scenes.stage 에 저장하는 ensureStageLandmarkLabelsEn 이 맡는다.
    expect(route).toMatch(/ensureStageLandmarkLabelsEn\(/)
    expect(route).toMatch(/landmarkEnByKey\.get\(`\$\{scene\.scene_id as string\}\|\$\{l\.id\}`\) \?\? l\.label/)
    expect(route).toMatch(/frameAspect: aspectRatioOf\(projectFormat\)/)
  })
  it('작가 프롬프트가 환경 사건의 출처·방향을 요구하고 정지 프롬프트에서 카메라 무브를 금한다', () => {
    const v4 = read('src/lib/writer/pipeline/stages/v4_shots.ts')
    expect(v4).toMatch(/환경 사건\(붕괴·낙하·분출·바람·흔들림\)은 \*\*출처와 방향\*\*을 적어라/)
    expect(v4).toMatch(/first_frame_prompt 는 정지 그림이라 카메라 무브를 말하지 않는다/)
  })
})
