// 이야기 문장에는 이름이 나온다 — 인물 id(char, char_2 …)는 구조 칸에만 (2026-09-08, 오너 지시 1·2·3)
//
//   1 근본: 씬 스토리·데쿠파주·V4 의 산문 필드에서 id 를 이름으로 바꾼다(지시서 규칙 + 코드 치환). 구조 칸(characters_in_scene·
//     character_id·gaze_arc·camera_target)은 id 그대로. 2 표시: 안 바꾸던 화면 여섯이 같은 치환을 쓰고, 한국어 조사를 맞춘다.
//   문장 하나 = 테스트 하나.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { replaceSlugs } from '@/lib/script-lines'
import { fixKoreanParticles } from '@/lib/korean-particles'
import { cleanDecoupageProse, cleanSceneProse, cleanShotDesignProse } from '@/lib/writer/pipeline/util/prose_names'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const CAST = [
  { id: 'char', name: '용족수장' },
  { id: 'char_2', name: '요정수장' },
  { id: 'char_3', name: '수인수장' },
]

describe('치환 — id 는 이름이 되고 조사가 맞춰진다', () => {
  it('맨몸 id(char)도 로스터에 있으면 이름으로 바꾸고, 긴 id 가 먼저 잡혀 char_2 를 char 로 오인하지 않는다', () => {
    expect(resolveEntityNames('char가 공중에 뜬 char_2를 발견한다.', CAST)).toBe('용족수장이 공중에 뜬 요정수장을 발견한다.')
    expect(resolveEntityNames('Char_2 gazes at char.', CAST)).toBe('요정수장 gazes at 용족수장.')
    expect(resolveEntityNames('the charcoal sky', CAST)).toBe('the charcoal sky')
    // 영어 낱말이기도 한 폴백 id(location)는 한글이 붙은 자리에서만 이름이 된다.
    const LOC = [{ id: 'location', name: '세상의 중심부' }]
    expect(resolveEntityNames('origin location of beast chieftain', LOC)).toBe('origin location of beast chieftain')
    expect(resolveEntityNames('location에서 셋이 만난다', LOC)).toBe('세상의 중심부에서 셋이 만난다')
    expect(resolveEntityNames('char_9 arrives.', CAST)).toBe('char_9 arrives.')
  })

  it('한국어 조사는 이름의 받침에 맞춘다 — 이/가, 을/를, 은/는, 과/와, 으로/로', () => {
    expect(fixKoreanParticles('요정수장가 웃는다', ['요정수장'])).toBe('요정수장이 웃는다')
    expect(fixKoreanParticles('카이이 웃는다', ['카이'])).toBe('카이가 웃는다')
    expect(fixKoreanParticles('수인수장를 본다. 카이을 본다.', ['수인수장', '카이'])).toBe('수인수장을 본다. 카이를 본다.')
    expect(fixKoreanParticles('수인수장는 카이은', ['수인수장', '카이'])).toBe('수인수장은 카이는')
    expect(fixKoreanParticles('수인수장와 카이과', ['수인수장', '카이'])).toBe('수인수장과 카이와')
    expect(fixKoreanParticles('수인수장로 카이으로 미르로', ['수인수장', '카이', '미르'])).toBe('수인수장으로 카이로 미르로')
    // 이름 뒤가 조사가 아니면 손대지 않는다. 한글로 끝나지 않는 이름도 손대지 않는다.
    expect(fixKoreanParticles('요정수장가문', ['요정수장'])).toBe('요정수장가문')
    expect(fixKoreanParticles('Kai가 웃는다', ['Kai'])).toBe('Kai가 웃는다')
  })

  it('표시용 replaceSlugs 도 같은 조사 규칙을 쓴다', () => {
    const roster = [{ slug: 'char', name: '용족수장' }, { slug: 'char_2', name: '요정수장' }]
    expect(replaceSlugs('char가 char_2를 본다', roster, '')).toBe('용족수장이 요정수장을 본다')
    expect(replaceSlugs('char waits', roster)).toBe('@용족수장 waits')
  })
})

describe('파이프라인 — 산문 필드는 이름, 구조 칸은 id', () => {
  it('씬 스토리: scene_actions·대사 요약·대사 문장의 id 는 이름이 되고 characters_in_scene 은 그대로다', () => {
    const scenes = cleanSceneProse(
      {
        scenes: [{
          scene_id: 'sc_01', characters_in_scene: ['char', 'char_2'],
          dialogue_summary: 'char가 위협한다', key_dialogue: [{ character_id: 'char', line: 'char_2, 물러서라', delivery: '낮게' }],
          scene_actions: ['char가 눈을 뜬다.', 'char_2를 발견한다.'],
        }],
        total_estimated_seconds: 20,
        new_characters: [{ id: 'masked_pursuer', name: '복면의 추적자', role: 'supporting', description: '' }],
      } as never,
      { characters: CAST.map((c) => ({ ...c, role: 'supporting' })) } as never,
    )
    const sc = scenes.scenes[0]
    expect(sc.scene_actions).toEqual(['용족수장이 눈을 뜬다.', '요정수장을 발견한다.'])
    expect(sc.dialogue_summary).toBe('용족수장이 위협한다')
    expect(sc.key_dialogue?.[0]).toEqual({ character_id: 'char', line: '요정수장, 물러서라', delivery: '낮게' })
    expect(sc.characters_in_scene).toEqual(['char', 'char_2'])
  })

  it('데쿠파주: beat_summary(_native)·목적 문장의 id 는 이름이 되고 camera_target 은 그대로다', () => {
    const [shot] = cleanDecoupageProse(
      [{
        shot_id: 's1', scene_id: 'sc_01', operation: 'derived', shot_function: 'action', source_beats: [0],
        beat_summary: 'char looks up at char_2', beat_summary_native: 'char가 char_2를 올려다본다', shot_size: 'MS',
        intended_duration_seconds: 4, rhythm_role: 'develop', camera_intent: 'motivated_move', camera_motivation: 'reveal',
        camera_target: 'char_2', dramatic_purpose: 'char_2 의 등장', camera_move_motivation: 'char 의 시선',
      }] as never,
      CAST,
    )
    expect(shot.beat_summary).toBe('용족수장 looks up at 요정수장')
    expect(shot.beat_summary_native).toBe('용족수장이 요정수장을 올려다본다')
    expect(shot.dramatic_purpose).toBe('요정수장 의 등장')
    expect(shot.camera_target).toBe('char_2')
  })

  it('V4: 레이어·정지 프롬프트·동작·모션 문장의 id 는 이름이 되고 character_id·gaze_arc·target 은 그대로다', () => {
    const shot = cleanShotDesignProse(
      {
        intent: { shot_id: 's1', scene_id: 'sc_01', story_beat_ref: 0, dramatic_purpose: 'char 의 분노', duration_seconds: 4, duration_justification: '', audience_focus: 'char_3 의 손', shot_position_in_scene: 'developing' },
        static_spec: {
          shot_id: 's1', lens_mm: 35, shot_type: 'MS', camera_angle: 'eye_level', depth_of_field: 'medium',
          framing: { rule: 'thirds', layers: { midground: 'char_3 airborne', background: 'char watching' }, focal_point: 'char_3' },
          lighting: { key_fill_ratio: '4:1', color_temp_kelvin: 5000, quality: 'soft', key_direction: 'top_left' },
          character_blocking: [{ character_id: 'char_3', position_in_frame: 'center_third', pose: 'leaping over char', gaze: 'toward_char', asset_version: 'v1' }],
          prop_placement: [{ prop: 'char_2 의 지팡이', position_in_frame: 'left_third', significance: 'char_2 의 권위' }],
          palette_emphasis: [], texture_notes: '', color_grading_intent: '', first_frame_prompt: 'Beast leader char_3 leaps over char.',
        },
        dynamic_spec: {
          shot_id: 's1', camera_motion: { type: 'static', direction: 'none', speed: 'slow', magnitude: 'minimal', target: 'char_3' },
          character_motion: [{ character_id: 'char_3', verb: "steps onto char's shoulder", magnitude: 'medium' }],
          gaze_arc: [{ character_id: 'char', from: 'char_3', to: 'char_2' }],
          environmental_change: [{ type: 'dust', description: 'dust from char_3 landing' }],
          motion_prompt: 'char_3 leaps as char braces.',
        },
      } as never,
      CAST,
    )
    expect(shot.static_spec.framing.layers.midground).toBe('수인수장 airborne')
    expect(shot.static_spec.framing.focal_point).toBe('수인수장')
    expect(shot.static_spec.first_frame_prompt).toBe('Beast leader 수인수장 leaps over 용족수장.')
    expect(shot.static_spec.character_blocking[0].pose).toBe('leaping over 용족수장')
    expect(shot.static_spec.character_blocking[0].character_id).toBe('char_3')
    expect(shot.static_spec.character_blocking[0].gaze).toBe('toward_char')
    expect(shot.static_spec.prop_placement[0].significance).toBe('요정수장 의 권위')
    expect(shot.dynamic_spec.motion_prompt).toBe('수인수장 leaps as 용족수장 braces.')
    expect(shot.dynamic_spec.character_motion[0].verb).toBe("steps onto 용족수장's shoulder")
    expect(shot.dynamic_spec.character_motion[0].character_id).toBe('char_3')
    expect(shot.dynamic_spec.gaze_arc?.[0]).toEqual({ character_id: 'char', from: 'char_3', to: 'char_2' })
    expect(shot.dynamic_spec.camera_motion.target).toBe('char_3')
    expect(shot.intent.dramatic_purpose).toBe('용족수장 의 분노')
  })

  it('지시서가 이름 규칙을 말하고, 세 단계가 치환을 부른다', () => {
    const s3 = read('src/lib/writer/pipeline/stages/s3_scenes.ts')
    expect(s3).toMatch(/PROSE_NAME_RULE/)
    expect(s3).toMatch(/cleanSceneProse\(/)
    const merged = read('src/lib/writer/pipeline/stages/s1s3_merged.ts')
    expect(merged).toMatch(/PROSE_NAME_RULE/)
    expect(merged).toMatch(/cleanSceneProse\(/)
    const dec = read('src/lib/writer/pipeline/stages/decoupage.ts')
    expect(dec).toMatch(/PROSE_NAME_RULE/)
    expect(dec).toMatch(/\{ id: c\.id, name: c\.name, role: c\.role, personality: c\.personality \}/)
    expect(dec).toMatch(/cleanDecoupageProse\(/)
    const v4 = read('src/lib/writer/pipeline/stages/v4_shots.ts')
    expect(v4).toMatch(/PROSE_NAME_RULE/)
    expect(v4).toMatch(/cleanShotDesignProse\(/)
    const rule = read('src/lib/writer/pipeline/util/prose_names.ts')
    expect(rule).toMatch(/표시 이름/)
  })
})

describe('표시 — 안 바꾸던 화면 여섯이 같은 치환을 쓴다', () => {
  it('Director 그리드 카드의 한국어 설명, Director 노드 카드의 프롬프트 줄, Writer 대사 뷰, Editor 타임라인·소스 패널·미리보기', () => {
    expect(read('src/features/director/canvas-views/StoryboardGridView.tsx')).toMatch(/replaceSlugs\(nativeDescription, roster, ''\)/)
    expect(read('src/features/director/canvas-nodes/ShotNode.tsx')).toMatch(/useEntityNames\(\)/)
    expect(read('src/features/writer/dialogue-view.tsx')).toMatch(/resolveEntityNames\(shot\.actionDescription/)
    for (const rel of ['src/features/editor/shot-timeline.tsx', 'src/features/editor/video-previewer.tsx', 'src/features/editor/video-source-panel.tsx', 'src/features/editor/timeline.tsx']) {
      expect(read(rel), rel).toMatch(/useEntityNames\(\)/)
      expect(read(rel), rel).toMatch(/resolveEntityNames\(/)
    }
  })
})
