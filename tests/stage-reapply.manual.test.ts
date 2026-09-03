/* eslint-disable @typescript-eslint/no-explicit-any -- 수동 하네스: 드라이런 JSON 을 그대로 다룬다 */
// 저장된 드라이런 JSON(stage + shots)에 현재 apply 코드를 다시 적용한다 — LLM·DB 없음, 결정론.
//   RUN_STAGE_REAPPLY=1 STAGE_IN=<in.json> STAGE_OUT=<out.json> pnpm vitest run tests/stage-reapply.manual.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { applyStageToShots } from '@/lib/writer/pipeline/stage/apply'
import type { DecoupageShot, ShotDesign } from '@/lib/writer/types/pipeline'

const ENABLED = process.env.RUN_STAGE_REAPPLY === '1'

describe.skipIf(!ENABLED)('stage reapply', () => {
  it('re-applies the stage to saved shots', () => {
    const d = JSON.parse(readFileSync(process.env.STAGE_IN!, 'utf8'))
    const shots: ShotDesign[] = d.shots.map((s: any) => ({
      intent: { shot_id: s.shot_id, scene_id: d.scene, story_beat_ref: 0, dramatic_purpose: '', duration_seconds: 5, duration_justification: '', audience_focus: '', shot_position_in_scene: 'developing' },
      static_spec: {
        shot_id: s.shot_id, lens_mm: s.camera_setup?.lens_mm ?? 35, shot_type: s.shot_type, camera_angle: 'eye_level', depth_of_field: 'medium',
        framing: { rule: 'thirds', layers: {}, focal_point: '' }, lighting: { key_fill_ratio: '4:1', color_temp_kelvin: 5000, quality: 'soft', key_direction: 'top_left' },
        // 원래 LLM 명단으로 되돌린다: 코드가 추가한 인물(pose 가 'in the …' 로 끝남)은 뺀다
        character_blocking: s.character_blocking.filter((b: any) => !/, in the (foreground|midground|background)$/.test(b.pose)),
        prop_placement: [], palette_emphasis: [], texture_notes: '', color_grading_intent: '', first_frame_prompt: s.first_frame_prompt ?? '',
        camera_setup: s.camera_setup,
      },
      dynamic_spec: { shot_id: s.shot_id, camera_motion: s.camera_motion, character_motion: s.character_motion ?? [], motion_prompt: '' },
    }))
    const dec: DecoupageShot[] = d.shots.map((s: any) => ({
      shot_id: s.shot_id, scene_id: d.scene, operation: 'derived', shot_function: 'action', source_beats: s.screen_layout ? [s.screen_layout.beat] : [],
      beat_summary: '', shot_size: s.shot_type, intended_duration_seconds: 5, rhythm_role: 'develop', camera_intent: 'static', dramatic_purpose: '',
    }))
    // 첫 샷(added, EWS)은 비트가 없었다 — 드라이런의 beat 를 그대로 쓰되 added 로 표시
    const r = applyStageToShots(shots, d.stage, dec, { format: 'horizontal_16:9' })
    const out = {
      ...d,
      shots: r.shots.map((s, i) => ({
        ...d.shots[i],
        camera_setup: s.static_spec.camera_setup,
        screen_layout: s.static_spec.screen_layout,
        character_blocking: s.static_spec.character_blocking,
      })),
      layout_notes: [{ name: 'reapply', text: r.issues.map((i) => `[${i.severity}] ${i.location}: ${i.message}`).join('\n') }],
    }
    writeFileSync(process.env.STAGE_OUT!, JSON.stringify(out, null, 1))
    expect(r.shots.length).toBe(shots.length)
  })
})
