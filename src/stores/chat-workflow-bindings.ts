import { createClient } from '@/lib/supabase/client'
import { createProjectWorkflow, type ProjectWorkflowSnapshot } from '@/lib/chat-tools/project-workflow'
import type { ToolOutcome, ToolResult } from '@/lib/chat-tools/protocol'
import { evaluateProducerGate } from '@/lib/producer-gate'
import { breakdownRows } from '@/lib/artist/breakdown'
import { splitBreakdownRows } from '@/features/series/artist-series'
import { readSeriesInfo } from '@/features/series/use-series-info'
import { contentLocale } from '@/lib/i18n/content'
import { hasNonRequestContext, withoutMediaGenerationProhibition } from '@/lib/handoff-intent'
import { parseProducerDraft, useProducerStore } from './producer-store'
import { useProjectStore, type WriterStatusAssets } from './project-store'
import { STAGES } from '@/lib/constants'
import type { StageId } from '@/types'

// 단계 순서 — 화면 흐름 그대로(Producer 시작 → Writer 씬 스토리 → 콘티 → Artist → Storyboard → Director → Editor, constants STAGES).
//   예전 표는 콘티가 없고 Storyboard(writer)가 Artist 앞이라, 저장 단계가 콘티인데 Storyboard 를 열 수 있다고 보고 화면에서만 열었다 —
//   그 뒤 넘김이 "이미 열렸다"며 단계를 저장하지 않았다(검토 rev-flow 2026-11-26 2번). 모르는 단계는 -1.
const stages: readonly string[] = STAGES.map((stage) => stage.id)
const at = (stage: string) => stages.indexOf(stage)

/** 현황 스냅샷의 화면 이름 표 — 순서 · 도구 대상 이름 ↔ 사용자가 보는 화면 이름. */
//   O1(오너 2026-11-26): Writer 는 산문 뒤에 콘티(rough storyboard, 저장 단계 conti)가 있고 그다음이 Artist 다.
const SCREEN_NAMES = {
  order: 'Producer (start) > Writer (prose, then rough storyboard) > Artist > Storyboard (scenes and shots) > Director > Editor',
  producer: 'Writer screen (prose)',
  conti: 'Writer screen (rough storyboard: scenes, shots and rough sketches)',
  writer: 'Storyboard screen (scenes and shots)',
  artist: 'Artist screen',
}

/** 옛 Producer 관문이 지금 화면 흐름에 없다는 것과 canHandoff 의 뜻 — 키는 시험이 못 박아 남기고 모델이 막힌 점으로 읽지 않게 적는다(리드 2026-11-14 H · D). */
const PRODUCER_NOTE = 'The old Producer readiness checklist (video style, sub-genre, tone, location purposes and similar) is not part of the current screens and blocks nothing, so do not report it as missing. canHandoff only decides whether the old Invite Writer approval can be offered from chat; it is not a requirement for any screen.'
const BREAKDOWN_NOTE = 'Counts of the breakdown list on the Artist screen (the people and backgrounds taken from the confirmed prose). These are list rows, not pictures.'
const PICTURES_NOTE = 'Finished pictures and picture cards, counted apart from the breakdown list. Report both, for example: 2 characters and 3 backgrounds in the list, 0 and 0 pictures drawn. Never call the picture counts the number of characters or backgrounds.'

/** 브레이크다운 목록의 인물 · 배경 수 — Artist 목록 머리의 "인물 N · 배경 M"과 같은 규칙(사물은 Artist 카드가 없어 빼고, 시리즈 보관 줄은 뺀다). */
function breakdownCounts(projectId: string, cast: Parameters<typeof breakdownRows>[0], backgrounds: Parameters<typeof breakdownRows>[1]) {
  const { shown } = splitBreakdownRows(breakdownRows(cast, backgrounds), readSeriesInfo(projectId, false).view)
  const characters = shown.filter(row => row.kind === 'person').length
  return { characters, backgrounds: shown.length - characters }
}

/** A conservative authorization check: tool selection alone does not grant permission. */
export function workflowPermission(message: string, action: string, target?: string): boolean {
  if (action === 'status') return true
  if (action !== 'resume') message = withoutMediaGenerationProhibition(message)
  if (hasNonRequestContext(message)) return false
  if (/(하지\s*마|말고|don't|do not)/i.test(message)) return false // i18n-ok: 사용자 요청 의도 인식.
  if (action === 'refresh') return /(새로|갱신|다시.*(?:불러|조회|확인)|refresh|reload)/i.test(message) // i18n-ok: 사용자 요청 의도 인식.
  if (action === 'resume') return /(재개해|이어서.*(?:실행해|생성해|진행해)|실행.*재시도해|^(?:please\s+)?resume\b|^(?:please\s+)?retry.*(?:run|generation))/i.test(message.replace(/"[^"]*"|“[^”]*”|`[^`]*`/g, '')) // i18n-ok: 사용자 요청 의도 인식.
  // 화면 이름(리뉴얼 1차 · 오너 2026-11-14): 도구 대상 producer 는 Writer 산문 화면, writer 는 Storyboard 화면이다 — 옛 낱말(producer · writer · 작가)은 그대로 두고 화면 이름을 더한다.
  const targetWords: Record<string, RegExp> = { producer: /(producer|프로듀서|writer|라이터|작가|prose|산문)/i, writer: /(writer|라이터|작가|storyboard|스토리보드)/i, artist: /(artist|아티스트)/i } // i18n-ok: 단계 이름 인식.
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
    const board = options.stage === 'producer' ? { settings: working.projectSettings, storyReady: working.storyReady, cast: working.cast, backgrounds: working.backgrounds, preserveScript: working.preserveScript } : saved
    // 옛 관문 판정은 canHandoff(옛 Invite Writer 승인 가부)에만 쓴다 — 항목은 막힌 점으로 내지 않는다.
    const gate = board ? evaluateProducerGate({ ...board, styleAnchorKey: project.data.style_anchor_key, locale: contentLocale() }) : null
    // 목록 수는 목록이 화면에 떠 있는 Writer · Artist 에서는 지금 작업 중인 목록, 다른 화면에서는 저장된 초안으로 센다.
    const live = (options.stage === 'producer' || options.stage === 'artist') && working.cast.length + working.backgrounds.length > 0 ? working : null
    const list = live ?? saved
    const breakdown = breakdownCounts(options.projectId, list?.cast ?? [], list?.backgrounds ?? [])
    const reached = String(project.data.current_stage ?? 'producer')
    // 새 프로젝트의 트리트먼트 초안(2026-10-02 시안 v04)은 아직 넘기지 않은 실행이다 — 넘긴 Writer 로 치지 않는다.
    const handedOff = status.started === true && status.draft !== true
    // 예전 흐름 실행 — 산문 확정 전에 넘겨(Invite Writer) 실행은 이어졌는데 저장 단계가 산문 화면(producer)까지에 멈춘 프로젝트.
    //   산문 확정(O1)은 저장 단계를 콘티로 먼저 올린 뒤 실행을 이어 가므로, 이어진 실행이 콘티 앞에 멈춰 있으면 예전 흐름이다.
    //   이 프로젝트만 지금처럼 Storyboard 를 열고 아래 navigate 가 단계 표시를 고친다.
    const legacyStuck = handedOff && at(reached) < at('conti')
    const allowed = ['producer']
    // Storyboard 는 Artist [완료하기]로 저장 단계가 Storyboard 이상일 때 연다(O1) — 실행이 이어졌다는 것만으로 열지 않는다.
    if (legacyStuck || at(reached) >= at('writer')) allowed.push('writer')
    if (at(reached) >= at('artist') && status.assets.images_ready) allowed.push('artist')
    last = {
      projectId: options.projectId, currentStage: useProjectStore.getState().currentStage, reachedStage: reached, allowedStages: allowed,
      // 키 이름은 시험이 못 박아 그대로 둔다 — blockers · softWarnings 는 지금 화면 흐름에 막힌 점이 없어 비어 있다(옛 관문 항목은 note 가 막힌 점이 아니라고 적는다).
      producer: { canHandoff: gate?.canHandoff ?? false, blockers: [], softWarnings: [], note: PRODUCER_NOTE, breakdown: { ...breakdown, note: BREAKDOWN_NOTE },
        working: options.stage === 'producer' ? { settings: working.projectSettings, storyReady: working.storyReady } : undefined,
        savedDraft: saved ? { settings: saved.settings, storyReady: saved.storyReady, savedAt: saved.savedAt } : null,
        committed: { settings: project.data.settings, storyPresent: !!project.data.story_text }, styleAnchorKey: project.data.style_anchor_key },
      // 키 이름은 시험이 못 박아 그대로 둔다 — writer 는 Storyboard 화면의 씬 · 샷 실행이고 산문 Writer 화면이 아니다(screens 표가 화면 이름을 말한다).
      writer: { started: handedOff, treatmentDraft: status.draft === true, status: status.current_status, stage: status.current_stage, error: status.error, completed: status.pipeline_completed, progress: status.progress_percent, savedScenes: scenes.count, savedShots: shots.count, note: 'This writer entry is the Storyboard screen scene and shot run, not the prose Writer screen. No execution record does not imply missing script. Saved scene and shot counts are independent of the execution history.' },
      // 서버가 준 숫자 키(chars_ready · chars_total …)는 그대로 두고, 그린 그림 수와 그림 카드 수를 목록 수와 따로 이름 붙여 더한다.
      artist: {
        ...status.assets,
        pictures: {
          characters: { drawn: status.assets.chars_ready, cards: status.assets.chars_total },
          backgrounds: { drawn: status.assets.worlds_ready, cards: status.assets.worlds_total },
          note: PICTURES_NOTE,
        },
      },
      // 화면 이름 표(리드 2026-11-14 D · H-3) — 위 키는 옛 이름이라 사용자가 보는 이름을 함께 준다.
      screens: SCREEN_NAMES,
    }
    return last
  }
  const refresh = async (state: ProjectWorkflowSnapshot) => {
    check()
    // Refresh readiness only. Never overwrite an unsaved card or start a pipeline.
    useProjectStore.getState().setArtistAssetGate(state.artist as unknown as WriterStatusAssets)
    // 화면은 저장 단계까지 연다(콘티 포함 순서 그대로) — 화면만 앞서 열면 넘김이 단계를 저장하지 않았다(검토 rev-flow 2번).
    if (at(state.reachedStage) >= 0) useProjectStore.getState().unlockThrough(state.reachedStage as StageId)
    // 예전 흐름 실행(저장 단계가 콘티 앞에 멈춤)만 지금처럼 Storyboard 까지 연다. 산문을 확정한 실행은 위 줄이 저장 단계(콘티 이후)까지 연다.
    if (state.writer.started && at(state.reachedStage) < at('conti')) useProjectStore.getState().unlockThrough('writer')
    // Writer 가 시작됐거나 DB 단계가 producer 를 넘었으면 Producer 는 잠긴다(2026-10-01).
    if (state.writer.started || at(state.reachedStage) > at('producer')) useProjectStore.getState().lockProducer()
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
        if (!current || at(current.current_stage) < at('writer')) return { status: 'unverified', message: 'Writer exists, but its saved stage could not be confirmed. Query again before opening.' }
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
