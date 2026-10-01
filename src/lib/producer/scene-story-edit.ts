import { replaceSlugs } from '@/lib/script-lines'
import type { PreviewScene } from '@/lib/writer/use-writer-preview'

export interface SceneStoryDraft {
  sceneId: string
  text: string
  originalText: string
  originalBeats: string[]
}

export function createSceneStoryDraft(scenes: PreviewScene[], roster: { slug: string; name: string }[]): SceneStoryDraft[] {
  return scenes.map((scene) => {
    const text = replaceSlugs(scene.beats.join('\n'), roster, '')
    return { sceneId: scene.sceneId, text, originalText: text, originalBeats: [...scene.beats] }
  })
}

export function sceneStoryEdits(draft: SceneStoryDraft[]): { sceneId: string; beats: string[] }[] {
  return draft.map((scene) => ({
    sceneId: scene.sceneId,
    beats: scene.text === scene.originalText
      ? scene.originalBeats
      : scene.text.split('\n').map((line) => line.trim()).filter(Boolean),
  }))
}

export async function saveSceneStory(
  projectId: string,
  expectedUpdatedAt: string,
  scenes: { sceneId: string; beats: string[] }[],
  expectedStoryVersion?: string,
): Promise<{ ok: true } | { ok: false; reason: 'conflict' | 'failed' }> {
  try {
    const response = await fetch('/api/writer/scene-gate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, action: 'save', expectedUpdatedAt, expectedStoryVersion, scenes }),
    })
    if (!response.ok) return { ok: false, reason: response.status === 409 ? 'conflict' : 'failed' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
