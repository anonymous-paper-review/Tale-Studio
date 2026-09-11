import { createClient } from '@/lib/supabase/client'
import { createProjectWorkflow, type ProjectWorkflowSnapshot } from '@/lib/chat-tools/project-workflow'
import type { ToolOutcome, ToolResult } from '@/lib/chat-tools/protocol'
import { evaluateProducerGate } from '@/lib/producer-gate'
import { contentLocale } from '@/lib/i18n/content'
import { hasNonRequestContext, withoutMediaGenerationProhibition } from '@/lib/handoff-intent'
import { parseProducerDraft, useProducerStore } from './producer-store'
import { useProjectStore, type WriterStatusAssets } from './project-store'
import type { StageId } from '@/types'

const stages = ['producer', 'writer', 'artist', 'director', 'editor']

/** A conservative authorization check: tool selection alone does not grant permission. */
export function workflowPermission(message: string, action: string, target?: string): boolean {
  if (action === 'status') return true
  if (action !== 'resume') message = withoutMediaGenerationProhibition(message)
  if (hasNonRequestContext(message)) return false
  if (/(하지\s*마|말고|don't|do not)/i.test(message)) return false // i18n-ok: 사용자 요청 의도 인식.
  if (action === 'refresh') return /(새로|갱신|다시.*(?:불러|조회|확인)|refresh|reload)/i.test(message) // i18n-ok: 사용자 요청 의도 인식.
  if (action === 'resume') return /(재개해|이어서.*(?:실행해|생성해|진행해)|실행.*재시도해|^(?:please\s+)?resume\b|^(?:please\s+)?retry.*(?:run|generation))/i.test(message.replace(/"[^"]*"|“[^”]*”|`[^`]*`/g, '')) // i18n-ok: 사용자 요청 의도 인식.
  const targetWords: Record<string, RegExp> = { producer: /(producer|프로듀서)/i, writer: /(writer|라이터|작가)/i, artist: /(artist|아티스트)/i } // i18n-ok: 단계 이름 인식.
  return !!target && !!targetWords[target]?.test(message) && /(열어|열기|가자|가줘|이동|넘겨|넘기|보여|호출|불러|핸드오프|open|go|move|hand.?over|take me|invite)/i.test(message) // i18n-ok: 사용자 요청 의도 인식.
}

export function createStudioWorkflow(options: {
  projectId: string; stage: string; message: string; signal: AbortSignal; isCurrent: () => boolean
  requiresEdit: boolean; outcomes: () => ToolOutcome[]
  navigate: (stage: StageId) => Promise<ToolResult>
  handoff: () => Promise<ToolResult>
}) {
  const check = () => { if (options.signal.aborted || !options.isCurrent()) throw new DOMException('Chat stopped', 'AbortError') }
  let last: ProjectWorkflowSnapshot | undefined
  let resumeResult: Promise<ToolResult> | undefined
  const read = async (): Promise<ProjectWorkflowSnapshot> => {
    check()
    const [project, response, scenes, shots] = await Promise.all([
      createClient().from('projects').select('id,current_stage,producer_draft,story_text,settings,style_anchor_key').eq('id', options.projectId).maybeSingle(),
      fetch(`/api/writer/status/${options.projectId}?assets=1&strict=1`, { signal: options.signal, cache: 'no-store' }),
      createClient().from('scenes').select('scene_id', { count: 'exact', head: true }).eq('project_id', options.projectId),
      createClient().from('shots').select('shot_id', { count: 'exact', head: true }).eq('project_id', options.projectId),
    ])
    check()
    if (project.error || !project.data) throw new Error(project.error?.message ?? 'Project could not be read.')
    if (scenes.error || shots.error || scenes.count === null || shots.count === null) throw new Error(scenes.error?.message ?? shots.error?.message ?? 'Saved scene and shot counts could not be read.')
    if (!response.ok) throw new Error(`Writer status could not be read (HTTP ${response.status}).`)
    const status = await response.json()
    check()
    if (typeof status.started !== 'boolean' || typeof status.assets?.images_ready !== 'boolean' || ['chars_ready', 'chars_total', 'worlds_ready', 'worlds_total', 'queued_count', 'failed_count'].some(key => typeof status.assets[key] !== 'number')) throw new Error('Writer readiness response is incomplete.')
    const saved = parseProducerDraft(project.data.producer_draft)
    const working = useProducerStore.getState()
    const board = options.stage === 'producer' ? { settings: working.projectSettings, storyReady: working.storyReady, cast: working.cast, backgrounds: working.backgrounds } : saved
    const gate = board ? evaluateProducerGate({ ...board, styleAnchorKey: project.data.style_anchor_key, locale: contentLocale() }) : null
    const reached = String(project.data.current_stage ?? 'producer')
    const allowed = ['producer']
    if (status.started || stages.indexOf(reached) >= stages.indexOf('writer')) allowed.push('writer')
    if (stages.indexOf(reached) >= stages.indexOf('artist') && status.assets.images_ready) allowed.push('artist')
    last = {
      projectId: options.projectId, currentStage: useProjectStore.getState().currentStage, reachedStage: reached, allowedStages: allowed,
      producer: { canHandoff: gate?.canHandoff ?? false, blockers: gate?.hardMissing.map(i => i.label) ?? ['Producer source has not been loaded.'], softWarnings: gate?.softMissing.map(i => i.label) ?? [],
        working: options.stage === 'producer' ? { settings: working.projectSettings, storyReady: working.storyReady } : undefined,
        savedDraft: saved ? { settings: saved.settings, storyReady: saved.storyReady, savedAt: saved.savedAt } : null,
        committed: { settings: project.data.settings, storyPresent: !!project.data.story_text }, styleAnchorKey: project.data.style_anchor_key },
      writer: { started: status.started, status: status.current_status, stage: status.current_stage, error: status.error, completed: status.pipeline_completed, progress: status.progress_percent, savedScenes: scenes.count, savedShots: shots.count, note: 'No execution record does not imply missing script. Saved scene and shot counts are independent of the execution history.' },
      artist: status.assets,
    }
    return last
  }
  const refresh = async (state: ProjectWorkflowSnapshot) => {
    check()
    // Refresh readiness only. Never overwrite an unsaved card or start a pipeline.
    useProjectStore.getState().setArtistAssetGate(state.artist as unknown as WriterStatusAssets)
    if (stages.includes(state.reachedStage)) useProjectStore.getState().unlockThrough(state.reachedStage as StageId)
    if (state.writer.started) useProjectStore.getState().unlockThrough('writer')
  }
  return createProjectWorkflow({
    read, refresh, isCurrent: () => options.isCurrent() && !options.signal.aborted,
    authorized: (action, target) => workflowPermission(options.message, action, target), outcomes: options.outcomes, requiresEdit: options.requiresEdit,
    navigate: async target => {
      if (last && target === 'writer' && last.reachedStage === 'producer' && last.writer.started) {
        // Repair only the stage marker after a confirmed existing start. A concurrent later stage wins.
        check()
        const saved = await createClient().from('projects').update({ current_stage: 'writer' }).eq('id', options.projectId).eq('current_stage', 'producer').select('current_stage').maybeSingle()
        check()
        if (saved.error) return { status: 'failed', message: `Writer exists, but its stage could not be saved: ${saved.error.message}` }
        const current = saved.data ?? (await createClient().from('projects').select('current_stage').eq('id', options.projectId).maybeSingle()).data
        check()
        if (!current || stages.indexOf(current.current_stage) < stages.indexOf('writer')) return { status: 'unverified', message: 'Writer exists, but its saved stage could not be confirmed. Query again before opening.' }
        last = { ...last, reachedStage: current.current_stage }
      }
      if (last) await refresh(last)
      check()
      return options.navigate(target as StageId)
    },
    handoff: options.handoff,
    resume: () => {
      // An uncertain submission is never replayed within the same request.
      resumeResult ??= (async (): Promise<ToolResult> => {
        try {
          check()
          const response = await fetch('/api/writer/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: options.projectId }), signal: options.signal })
          const result = await response.json()
          check()
          if (!response.ok) return { status: 'failed', message: result.error ?? `HTTP ${response.status}` }
          if (result.data?.action === 'noop') return { status: 'blocked', message: `Writer is ${result.data.status}; no work resumed.` }
          const state = await read()
          return ['running', 'completed'].includes(state.writer.status ?? '')
            ? { status: 'queued', message: 'The existing execution was accepted. This does not mean generation is complete.', state }
            : { status: 'unknown_result', message: 'Resume was submitted, but current execution could not be confirmed. Query status; do not resubmit.', state }
        } catch (error) { check(); return { status: 'unknown_result', message: String(error) } }
      })()
      return resumeResult
    },
  })
}
