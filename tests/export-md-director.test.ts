import { describe, expect, it } from 'vitest'

import { collectDirectorArtifacts, type DirectorExportData } from '@/lib/export/director'
import {
  compareDirectorVideoTakeOrder,
  selectHandoffTake,
  selectLatestAttempt,
  selectNewestSuccessfulTake,
  type VideoTakeSelectionRecord,
} from '@/lib/director-video-take-selection'
import type { ArtifactFile } from '@/lib/export/types'

const fixtureData: DirectorExportData = {
  scenes: [
    {
      scene_id: 'sc_01',
      narrative_summary: 'English rooftop scene',
      narrative_summary_native: '한국어 옥상 장면',
      location: '옥상',
      time_of_day: '밤',
      mood: 'English tense mood',
      mood_native: '한국어 긴장감',
      sort_order: 1,
    },
    {
      scene_id: 'sc_02',
      narrative_summary: '두 번째 장면',
      location: '골목',
      time_of_day: '새벽',
      mood: '불안',
      sort_order: 2,
    },
  ],
  shots: [
    {
      scene_id: 'sc_01',
      shot_id: 'sh_01_01',
      action_description: 'English action should not render',
      action_description_native: '한국어 액션이 먼저 나온다',
      dialogue_lines: [{ characterId: 'hero', text: 'English line should not render', text_native: '한국어 대사' }],
      camera_config: { horizontal: 1, vertical: -2, zoom: 3 },
      lighting_config: { position: 'left', brightness: 65, colorTemp: 3200 },
      movement_preset: 'dolly_in',
      sort_order: 1,
      storyboard_image: {
        url: 'https://cdn.example.com/storyboards/sh_01_01.png',
        status: 'completed',
        errorMessage: null,
        generatedAt: 100,
      },
    },
    {
      scene_id: 'sc_01',
      shot_id: 'sh_01_02',
      action_description: '대기 중인 샷',
      dialogue_lines: [],
      camera_config: { horizontal: 0, vertical: 0 },
      lighting_config: { position: 'front', brightness: 50 },
      movement_preset: 'pan_right',
      sort_order: 2,
      storyboard_image: {
        url: 'https://cdn.example.com/storyboards/stale-generating.png',
        status: 'generating',
        errorMessage: null,
        generatedAt: 90,
      },
    },
    {
      scene_id: 'sc_02',
      shot_id: 'sh_02_01',
      action_description: '실패한 스토리보드 샷',
      dialogue_lines: [{ character_id: 'villain', text: '멈춰.' }],
      camera_config: { pan: -1 },
      lighting_config: { position: 'top', brightness: 20 },
      movement_preset: 'static',
      sort_order: 1,
      storyboard_image: {
        url: 'https://cdn.example.com/storyboards/stale-failed.png',
        status: 'failed',
        errorMessage: 'moderation blocked',
        generatedAt: 0,
      },
      video_url: 'https://cdn.example.com/shots/stale-projection.mp4',
    },
    {
      scene_id: 'sc_02',
      shot_id: 'sh_02_02',
      action_description: '클립이 아직 없는 샷',
      dialogue_lines: [],
      camera_config: { tilt: 2 },
      lighting_config: { position: 'right', brightness: 40 },
      movement_preset: 'push_in',
      sort_order: 2,
      storyboard_image: null,
      video_url: 'https://cdn.example.com/shots/sh_02_02-final.mp4',
    },
  ],
  videoClips: [
    {
      id: 'clip-old-completed',
      shot_id: 'sh_01_01',
      url: 'https://cdn.example.com/clips/old-completed.mp4',
      status: 'completed',
      is_final: false,
      take_number: 1,
    },
    {
      id: 'clip-final',
      shot_id: 'sh_01_01',
      url: 'https://cdn.example.com/clips/final.mp4',
      status: 'completed',
      is_final: true,
      take_number: 1,
    },
    {
      id: 'clip-completed-old',
      shot_id: 'sh_01_02',
      url: 'https://cdn.example.com/clips/completed-old.mp4',
      status: 'completed',
      is_final: false,
      take_number: 1,
    },
    {
      id: 'clip-completed-new',
      shot_id: 'sh_01_02',
      url: 'https://cdn.example.com/clips/completed-new.mp4',
      status: 'completed',
      is_final: false,
      take_number: 2,
    },
    {
      id: 'clip-pending',
      shot_id: 'sh_02_01',
      url: 'https://cdn.example.com/clips/pending.mp4',
      status: 'pending',
      is_final: false,
      take_number: 3,
    },
    {
      id: 'clip-failed',
      shot_id: 'sh_02_01',
      url: 'https://cdn.example.com/clips/failed.mp4',
      status: 'failed',
      is_final: true,
      take_number: 4,
    },
    {
      id: 'clip-newer-generating',
      shot_id: 'sh_01_01',
      url: 'https://cdn.example.com/clips/generating.mp4',
      status: 'generating',
      is_final: false,
      take_number: 4,
      created_at: '2026-07-11T14:00:00.000Z',
    },
    {
      id: 'clip-newer-deleted',
      shot_id: 'sh_01_02',
      url: 'https://cdn.example.com/clips/deleted.mp4',
      status: 'completed',
      is_final: true,
      take_number: 3,
      deleted_at: '2026-07-11T15:00:00.000Z',
      created_at: '2026-07-11T15:00:00.000Z',
    },
  ],
}

describe('collectDirectorArtifacts', () => {
  it('emits storyboard pngs only for completed storyboard_image rows with a url', () => {
    const files = collectDirectorArtifacts(fixtureData)

    expect(mediaFile(files, 'director/shots/sc_01-sh_01_01.png')?.url).toBe(
      'https://cdn.example.com/storyboards/sh_01_01.png',
    )
    expect(files.some((file) => file.path === 'director/shots/sc_01-sh_01_02.png')).toBe(false)
    expect(files.some((file) => file.path === 'director/shots/sc_02-sh_02_01.png')).toBe(false)

    const shotlist = textFile(files, 'director/shotlist.md')
    expect(shotlist).toContain('생성 중 (generating) — 미포함')
    expect(shotlist).toContain('실패 (failed): moderation blocked — 미포함')
    expect(shotlist).not.toContain('https://cdn.example.com/storyboards/stale-generating.png')
    expect(shotlist).not.toContain('https://cdn.example.com/storyboards/stale-failed.png')
  })

  it('selects a successful live Final over newer takes, otherwise uses the newest successful take, and only uses shots.video_url without relational rows', () => {
    const files = collectDirectorArtifacts(fixtureData)

    expect(mediaFile(files, 'director/clips/sc_01-sh_01_01.mp4')?.url).toBe(
      'https://cdn.example.com/clips/final.mp4',
    )
    expect(mediaFile(files, 'director/clips/sc_01-sh_01_02.mp4')?.url).toBe(
      'https://cdn.example.com/clips/completed-new.mp4',
    )
    expect(files.some((file) => file.path === 'director/clips/sc_02-sh_02_01.mp4')).toBe(false)
    expect(mediaFile(files, 'director/clips/sc_02-sh_02_02.mp4')?.url).toBe(
      'https://cdn.example.com/shots/sh_02_02-final.mp4',
    )

    expect(textFile(files, 'director/shotlist.md')).toContain('생성 중/최종 없음 — 미포함')
    expect(files.filter((file) => file.path.startsWith('director/clips/'))).toHaveLength(3)
    expect(files.some((file) => file.url === 'https://cdn.example.com/shots/stale-projection.mp4')).toBe(false)
  })

  it('renders a readable native-first shotlist without raw JSON bodies', () => {
    const files = collectDirectorArtifacts(fixtureData)
    const shotlist = textFile(files, 'director/shotlist.md')

    expect(shotlist).toContain('# Director Shotlist')
    expect(shotlist).toContain('## Scene sc\\_01 — 옥상')
    expect(shotlist).toContain('## Scene sc\\_02 — 골목')
    expect(shotlist).toContain('요약: 한국어 옥상 장면')
    expect(shotlist).toContain('무드: 한국어 긴장감')
    expect(shotlist).toContain('한국어 액션이 먼저 나온다')
    expect(shotlist).toContain('한국어 대사')
    expect(shotlist).not.toContain('English action should not render')
    expect(shotlist).not.toContain('English line should not render')
    expect(shotlist).not.toContain('English rooftop scene')
    expect(shotlist).not.toContain('English tense mood')
    expect(shotlist).toContain('horizontal=1')
    expect(shotlist).toContain('position=left')
    expect(shotlist).toContain('dolly\\_in')
    expect(shotlist).not.toContain('{')
    expect(shotlist).not.toContain('}')
    expect(shotlist).not.toContain('```json')
  })
})

describe('Director video take selection', () => {
  function take(overrides: Partial<VideoTakeSelectionRecord> = {}): VideoTakeSelectionRecord {
    return {
      id: 'take-1',
      take_number: 1,
      created_at: '2026-07-20T00:00:00.000Z',
      last_attempt_at: '2026-07-20T00:00:00.000Z',
      deleted_at: null,
      status: 'completed',
      url: 'https://cdn.example.com/take.mp4',
      is_final: false,
      ...overrides,
    }
  }

  it('prefers a usable Final, then the newest usable take while excluding deleted, failed, pending, and whitespace URLs', () => {
    const takes = [
      take({ id: 'final', take_number: 1, is_final: true }),
      take({ id: 'newest', take_number: 2 }),
      take({ id: 'whitespace', take_number: 6, url: '  ' }),
      take({ id: 'pending', take_number: 5, status: 'pending' }),
      take({ id: 'failed', take_number: 4, status: 'failed' }),
      take({ id: 'deleted', take_number: 3, deleted_at: '2026-07-20T01:00:00.000Z' }),
    ]

    expect(selectHandoffTake(takes)?.id).toBe('final')
    expect(selectNewestSuccessfulTake(takes)?.id).toBe('newest')
    expect(selectHandoffTake(takes.map(item => item.id === 'final' ? { ...item, url: ' ' } : item))?.id).toBe('newest')
  })

  it('uses deterministic ids to resolve equal take timestamps and attempt timestamps before take ordering', () => {
    const a = take({ id: 'a', take_number: 2, last_attempt_at: '2026-07-20T02:00:00.000Z' })
    const z = take({ id: 'z', take_number: 2, last_attempt_at: '2026-07-20T02:00:00.000Z' })
    const newestAttempt = take({ id: 'older-take-new-attempt', take_number: 1, last_attempt_at: '2026-07-20T03:00:00.000Z' })

    expect(compareDirectorVideoTakeOrder(a, z)).toBeGreaterThan(0)
    expect(selectNewestSuccessfulTake([a, z])?.id).toBe('z')
    expect(selectLatestAttempt([a, z, newestAttempt])?.id).toBe('older-take-new-attempt')
  })
})
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
