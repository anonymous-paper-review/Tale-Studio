import { describe, expect, it } from 'vitest'

import { collectArtistArtifacts, type ArtistData } from '@/lib/export/artist'
import { DIRECTOR_SCENES_SELECT, DIRECTOR_SHOTS_SELECT, collectDirectorArtifacts, type DirectorExportData } from '@/lib/export/director'
import type { ArtifactFile } from '@/lib/export/types'

describe('G003 artist collector red-team coverage', () => {
  it('dedupes 3+ same-name character folders, keeps media-less index rows, and sanitizes hostile names', () => {
    const files = collectArtistArtifacts({
      characters: [
        {
          character_id: 'dup-1',
          name: '중복',
          view_main: 'https://cdn.test/dup-1/front.png',
          view_back: null,
          view_side_left: null,
          view_side_right: null,
          appearance: '첫 번째',
        },
        {
          character_id: 'dup-2',
          name: '중복',
          view_main: null,
          view_back: null,
          view_side_left: null,
          view_side_right: null,
        },
        {
          character_id: 'dup-3',
          name: '중복',
          view_main: null,
          view_back: null,
          view_side_left: null,
          view_side_right: 'https://cdn.test/dup-3/right.png',
          appearance: '세 번째',
        },
        {
          character_id: 'hostile',
          name: '../x<>:"/\\|?* 한글',
          view_main: 'https://cdn.test/hostile/front.png',
          view_back: 123 as unknown as string,
          view_side_left: '   ',
          view_side_right: '\n\t',
          appearance: '위험한 이름',
        },
      ],
      locations: [],
    })

    expect(mediaPaths(files)).toEqual([
      'artist/characters/중복/front.png',
      'artist/characters/중복-3/side-right.png',
      'artist/characters/x-한글/front.png',
    ])
    expect(mediaPaths(files)).not.toContain('artist/characters/중복-2/front.png')
    expect(mediaPaths(files)).not.toContain('artist/characters/x-한글/back.png')
    expect(mediaPaths(files)).not.toContain('artist/characters/x-한글/side-left.png')
    expect(mediaPaths(files)).not.toContain('artist/characters/x-한글/side-right.png')

    for (const path of mediaPaths(files)) {
      expect(path).toMatch(/^artist\/characters\//)
      expect(path).not.toMatch(/(^|\/)\.\.?(\/|$)/)
      expect(path).not.toMatch(/[<>:"\\|?*]/)
    }

    const markdown = textFile(files, 'artist/assets.md')
    expect(markdown).toContain('| 중복 | character | 미설정 | 미생성 |')
  })

  it('renders assets.md native-first without raw JSON-braced prose', () => {
    const files = collectArtistArtifacts({
      characters: [
        {
          character_id: 'native',
          name: '네이티브',
          view_main: null,
          view_back: null,
          view_side_left: null,
          view_side_right: null,
          appearance: 'English appearance must not win',
          appearance_native: '한국어 외형이 먼저',
        },
        {
          character_id: 'json-desc',
          name: 'JSON 설명',
          view_main: null,
          view_back: null,
          view_side_left: null,
          view_side_right: null,
          description: '{"raw":"object body should be readable","nested":{"tone":"calm"}}',
        },
      ],
      locations: [
        {
          location_id: 'json-world',
          name: 'JSON 월드',
          wide_shot: null,
          establishing_shot: null,
          visual_description: 'English world must not win',
          visual_description_native: '{"visual":"네이티브 월드","weather":"rain"}',
        },
      ],
    })

    const markdown = textFile(files, 'artist/assets.md')
    expect(markdown).toContain('한국어 외형이 먼저')
    expect(markdown).toContain('raw=object body should be readable')
    expect(markdown).toContain('tone=calm')
    expect(markdown).toContain('visual=네이티브 월드')
    expect(markdown).not.toContain('English appearance must not win')
    expect(markdown).not.toContain('English world must not win')
    expect(markdown).not.toContain('{')
    expect(markdown).not.toContain('}')
  })

  it('is pure and does not throw on malformed artist rows', () => {
    const data = {
      characters: [
        null,
        [],
        {
          character_id: 'bad-character',
          name: { raw: 'bad-name' },
          view_main: { raw: 'bad-url' },
          view_back: false,
          view_side_left: '',
          view_side_right: null,
          appearance: { raw: 'bad-appearance' },
        },
      ],
      locations: [
        null,
        {
          location_id: 'bad-location',
          name: ['bad-name'],
          wide_shot: { raw: 'bad-url' },
          establishing_shot: '   ',
          visual_description_native: { raw: 'bad-description' },
        },
      ],
    } as unknown as ArtistData
    const before = structuredClone(data)

    let first: ArtifactFile[] = []
    expect(() => {
      first = collectArtistArtifacts(data)
    }).not.toThrow()
    const second = collectArtistArtifacts(data)

    expect(second).toEqual(first)
    expect(data).toEqual(before)
    expect(mediaPaths(first)).toEqual([])
    expect(textFile(first, 'artist/assets.md')).toContain('이름 미정 캐릭터')
  })
})

describe('G003 director loader/collector contract guard', () => {
  it('keeps native-first renderer columns selected by the director loader', () => {
    expect(selectColumns(DIRECTOR_SCENES_SELECT)).toEqual(
      expect.arrayContaining(['narrative_summary', 'narrative_summary_native', 'mood', 'mood_native']),
    )
    expect(selectColumns(DIRECTOR_SHOTS_SELECT)).toEqual(
      expect.arrayContaining(['action_description', 'action_description_native']),
    )
  })
})

describe('G003 director collector red-team coverage', () => {
  it('emits storyboard pngs only for completed storyboard_image rows with usable urls and notes every omitted status', () => {
    const files = collectDirectorArtifacts({
      scenes: [scene('sc_storyboard')],
      shots: [
        shot('sh_generating', {
          scene_id: 'sc_storyboard',
          storyboard_image: {
            status: 'generating',
            url: 'https://cdn.test/storyboards/stale-generating.png',
          },
        }),
        shot('sh_failed', {
          scene_id: 'sc_storyboard',
          storyboard_image: {
            status: 'failed',
            url: 'https://cdn.test/storyboards/stale-failed.png',
            errorMessage: 'moderation blocked',
          },
        }),
        shot('sh_null', { scene_id: 'sc_storyboard', storyboard_image: null }),
        shot('sh_completed_empty', {
          scene_id: 'sc_storyboard',
          storyboard_image: { status: 'completed', url: '   ' },
        }),
        shot('sh_completed_url', {
          scene_id: 'sc_storyboard',
          storyboard_image: {
            status: 'completed',
            url: 'https://cdn.test/storyboards/completed.png',
          },
        }),
      ],
      videoClips: [],
    })

    expect(mediaPaths(files).filter((path) => path.startsWith('director/shots/'))).toEqual([
      'director/shots/sc_storyboard-sh_completed_url.png',
    ])
    expect(mediaFile(files, 'director/shots/sc_storyboard-sh_completed_url.png')?.url).toBe(
      'https://cdn.test/storyboards/completed.png',
    )
    expect(mediaPaths(files)).not.toContain('director/shots/sc_storyboard-sh_generating.png')
    expect(mediaPaths(files)).not.toContain('director/shots/sc_storyboard-sh_failed.png')
    expect(mediaPaths(files)).not.toContain('director/shots/sc_storyboard-sh_null.png')
    expect(mediaPaths(files)).not.toContain('director/shots/sc_storyboard-sh_completed_empty.png')

    const shotlist = textFile(files, 'director/shotlist.md')
    expect(shotlist).toContain('생성 중 (generating) — 미포함')
    expect(shotlist).toContain('실패 (failed): moderation blocked — 미포함')
    expect(shotlist).toContain('이미지 없음 — 미포함')
    expect(shotlist).toContain('완료 (completed), URL 없음 — 미포함')
    expect(shotlist).not.toContain('https://cdn.test/storyboards/stale-generating.png')
    expect(shotlist).not.toContain('https://cdn.test/storyboards/stale-failed.png')
  })

  it('selects clips by final flag first, then latest completed, and omits unusable clips with the Korean note', () => {
    const files = collectDirectorArtifacts({
      scenes: [scene('sc_clip')],
      shots: [
        shot('sh_final'),
        shot('sh_latest_completed'),
        shot('sh_pending_failed'),
        shot('sh_empty_completed'),
        shot('sh_video_url_fallback', { video_url: ' https://cdn.test/shots/fallback.mp4 ' }),
      ],
      videoClips: [
        clip('clip-final-old', 'sh_final', 'https://cdn.test/clips/final-old.mp4', {
          status: 'failed',
          is_final: true,
          created_at: '2026-07-11T08:00:00.000Z',
        }),
        clip('clip-newer-completed', 'sh_final', 'https://cdn.test/clips/newer-completed.mp4', {
          status: 'completed',
          is_final: false,
          created_at: '2026-07-11T12:00:00.000Z',
        }),
        clip('clip-completed-old', 'sh_latest_completed', 'https://cdn.test/clips/completed-old.mp4', {
          status: 'completed',
          created_at: '2026-07-11T09:00:00.000Z',
        }),
        clip('clip-completed-new', 'sh_latest_completed', 'https://cdn.test/clips/completed-new.mp4', {
          status: 'completed',
          created_at: '2026-07-11T13:00:00.000Z',
        }),
        clip('clip-pending', 'sh_pending_failed', 'https://cdn.test/clips/pending.mp4', {
          status: 'pending',
          created_at: '2026-07-11T14:00:00.000Z',
        }),
        clip('clip-failed', 'sh_pending_failed', 'https://cdn.test/clips/failed.mp4', {
          status: 'failed',
          created_at: '2026-07-11T15:00:00.000Z',
        }),
        clip('clip-empty-completed', 'sh_empty_completed', '   ', {
          status: 'completed',
          created_at: '2026-07-11T16:00:00.000Z',
        }),
      ],
    })

    expect(mediaFile(files, 'director/clips/sc_clip-sh_final.mp4')?.url).toBe(
      'https://cdn.test/clips/final-old.mp4',
    )
    expect(mediaFile(files, 'director/clips/sc_clip-sh_latest_completed.mp4')?.url).toBe(
      'https://cdn.test/clips/completed-new.mp4',
    )
    expect(mediaPaths(files)).not.toContain('director/clips/sc_clip-sh_pending_failed.mp4')
    expect(mediaPaths(files)).not.toContain('director/clips/sc_clip-sh_empty_completed.mp4')
    expect(mediaFile(files, 'director/clips/sc_clip-sh_video_url_fallback.mp4')?.url).toBe(
      'https://cdn.test/shots/fallback.mp4',
    )

    const shotlist = textFile(files, 'director/shotlist.md')
    expect(shotlist).toContain('생성 중/최종 없음 — 미포함')
    expect(shotlist).not.toContain('https://cdn.test/clips/pending.mp4')
    expect(shotlist).not.toContain('https://cdn.test/clips/failed.mp4')
  })

  it('renders native-first readable directing prose without JSON braces and escapes markdown injection', () => {
    const files = collectDirectorArtifacts({
      scenes: [
        {
          scene_id: 'sc_prose',
          narrative_summary: 'English scene summary must not win',
          narrative_summary_native: '네이티브 장면 요약',
          location: '실험실',
          time_of_day: '밤',
          mood: 'English mood must not win',
          mood_native: '네이티브 무드',
          sort_order: 1,
        },
      ],
      shots: [
        shot('sh_injection', {
          scene_id: 'sc_prose',
          action_description: 'English action must not win',
          action_description_native: '# Injected | pipe | `code` *bold* [link]',
          dialogue_lines: [
            {
              characterId: 'hero',
              text: 'English line must not win',
              text_native: '한국어 대사',
            },
          ],
          camera_config: '{"lens":"wide","nested":{"axis":"low"}}',
          lighting_config: { colorTemp: 3200, setup: { key: 'left' } },
          movement_preset: 'dolly_in',
        }),
      ],
      videoClips: [],
    })

    const shotlist = textFile(files, 'director/shotlist.md')
    expect(shotlist).toContain('네이티브 장면 요약')
    expect(shotlist).toContain('무드: 네이티브 무드')
    expect(shotlist).toContain('\\# Injected \\| pipe \\| \\`code\\` \\*bold\\* \\[link\\]')
    expect(shotlist).toContain('한국어 대사')
    expect(shotlist).toContain('lens=wide')
    expect(shotlist).toContain('axis=low')
    expect(shotlist).toContain('dolly\\_in')
    expect(shotlist).not.toContain('English scene summary must not win')
    expect(shotlist).not.toContain('English action must not win')
    expect(shotlist).not.toContain('English mood must not win')
    expect(shotlist).not.toContain('English line must not win')
    expect(shotlist).not.toMatch(/(^|\n)# Injected/m)
    expect(shotlist).not.toContain('| pipe |')
    expect(shotlist).not.toContain('{')
    expect(shotlist).not.toContain('}')
  })

  it('is pure and does not throw on malformed director rows', () => {
    const data = {
      scenes: [null, [], { scene_id: { raw: 'bad-scene' }, sort_order: Number.NaN }],
      shots: [
        null,
        [],
        {
          scene_id: { raw: 'bad-scene' },
          shot_id: { raw: 'bad-shot' },
          storyboard_image: 'not-a-record',
          dialogue_lines: [{ text: { raw: 'bad-dialogue' } }, null],
          camera_config: { nested: { raw: 'camera' } },
          lighting_config: null,
        },
      ],
      videoClips: [
        null,
        [],
        { id: { raw: 'bad-clip' }, shot_id: { raw: 'bad-shot' }, url: { raw: 'bad-url' }, status: 'completed' },
      ],
    } as unknown as DirectorExportData
    const before = structuredClone(data)

    let first: ArtifactFile[] = []
    expect(() => {
      first = collectDirectorArtifacts(data)
    }).not.toThrow()
    const second = collectDirectorArtifacts(data)

    expect(second).toEqual(first)
    expect(data).toEqual(before)
    expect(mediaPaths(first)).toEqual([])
    expect(textFile(first, 'director/shotlist.md')).not.toContain('{')
  })
})

function scene(sceneId: string): DirectorExportData['scenes'][number] {
  return {
    scene_id: sceneId,
    location: '장소',
    narrative_summary_native: '요약',
    sort_order: 1,
  }
}

function shot(
  shotId: string,
  overrides: Partial<DirectorExportData['shots'][number]> = {},
): DirectorExportData['shots'][number] {
  return {
    scene_id: 'sc_clip',
    shot_id: shotId,
    action_description_native: '액션',
    dialogue_lines: [],
    camera_config: {},
    lighting_config: {},
    movement_preset: 'static',
    sort_order: 1,
    storyboard_image: null,
    ...overrides,
  }
}

function clip(
  id: string,
  shotId: string,
  url: string,
  overrides: Partial<DirectorExportData['videoClips'][number]> = {},
): DirectorExportData['videoClips'][number] {
  return {
    id,
    shot_id: shotId,
    url,
    status: 'completed',
    ...overrides,
  }
}

function selectColumns(select: string): string[] {
  return select.split(',').map((column) => column.trim()).filter(Boolean)
}
function textFile(files: ArtifactFile[], path: string): string {
  const file = files.find((candidate) => candidate.path === path)
  expect(file).toMatchObject({ kind: 'text' })
  return file?.content ?? ''
}

function mediaFile(files: ArtifactFile[], path: string): ArtifactFile | undefined {
  const file = files.find((candidate) => candidate.path === path)
  expect(file).toMatchObject({ kind: 'media' })
  return file
}

function mediaPaths(files: ArtifactFile[]): string[] {
  return files.filter((file) => file.kind === 'media').map((file) => file.path)
}
