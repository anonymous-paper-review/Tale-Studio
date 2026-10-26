// 시리즈 다음 화의 서버 읽기(2026-10-26) — projects.series 와 앞 화 확정 산문. writer/start · 다시 쓰기 · 시리즈 정보 라우트가 같이 쓴다.
//   앞 화 산문은 매번 앞 화에서 다시 읽는다(저장해 두지 않는다). 같은 작업 공간의 앞 화만 읽는다 — 요금제는 보지 않는다
//   (다음 화를 만든 뒤 요금제를 내려도 이미 만든 다음 화는 계속 쓴다). 호출자가 이 프로젝트의 주인을 먼저 확인한다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getActiveRun } from '@/lib/writer/run-store'
import type { PipelineInput, VoiceProfile } from '@/lib/writer/types/pipeline'
import { proseTextOf, seriesPipelineInput } from './seed'
import { parseSeries, trimSeriesProse, type SeriesSnapshot } from './snapshot'

export interface SeriesContext {
  series: SeriesSnapshot
  /** 지금도 있는 앞 화 번호. 앞 화를 지웠거나 다른 작업 공간이면 null. */
  prevProjectId: string | null
  prevDeleted: boolean
}

/** 이 프로젝트가 시리즈 다음 화면 그 정보와 앞 화가 아직 있는지. 시리즈가 아니면 null. */
export async function loadSeriesContext(projectId: string): Promise<SeriesContext | null> {
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('series, reference_project_id, workspace_id')
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw new Error(`series load failed: ${error.message}`)
  const series = parseSeries(project?.series)
  if (!series) return null
  const refId = typeof project?.reference_project_id === 'string' ? project.reference_project_id : null
  if (!refId) return { series, prevProjectId: null, prevDeleted: true }
  const { data: prev, error: prevError } = await supabaseAdmin
    .from('projects')
    .select('id, workspace_id')
    .eq('id', refId)
    .maybeSingle()
  if (prevError) throw new Error(`series previous load failed: ${prevError.message}`)
  const alive = !!prev && prev.workspace_id === project?.workspace_id
  return { series, prevProjectId: alive ? refId : null, prevDeleted: !alive }
}

/** 앞 화 확정 산문(상한 안으로 줄인 것). 실행 기록이 없으면 저장된 씬 요약으로, 그것도 없으면 null. */
export async function loadPrevProse(prevProjectId: string): Promise<string | null> {
  const run = await getActiveRun(prevProjectId)
  const fromRun = proseTextOf(run?.state as Parameters<typeof proseTextOf>[0])
  if (fromRun.trim()) return trimSeriesProse(fromRun)
  const { data: scenes, error } = await supabaseAdmin
    .from('scenes')
    .select('sort_order, narrative_summary, narrative_summary_native')
    .eq('project_id', prevProjectId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`series previous scenes failed: ${error.message}`)
  const text = (scenes ?? [])
    .map((s) => (s.narrative_summary_native ?? s.narrative_summary ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
  return text ? trimSeriesProse(text) : null
}

export interface SeriesWriterInput {
  context: SeriesContext
  series: NonNullable<PipelineInput['series']>
  inheritedVoices: VoiceProfile[]
}

/** Writer 실행 입력의 시리즈 칸 — 시작 · 다시 시도 · [AI 다시 쓰기]가 매번 새로 읽는다. 시리즈가 아니면 null. */
export async function loadSeriesWriterInput(projectId: string): Promise<SeriesWriterInput | null> {
  const context = await loadSeriesContext(projectId)
  if (!context) return null
  const prose = context.prevProjectId ? await loadPrevProse(context.prevProjectId) : null
  return {
    context,
    series: seriesPipelineInput(context.series, prose),
    inheritedVoices: context.series.voices,
  }
}
