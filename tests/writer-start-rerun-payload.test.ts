import { expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/auth', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))
vi.mock('@/lib/writer/run-store', () => ({ createRun: vi.fn(), getActiveRun: vi.fn() }))
vi.mock('@/lib/writer/pipeline/steps', () => ({
  WRITER_TOTAL_UNITS: 1,
  WRITER_V2_TOTAL_UNITS: 1,
  triggerWriterStep: vi.fn(),
}))
vi.mock('@/lib/admin', () => ({ isAdminOwnedProject: vi.fn() }))
vi.mock('@/lib/writer/engine', () => ({ isWriterEngine: vi.fn(() => false) }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ applyProducerI18n: vi.fn() }))
vi.mock('@/lib/locale', () => ({ detectLocaleFromText: vi.fn(() => 'en') }))
vi.mock('@/lib/writer/content-safety-hint', () => ({ assessContentSafetyRisk: vi.fn(() => ({ risky: false })) }))
vi.mock('@/lib/style-anchor', () => ({ parseCustomStyleAnchor: vi.fn(() => null) }))

import { buildRerunContext } from '@/app/api/writer/start/route'

it('builds rerun input from scenes, shots, chat, and producer decisions', () => {
  const context = buildRerunContext(
    'run-previous',
    [
      {
        scene_id: 'sc_01',
        narrative_summary: '주인공이 문을 연다',
        original_text_quote: '문을 열었다',
        location: 'neon_market',
        time_of_day: 'night',
        mood: 'tense',
        characters_present: ['hero'],
        estimated_duration_seconds: 8,
      },
    ],
    [
      {
        shot_id: 'sh_01_01',
        scene_id: 'sc_01',
        action_description: '손잡이를 천천히 돌린다',
        shot_type: 'CU',
        characters: ['hero'],
        location_ids: ['neon_market'],
        duration_seconds: 4,
        dialogue_lines: [{ character_id: 'hero', line: '누구지?' }],
        camera_config: { movement: 'push_in' },
        lighting_config: { color_temp: 3200 },
        prompt: 'rainy neon market',
      },
    ],
    [{ stage: 'writer', role: 'user', content: '조금 더 긴장감 있게', created_at: null }],
    {
      story: '원래 스토리',
      settings: { genre: '스릴러' },
      genre: null,
      cast: null,
      background: null,
      styleAnchor: null,
    },
  )

  expect(context).toEqual({
    previousRunId: 'run-previous',
    scenes: [
      {
        sceneId: 'sc_01',
        story: '주인공이 문을 연다',
        originalTextQuote: '문을 열었다',
        location: 'neon_market',
        timeOfDay: 'night',
        mood: 'tense',
        charactersPresent: ['hero'],
        estimatedDurationSeconds: 8,
      },
    ],
    shots: [
      {
        shotId: 'sh_01_01',
        sceneId: 'sc_01',
        story: '손잡이를 천천히 돌린다',
        shotType: 'CU',
        characters: ['hero'],
        locationIds: ['neon_market'],
        durationSeconds: 4,
        dialogueLines: [{ character_id: 'hero', line: '누구지?' }],
        cameraConfig: { movement: 'push_in' },
        lightingConfig: { color_temp: 3200 },
        prompt: 'rainy neon market',
      },
    ],
    chatHistory: [
      { stage: 'writer', role: 'user', content: '조금 더 긴장감 있게', createdAt: null },
    ],
    producerDecisions: {
      story: '원래 스토리',
      settings: { genre: '스릴러' },
      genre: null,
      cast: null,
      background: null,
      styleAnchor: null,
    },
  })
})
