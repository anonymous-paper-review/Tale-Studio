// 일괄 영상 생성 스냅샷 — 시작 버튼을 누른 순간의 그림·설정을 요청으로 고정한다 (#batch-resume, 2026-09-09)
//
//   오너 결정: "처음 그림·설정대로 만들고 수정은 다음 요청에 반영" — 시작 시점의 노드 상태를 깊은 복사로
//   떼어내 서버에 넘기고, 그 뒤 사용자가 원본 노드를 계속 고쳐도 이미 만든 요청은 흔들리지 않는다.
//   프레임 해석은 director-store.ts의 regenerateVideo 요청 조립과 같은 계산(video-frame-inputs.ts 공용)을
//   쓰되, 한 가지만 다르다: store는 낡거나 못 찾는 수동 배선을 자동 그림으로 조용히 대체하지만, 이 스냅샷은
//   그렇게 하면 "사람이 고른 그림이 아닌 다른 그림"이 고정돼버리므로 그 샷을 skipped 로 빼는 쪽을 택한다.
import {
  isShotData,
  isVideoData,
  type DirectorNode,
  type VideoNodeData,
} from '@/types/director'
import { normalizeProvider } from '@/lib/video-models'
import {
  chainFrameMatchesSource,
  effectivePromptOf,
  normalizeFrameInputs,
  resolveFrameInputImageUrl,
  resolveShotFrameImageUrl,
  usableFrameImageUrl,
} from '@/lib/director/video-frame-inputs'

export type VideoBatchInputItem = {
  shotId: string
  request: Record<string, unknown>
}

export type VideoBatchInputSkip = {
  shotId: string
  reason: string
}

export type VideoBatchInputsResult = {
  items: VideoBatchInputItem[]
  skipped: VideoBatchInputSkip[]
}

/** director provider(kling/veo/local) → generate-video 라우트 provider(fal/local) 매핑. store와 동일 계약. */
function toRouteProvider(p: string): 'fal' | 'local' {
  return p === 'local' ? 'local' : 'fal'
}

function getChildVideos(nodes: readonly DirectorNode[], shotNodeId: string): DirectorNode[] {
  return nodes.filter(
    (n) => isVideoData(n.data) && n.data.parentShotNodeId === shotNodeId,
  )
}

function isPlayableCompleted(data: VideoNodeData): boolean {
  return data.status === 'completed' && !!usableFrameImageUrl(data.videoUrl)
}

function isManuallyWired(data: VideoNodeData): boolean {
  const frameInputs = normalizeFrameInputs(data.frameInputs)
  return (
    !!frameInputs.start ||
    !!frameInputs.end ||
    frameInputs.refs.length > 0 ||
    !!data.videoChainInputId
  )
}

/**
 * 아직 완성되지 않았고 사람이 배선한 take 중 가장 최근 것을 고른다.
 * takeNumber 큰 순 → 동률이면 createdAt 최신 순. 없으면 null(마더 설정 그대로).
 */
function pickActiveTake(nodes: readonly DirectorNode[], shotNodeId: string): (DirectorNode & { data: VideoNodeData }) | null {
  const candidates = getChildVideos(nodes, shotNodeId).filter(
    (n) => isVideoData(n.data) && !isPlayableCompleted(n.data) && isManuallyWired(n.data),
  ) as Array<DirectorNode & { data: VideoNodeData }>
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (a.data.takeNumber !== b.data.takeNumber) return b.data.takeNumber - a.data.takeNumber
    return (b.data.createdAt ?? '').localeCompare(a.data.createdAt ?? '')
  })
  return candidates[0]!
}

/**
 * 일괄 시작 순간의 영상 요청 목록을 JSON으로 고정한다. 서버가 검증·준비해 저장하면, 이후
 * 사용자가 캔버스 노드를 고쳐도 이 요청은 바뀌지 않는다(별도 스냅샷). idempotencyKey는
 * 서버가 저장 시 각 항목에 부여하므로 여기서는 만들지 않는다.
 */
export function buildVideoBatchInputs(
  projectId: string,
  nodes: readonly DirectorNode[],
  shotNodeIds: readonly string[],
): VideoBatchInputsResult {
  const items: VideoBatchInputItem[] = []
  const skipped: VideoBatchInputSkip[] = []

  for (const shotNodeId of shotNodeIds) {
    const shotNode = nodes.find((n) => n.id === shotNodeId)
    if (!shotNode || !isShotData(shotNode.data)) {
      skipped.push({ shotId: shotNodeId, reason: 'shot_not_found' })
      continue
    }
    const mother = shotNode.data
    const writerShotId = mother.writerShotId
    if (!writerShotId) {
      skipped.push({ shotId: shotNodeId, reason: 'missing_writer_shot_id' })
      continue
    }

    const take = pickActiveTake(nodes, shotNodeId)
    const override = take?.data.override ?? {}

    const chainInputId = take?.data.videoChainInputId ?? null
    const chainFrameUrl = usableFrameImageUrl(take?.data.videoChainFrameUrl ?? null)
    const chainSource = chainInputId ? nodes.find((n) => n.id === chainInputId) : null
    let manualUnresolved = false
    if (chainInputId) {
      const chainReady =
        !!chainSource &&
        isVideoData(chainSource.data) &&
        chainSource.data.status === 'completed' &&
        chainFrameMatchesSource(chainFrameUrl, chainSource.data)
      if (!chainReady) manualUnresolved = true
    }

    const frameInputs = normalizeFrameInputs(take?.data.frameInputs)
    const hasManualFrameInputs =
      !!frameInputs.start || !!frameInputs.end || frameInputs.refs.length > 0
    const storyboard = mother.storyboardImage
    const sbFrames = storyboard?.status === 'completed' ? storyboard.frames : undefined
    const automaticStart = resolveShotFrameImageUrl(mother, 'start')
    const automaticEnd = sbFrames ? resolveShotFrameImageUrl(mother, 'end') : null
    const automaticReferenceImageUrl =
      (storyboard?.status === 'completed' ? usableFrameImageUrl(storyboard.url) : null) ??
      resolveShotFrameImageUrl(mother, 'ref')

    let referenceImageUrls: string[] | undefined
    let referenceImageRoles: Array<'start' | 'end' | 'ref'> | undefined

    if (chainFrameUrl || hasManualFrameInputs || sbFrames) {
      let start: string | null = null
      if (chainFrameUrl) {
        start = chainFrameUrl
      } else if (frameInputs.start) {
        const resolved = resolveFrameInputImageUrl(nodes as DirectorNode[], frameInputs.start, 'start')
        if (!resolved) manualUnresolved = true
        start = resolved
      } else {
        start = automaticStart
      }

      const refs: string[] = []
      for (const sourceNodeId of frameInputs.refs) {
        const resolved = resolveFrameInputImageUrl(nodes as DirectorNode[], sourceNodeId, 'ref')
        if (!resolved) {
          manualUnresolved = true
          continue
        }
        refs.push(resolved)
      }

      let end: string | null = null
      if (frameInputs.end) {
        const resolved = resolveFrameInputImageUrl(nodes as DirectorNode[], frameInputs.end, 'end')
        if (!resolved) manualUnresolved = true
        end = resolved
      } else {
        end = automaticEnd
      }

      if (manualUnresolved) {
        skipped.push({ shotId: writerShotId, reason: 'unresolvable_manual_wiring' })
        continue
      }

      const urls: string[] = []
      const roles: Array<'start' | 'end' | 'ref'> = []
      if (start) {
        urls.push(start)
        roles.push('start')
      }
      for (const url of refs) {
        urls.push(url)
        roles.push('ref')
      }
      if (end) {
        urls.push(end)
        roles.push('end')
      }
      if (urls.length > 0) {
        referenceImageUrls = urls
        referenceImageRoles = roles
      }
    }

    if (manualUnresolved) {
      skipped.push({ shotId: writerShotId, reason: 'unresolvable_manual_wiring' })
      continue
    }

    const referenceImageUrl =
      referenceImageUrls?.find((url) => !!usableFrameImageUrl(url)) ??
      automaticReferenceImageUrl ??
      automaticStart ??
      null

    const prompt = override.prompt ?? effectivePromptOf(mother)
    const camera = override.camera ?? mother.camera
    const lighting = override.lighting ?? mother.lighting
    const cameraPreset = override.cameraPreset ?? mother.cameraPreset
    const provider = override.provider ?? mother.provider

    const request: Record<string, unknown> = {
      projectId,
      shotId: shotNode.id,
      writerShotId,
      prompt,
      camera,
      lighting,
      cameraPreset,
      aspectRatio: '16:9',
      generationMethod: referenceImageUrl ? 'I2V' : 'T2V',
      model: normalizeProvider(provider),
      provider: toRouteProvider(provider),
      durationSeconds: mother.durationSeconds,
      referenceImageUrl,
      // Director 배선 5: 배선하지 않은 일반 샷은 auto로 남겨 서버가 시작 시 DB 참조를 확정한다.
      frameSource: chainFrameUrl || hasManualFrameInputs ? 'manual' : 'auto',
      ...(referenceImageUrls ? { referenceImageUrls } : {}),
      ...(referenceImageUrls && referenceImageRoles ? { referenceImageRoles } : {}),
    }

    items.push({
      shotId: writerShotId,
      request: JSON.parse(JSON.stringify(request)) as Record<string, unknown>,
    })
  }

  return { items, skipped }
}
