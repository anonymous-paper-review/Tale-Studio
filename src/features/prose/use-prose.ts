'use client'

// Writer 산문 작업공간의 공통 상태(리뉴얼 1차 2026-10-19). 화면 탭(1안)과 채팅 탭(2안)이 같은 산문 · 조건 · 진행을 읽는다.
//   산문의 진실은 Writer 실행 기록(미리 보기 라우트)이고, 조건 줄도 실행 기록의 조건을 읽는다.
import { useEffect, useRef } from 'react'
import { replaceSlugs } from '@/lib/script-lines'
import { useWriterPreview } from '@/lib/writer/use-writer-preview'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { sceneGatePhase } from '@/lib/writer/scene-gate'
import { sceneStoryView } from '@/lib/producer/scene-story'
import { treatmentDiff } from '@/lib/producer/scene-story-rewrite'
import { previewedVariant } from '@/components/layout/scene-story-rewrite-card'
import { proseBusy } from '@/lib/prose/busy'
import { proseTools } from '@/lib/prose/conditions'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

export function useProse() {
  const projectId = useProjectStore((s) => s.projectId)
  const projectLocked = useProjectStore((s) => s.producerLocked)
  const treatmentDraft = useProjectStore((s) => s.treatmentDraft)
  const preserveScript = useProducerStore((s) => s.preserveScript)
  const storyText = useProducerStore((s) => s.storyText)
  const projectSettings = useProducerStore((s) => s.projectSettings)
  const savedScenes = useWriterStore((s) => s.sceneManifest?.scenes)
  const draftLive = !projectLocked && treatmentDraft
  const hasTreatment = projectLocked || treatmentDraft
  const { status } = useWriterStatus(hasTreatment ? projectId : null)
  const phase = hasTreatment ? sceneGatePhase(status) : 'before'
  const refreshKey = useGlobalChatStore((s) => s.sceneStoryRefresh)
  const showOriginal = preserveScript === true && storyText.trim().length > 0
  const { preview } = useWriterPreview(projectId, { enabled: hasTreatment, refreshKey })
  const variantPick = useGlobalChatStore((s) => s.sceneStoryVariantPreview)
  const pending = useGlobalChatStore((s) => s.sceneStoryProposalPending)
  const session = useGlobalChatStore((s) => s.sceneStoryEdit)
  const editing = session?.projectId === projectId ? session : null

  const proposal = preview?.sceneStoryProposal ?? null
  const requestPending = pending?.projectId === projectId && pending.id === null
  const hasProposal = !!proposal || pending?.projectId === projectId
  const locked = projectLocked || preview?.proseLocked === true

  const roster = preview?.roster ?? []
  const sceneText = (beats: string[]) => replaceSlugs(beats.join(' '), roster, '')
  const streamed = (preview?.scenes ?? []).filter((scene) => scene.beats.length > 0).map((scene) => sceneText(scene.beats))
  const saved = [...(savedScenes ?? [])]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((scene) => scene.narrativeSummary?.trim() ?? '')
    .filter(Boolean)
  const view = sceneStoryView({ preserveScript, storyText, locked: hasTreatment, streamed, saved })
  const paragraphs = view.kind === 'scenes' ? view.paragraphs : []
  const hasProse = view.kind === 'scenes' ? paragraphs.length > 0 : view.kind === 'original'

  // 다시 쓰기 안 미리 보기 — 바뀐 문단만 이전 글 · 새 글을 함께 보인다.
  const currentScenes = (preview?.scenes ?? []).filter((scene) => scene.beats.length > 0).map((scene) => ({ sceneId: scene.sceneId, text: sceneText(scene.beats) }))
  const rewriting = !!proposal?.variants?.length
  const previewing = rewriting ? previewedVariant(proposal, variantPick) : null
  const proposalAfter = rewriting ? previewing?.after : proposal?.status === 'ready' ? proposal.after : undefined
  const diffRows = phase === 'gate' && proposalAfter && !(rewriting ? previewing?.stale : proposal?.stale)
    ? treatmentDiff(currentScenes, proposalAfter.filter((scene) => scene.beats.length > 0).map((scene) => ({ sceneId: scene.sceneId, text: sceneText(scene.beats) })))
    : null

  const busy = proseBusy({ draftLive, phase, currentStage: status?.current_stage, proposal, requestPending })
  const tools = proseTools({ preserved: showOriginal, locked, hasProse: hasProse && (phase === 'gate' || locked), busy: !!busy || !!editing || (hasProposal && !locked) })
  // 브레이크다운은 고르지 않은 수정안이 있으면 막는다(서버도 같은 규칙) — 산문이 쓰인 뒤라면 수정안을 정하고 누를 수 있다.
  const canBreakdown = locked ? hasProse : tools.breakdown && !hasProposal

  const conditions = preview?.proseConditions ?? {
    runtimeSeconds: projectSettings.playtime > 0 ? projectSettings.playtime : null,
    genre: projectSettings.genre?.trim() || null,
    seed: 'keep' as const,
  }

  // 산문이 만든 인물 · 장소를 Producer 목록으로 옮긴다 — Artist 의 브레이크다운 목록이 이 목록이다(확정 전까지 다시 맞춘다).
  const treatmentCast = preview?.treatmentCast
  useEffect(() => {
    if (!draftLive || phase !== 'gate' || !treatmentCast) return
    useProducerStore.getState().syncTreatmentCast(treatmentCast, treatmentCast.version)
  }, [draftLive, phase, treatmentCast])

  // 조건으로 다시 쓴 안을 적용 · 되돌리면 실행 기록의 조건이 바뀐다 — Producer 값(길이 · 장르)을 따라 맞춘다.
  //   맞추지 않으면 Artist [만들기]가 이어 갈 때 "산문을 쓴 바탕이 바뀌었다"며 막힌다(treatment-draft 규칙).
  const proseConditions = preview?.proseConditions
  const syncedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!draftLive || !proseConditions || preserveScript === true) return
    const key = `${projectId}:${proseConditions.runtimeSeconds}:${proseConditions.genre}`
    if (syncedRef.current === key) return
    syncedRef.current = key
    const settings = useProducerStore.getState().projectSettings
    const patch: { playtime?: number; genre?: string } = {}
    if (proseConditions.runtimeSeconds && proseConditions.runtimeSeconds !== settings.playtime) patch.playtime = proseConditions.runtimeSeconds
    if (proseConditions.genre && proseConditions.genre !== settings.genre) patch.genre = proseConditions.genre
    if (Object.keys(patch).length) useProducerStore.getState().updateSettings(patch)
  }, [draftLive, proseConditions, preserveScript, projectId])

  return {
    projectId,
    status,
    phase,
    preview,
    proposal,
    hasProposal,
    rewriting,
    previewing,
    diffRows,
    view,
    paragraphs,
    hasProse,
    preserved: showOriginal,
    locked,
    draftLive,
    busy,
    tools,
    canBreakdown,
    editing,
    conditions,
    changeLevel: preview?.changeLevel ?? null,
    format: projectSettings.format,
    sceneText,
  }
}

export type ProseState = ReturnType<typeof useProse>
