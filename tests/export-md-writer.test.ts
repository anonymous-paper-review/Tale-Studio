import { describe, expect, it, vi } from 'vitest'

import {
  collectWriterArtifacts,
  type WriterExportFetch,
  type WriterExportProjection,
} from '@/lib/export/writer'

const projection: WriterExportProjection = {
  storyBible: {
    genre: {
      genre: 'noir',
      genre_native: '네오 누아르',
      tone: ['tense'],
      targetEmotion: ['dread'],
      runtime_seconds: 45,
      depth_level: 'D2',
      format: 'vertical_9:16',
    },
    narrativeStructure: {
      structure_type: '3-act',
      acts: [{ act_id: 'act_1', purpose: 'English setup', purpose_native: '한국어 설정', proportion: 1 }],
      pov: '3rd_limited',
      theme: 'English theme',
      theme_native: '한국어 주제',
      central_dramatic_question: 'Will she remember?',
      central_dramatic_question_native: '그녀는 기억할까?',
      turning_point_position: 0.5,
    },
    characters: {
      characters: [
        {
          id: 'hero',
          name: 'Eun',
          name_native: '은',
          role: 'protagonist',
          personality: ['curious'],
          arc: {
            start_state: 'afraid',
            start_state_native: '두려움',
            end_state: 'resolved',
            end_state_native: '결심',
            arc_type: 'positive_change',
          },
          appearance_description: 'English red coat',
          appearance_description_native: '붉은 코트',
          motivation: { want: 'truth', want_native: '진실', need: 'trust', need_native: '신뢰' },
        },
      ],
      relationships: [],
      subtext_notes: [],
    },
  },
  scenes: [
    {
      scene_id: 'scene_1',
      narrative_summary: 'English scene summary',
      narrative_summary_native: '한국어 장면 요약',
      mood: 'somber',
      mood_native: '침울',
      time_of_day: 'night',
      characters_present: ['hero'],
    },
  ],
  shotDesign: [
    {
      intent: {
        shot_id: 'shot_1',
        scene_id: 'scene_1',
        dramatic_purpose: 'English intent',
        dramatic_purpose_native: '한국어 의도',
        audience_focus: 'English focus',
        audience_focus_native: '한국어 초점',
        duration_seconds: 5,
        shot_position_in_scene: 'opening',
      },
      static_spec: {
        shot_id: 'shot_1',
        shot_type: 'CU',
        camera_angle: 'eye_level',
        lens_mm: 50,
        framing: { focal_point: 'English eyes', focal_point_native: '한국어 눈빛' },
        first_frame_prompt: 'English first frame',
        first_frame_prompt_native: '한국어 첫 프레임',
      },
      dynamic_spec: {
        shot_id: 'shot_1',
        camera_motion: { type: 'dolly_in', speed: 'slow', magnitude: 'minimal' },
        character_motion: [{ character_id: 'hero', verb: 'English turns', verb_native: '천천히 돌아본다' }],
        motion_prompt: 'English motion prose',
        motion_prompt_native: '한국어 움직임 문장',
      },
    },
  ],
  renderPrompts: {
    total_shots: 1,
    shots: [
      {
        shot_id: 'shot_1',
        scene_id: 'scene_1',
        duration_seconds: 5,
        t2i: {
          prompt: 'EN image prompt, neon rain on glass.',
          prompt_native: '한국어 이미지 프롬프트',
          aspect_ratio: '9:16',
          reference_assets: [],
        },
        ti2v: {
          motion_prompt: 'EN motion prompt, camera pushes in.',
          motion_prompt_native: '한국어 모션 프롬프트',
          duration_seconds: 5,
        },
      },
    ],
  },
}

describe('collectWriterArtifacts writer markdown', () => {
  it('renders the four writer markdown files with native-first prose and EN prompts', async () => {
    const files = await collectWriterArtifacts('project-1', { fetchFn: fetchProjection(projection) })

    expect(files.map((file) => file.path).sort()).toEqual([
      'writer/prompts.md',
      'writer/scenes.md',
      'writer/shots.md',
      'writer/story-bible.md',
    ])

    const storyBible = content(files, 'writer/story-bible.md')
    expect(storyBible).toContain('네오 누아르')
    expect(storyBible).toContain('한국어 주제')
    expect(storyBible).toContain('은')
    expect(storyBible).toContain('붉은 코트')

    const scenes = content(files, 'writer/scenes.md')
    expect(scenes).toContain('한국어 장면 요약')
    expect(scenes).toContain('침울')
    expect(scenes).not.toContain('English scene summary')

    const shots = content(files, 'writer/shots.md')
    expect(shots).toContain('한국어 의도')
    expect(shots).toContain('한국어 첫 프레임')
    expect(shots).toContain('천천히 돌아본다')
    expect(shots).not.toContain('English intent')

    const prompts = content(files, 'writer/prompts.md')
    expect(prompts).toContain('EN image prompt, neon rain on glass.')
    expect(prompts).toContain('EN motion prompt, camera pushes in.')
    expect(prompts).not.toContain('한국어 이미지 프롬프트')
    expect(prompts).not.toContain('한국어 모션 프롬프트')

    for (const file of files) {
      expect(file.kind).toBe('text')
      expect(file.content ?? '').not.toMatch(/^\s*\{[\s\S]*\}\s*$/m)
      expect(file.content ?? '').not.toContain('```json')
    }
  })

  it('marks incomplete pipeline sections and renders injected DB fallback rows for a no-run projection', async () => {
    const files = await collectWriterArtifacts('project-2', {
      fetchFn: fetchProjection({ storyBible: null, scenes: null, shotDesign: null, renderPrompts: null }),
      loadDbFallback: async () => ({
        scenes: [
          {
            scene_id: 'scene_db',
            narrative_summary: 'English DB scene',
            narrative_summary_native: 'DB 한국어 장면',
            mood: 'quiet',
            mood_native: '고요',
            time_of_day: 'dawn',
            characters_present: ['hero'],
          },
        ],
        shots: [
          {
            shot_id: 'shot_db',
            scene_id: 'scene_db',
            action_description: 'English DB action',
            action_description_native: 'DB 한국어 액션',
            shot_type: 'WS',
            duration_seconds: 6,
            dialogue_lines: [{ characterId: 'hero', text: '간다.' }],
            prompt: 'EN fallback prompt from DB.',
          },
        ],
      }),
    })

    for (const path of ['writer/story-bible.md', 'writer/scenes.md', 'writer/shots.md', 'writer/prompts.md']) {
      expect(content(files, path)).toContain('¶파이프라인 미완료')
    }
    expect(content(files, 'writer/scenes.md')).toContain('DB 한국어 장면')
    expect(content(files, 'writer/shots.md')).toContain('DB 한국어 액션')
    expect(content(files, 'writer/prompts.md')).toContain('EN fallback prompt from DB.')
  })
})

function fetchProjection(payload: unknown): WriterExportFetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  }))
}

function content(files: Array<{ path: string; content?: string | null }>, path: string): string {
  const file = files.find((candidate) => candidate.path === path)
  expect(file).toBeTruthy()
  return file?.content ?? ''
}
