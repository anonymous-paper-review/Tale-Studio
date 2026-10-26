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
import { unresolvedSceneStoryProposal } from '@/lib/producer/scene-story-proposal'
import { previewedVariant } from '@/components/layout/scene-story-rewrite-card'
import { handedRunStopped, legacyGateWaiting, proseBusy, proseRunState, proseStartOffered } from '@/lib/prose/busy'
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
  const storyReady = useProducerStore((s) => s.storyReady)
  const savedScenes = useWriterStore((s) => s.sceneManifest?.scenes)
  const draftLive = !projectLocked && treatmentDraft
  const hasTreatment = projectLocked || treatmentDraft
  // 진행 상태는 넘기기 전 초안인지 아직 모를 때(새로 고침 직후)도 읽는다 — 읽기 전에는 [산문 쓰기]를 두지 않고,
  //   초안이면 쓰는 중으로 잠근다(디자이너 QA 1차 #07). 읽다 실패한 것도 읽은 것으로 본다(계속 잠겨 갇히지 않게).
  const { status, error: statusError, restart: restartStatus } = useWriterStatus(projectId)
  const statusRead = status !== null || statusError !== null
  const phase = hasTreatment ? sceneGatePhase(status) : 'before'
  const refreshKey = useGlobalChatStore((s) => s.sceneStoryRefresh)
  const showOriginal = preserveScript === true && storyText.trim().length > 0
  const { preview, failed: previewFailed } = useWriterPreview(projectId, { enabled: hasTreatment, refreshKey })
  const variantPick = useGlobalChatStore((s) => s.sceneStoryVariantPreview)
  const pending = useGlobalChatStore((s) => s.sceneStoryProposalPending)
  const session = useGlobalChatStore((s) => s.sceneStoryEdit)
  const editing = session?.projectId === projectId ? session : null
  const resolved = useGlobalChatStore((s) => s.sceneStoryResolved)

  // 적용 · 버린 수정안은 미리 보기를 다시 읽기 전이라도 내린다(디자이너 QA 1차 관찰 26) — 두 탭이 모두 이 값을 읽는다.
  const proposal = unresolvedSceneStoryProposal(preview?.sceneStoryProposal, resolved, projectId)
  // 바꿀 곳이 없었던 수정안(디자이너 QA 1차 #01)은 카드 없이 버리고 채팅에 알린다 — 채팅 탭에서는 오른쪽 채팅이 없어 여기서 한다.
  //   버리기가 실패하면(연결 끊김) 다음 미리 보기 때 다시 시도한다 — 보이지 않는 수정안이 산문 도구를 계속 잠그지 않게. 같은 수정안은 한 번만 보낸다.
  const unchangedProposalId = proposal?.status === 'failed' && proposal.error === 'scene_story_proposal_unchanged' ? proposal.id : null
  useEffect(() => {
    if (unchangedProposalId) void useGlobalChatStore.getState().settleUnchangedSceneStoryProposal(unchangedProposalId)
  }, [unchangedProposalId, preview])
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
  // 실행 기록(미리 보기)을 읽기 전에는 불러오는 중 — 저장된 씬 한 줄 요약이 산문 본문보다 먼저 보였다(디자이너 QA 1차 #09).
  //   v2 실행은 기록에 산문 본문이 없어 옛 프로젝트처럼 저장된 요약으로 본다.
  const run = proseRunState({ preview, previewFailed })
  const view = sceneStoryView({ preserveScript, storyText, locked: hasTreatment, streamed, saved, run })
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

  const busy = proseBusy({ draftLive, phase, statusRead, currentStage: status?.current_stage, proposal, requestPending })
  // [산문 쓰기]는 읽은 실행 상태 그대로 본다 — 초안인지 아직 모르는 동안에도 이미 시작한 실행이면 두지 않는다.
  const startOffered = proseStartOffered({ locked, storyReady, phase: sceneGatePhase(status), statusRead })
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

  // 예전 방식(리뉴얼 전)으로 넘겨 씬 스토리 확정을 기다리는 프로젝트 — 새 화면에서도 확정해 이어 간다.
  const legacyGate = legacyGateWaiting({ locked, phase, draftRun: status?.draft === true })
  // 산문을 넘긴 뒤 실행이 멈췄으면 멈춘 곳부터 이어서 다시 시도하게 한다(리뉴얼 1차 검토).
  const runStopped = handedRunStopped({ draftLive, phase })

  return {
    projectId,
    status,
    restartStatus,
    legacyGate,
    runStopped,
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
    startOffered,
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
