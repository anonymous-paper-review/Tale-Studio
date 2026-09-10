// Writer·Director·Editor의 실제 본문 표시와 미리보기 설명이 같은 이름·언어 약속을 지킨다.
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  writer: {
    sceneManifest: {
      characters: [{ characterId: 'char', name: '쿄타로' }, { characterId: 'char_2', name: '코마츠' }],
      locations: [{ locationId: 'vending_machine_corner', name: '자판기 앞' }],
      scenes: [{ sceneId: 'scene_1', location: 'vending_machine_corner', mood: '', characterIds: ['char', 'char_2'] }],
    },
    shots: [{ shotId: 'shot_1', sceneId: 'scene_1', shotType: 'MS', actionDescription: 'char가 vending_machine_corner에서 char_2를 기다린다.', dialogueLines: [{ characterId: 'char', text: 'char_2, vending_machine_corner에서 만나.', delivery: 'char_2에게 조용히' }] }],
    loadProject: vi.fn(),
  },
}))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select({ projectId: 'project' }) }))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text }))
vi.mock('@/hooks/use-guarded-action', () => ({ useGuardedAction: () => ({ execute: vi.fn() }) }))
vi.mock('@/features/writer/writer-header', () => ({ WriterHeader: () => null }))
vi.mock('@/features/director/hooks/use-rough-storyboard', () => ({ useRoughStoryboard: () => null }))
vi.mock('@/lib/generation-queue', () => ({ useActiveGenerationJobs: () => [], activeShotIds: () => new Set() }))
vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: (select: (s: unknown) => unknown) => select({ projectId: 'project', generatingNodeIds: {}, generateStoryboardImage: vi.fn(), generateVideoForShot: vi.fn() }),
  getShotStage: () => 'rough', effectivePrompt: (d: { prompt: string }) => d.prompt,
}))
vi.mock('@xyflow/react', () => ({ NodeToolbar: () => null, Position: { Top: 'top' } }))
vi.mock('@/features/director/canvas-nodes/BaseNode', () => ({ BaseNode: ({ children }: { children: ReactNode }) => createElement('div', null, children) }))
vi.mock('@/features/director/canvas-nodes/LabeledHandle', () => ({ LabeledTargetHandle: () => null }))

import { DialogueView } from '@/features/writer/dialogue-view'
import { WriterStoryStream } from '@/features/writer/writer-story-stream'
import { WriterCharacterPanel } from '@/features/writer/writer-character-panel'
import { VideoSourcePanel } from '@/features/editor/video-source-panel'
import { ShotNode } from '@/features/director/canvas-nodes/ShotNode'

describe('실제 표시 컴포넌트의 본문을 확인한다', () => {
  it('Writer 대사 화면은 본문·대사·말투·장소를 등록된 이름으로 보여준다.', () => {
    const html = renderToStaticMarkup(createElement(DialogueView))
    expect(html).toContain('쿄타로가 자판기 앞에서 코마츠를 기다린다.')
    expect(html).toContain('코마츠, 자판기 앞에서 만나.')
    expect(html).toContain('코마츠에게 조용히')
    expect(html).not.toContain('vending_machine_corner')
    expect(html).not.toContain('char_2')
  })

  it('Writer 이야기 화면은 등록된 장소와 인물 이름을 보여준다.', () => {
    const html = renderToStaticMarkup(createElement(WriterStoryStream, { awaiting: true, preview: {
      started: true, running: true, completed: false, failed: false, characters: [],
      roster: [{ slug: 'char', name: '쿄타로' }, { slug: 'char_2', name: '코마츠' }, { slug: 'vending_machine_corner', name: '자판기 앞' }],
      scenes: [{ sceneId: 'scene_1', index: 0, beats: [data.writer.shots[0].actionDescription], shotStories: [] }],
    } }))
    expect(html).toContain('쿄타로가 자판기 앞에서 코마츠를 기다린다.')
  })

  it('Director 샷 카드도 등록된 장소와 인물 이름을 보여준다.', () => {
    const html = renderToStaticMarkup(createElement(ShotNode, { id: 'node_1', data: { kind: 'shot', label: 'Shot 1', writerShotId: 'shot_1', prompt: data.writer.shots[0].actionDescription, camera: {}, lighting: { position: 'front' }, referenceImages: [] }, selected: false } as never))
    expect(html).toContain('쿄타로가 자판기 앞에서 코마츠를 기다린다.')
  })

  it('Editor 소스 패널도 등록된 장소와 인물 이름을 보여준다.', () => {
    const noop = () => undefined
    const html = renderToStaticMarkup(createElement(VideoSourcePanel, {
      open: true, shots: data.writer.shots as never, videoClips: [], audioSources: [], onToggle: noop, onPreview: noop, onAddClip: noop,
      onAddClipAtPlayhead: noop, onAddAudioFromSource: noop, onAddAudioSource: noop, onRemoveAudioSource: noop, onBinDragStart: noop,
      onBinDragEnd: noop, onSetBinDropSec: noop,
    }))
    expect(html).toContain('쿄타로가 자판기 앞에서 코마츠를 기다린다.')
  })

  it('표시용 번역이 없으면 미리보기 카드가 원문을 보여주는 이유도 알려준다.', () => {
    const html = renderToStaticMarkup(createElement(WriterCharacterPanel, {
      characters: [{ id: 'char', name: '쿄타로', role: '', description: 'A student in a black uniform', descriptionFallback: true, portraitUrl: null, templateUrl: null }],
      worlds: [{ id: 'roof', name: '옥상', description: 'A school roof', descriptionFallback: true }],
    }))
    expect(html.match(/Translation is not available yet\. Showing the original description\./g)).toHaveLength(2)
  })
})
