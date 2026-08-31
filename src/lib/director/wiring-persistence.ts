// Director 수동 연결의 DB 직렬화(#wiring-persistence 2026-08-31).
//
// 문제: 노드 id(dn_*)는 기기-로컬 난수다. imageInputs/frameInputs/videoChainInputId 가
// 노드 id 를 담고 있어 localStorage 밖에서는 의미가 없었다 — 새 기기에서 연결 전멸
// (2026-08-28 실측). 그래서 DB에는 안정 식별자 기반 참조(StableWiringRef)로 저장하고,
// hydrate 시 현재 캔버스의 노드 id 로 되돌린다.
//
// 안정 키:
//   shot/shotImage → shots.shot_id (writerShotId)  ※ 파생 shotImage 는 부모 Shot 의 키 + kind 보존
//   video          → video_clips.id (videoClipId)
//   asset          → Artist 에셋 id (assetId)
// 안정 키가 없는 노드(수동 Shot, 미생성 테이크)는 직렬화 불가(null) — DB 행 자체가 없어
// 참조 대상이 될 수 없다. 그 연결은 종전대로 브라우저 저장에만 남는다(의도된 한계).

import {
  isAssetData,
  isShotData,
  isShotImageData,
  isVideoData,
  type DirectorNode,
  type VideoNodeData,
} from '@/types/director'

export type StableWiringRef =
  | { kind: 'shot'; shotId: string }
  | { kind: 'shotImage'; shotId: string }
  | { kind: 'video'; clipId: string }
  | { kind: 'asset'; assetId: string }

export type StableFrameInputs = {
  start: StableWiringRef | null
  end: StableWiringRef | null
  refs: StableWiringRef[]
}

export type StableVideoChain = {
  source_clip_id: string
  frame_url: string | null
}

/** 노드 id → 안정 참조. 안정 키가 없으면 null. */
export function serializeWiringRef(
  nodes: DirectorNode[],
  nodeId: string,
): StableWiringRef | null {
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return null
  const data = node.data
  if (isShotData(data)) {
    return data.writerShotId ? { kind: 'shot', shotId: data.writerShotId } : null
  }
  if (isShotImageData(data)) {
    const parent = nodes.find((n) => n.id === data.parentShotNodeId)
    return parent && isShotData(parent.data) && parent.data.writerShotId
      ? { kind: 'shotImage', shotId: parent.data.writerShotId }
      : null
  }
  if (isVideoData(data)) {
    return data.videoClipId ? { kind: 'video', clipId: data.videoClipId } : null
  }
  if (isAssetData(data)) {
    return { kind: 'asset', assetId: data.assetId }
  }
  return null
}

/** 안정 참조 → 현재 캔버스의 노드 id. 대상 노드가 (아직) 없으면 null. */
export function resolveWiringRef(
  nodes: DirectorNode[],
  ref: StableWiringRef,
): string | null {
  if (ref.kind === 'shot' || ref.kind === 'shotImage') {
    const shot = nodes.find(
      (n) => isShotData(n.data) && n.data.writerShotId === ref.shotId,
    )
    if (!shot) return null
    if (ref.kind === 'shot') return shot.id
    // 파생 shotImage 는 부모 Shot 기준으로 찾는다 (rebuild 가 만든 dn_simg_* 노드).
    const shotImage = nodes.find(
      (n) => isShotImageData(n.data) && n.data.parentShotNodeId === shot.id,
    )
    // 파생이 아직 없으면 부모 Shot 으로 폴백 — 이미지 해석 결과는 동일(부모의 실사 이미지).
    return shotImage?.id ?? shot.id
  }
  if (ref.kind === 'video') {
    const video = nodes.find(
      (n) => isVideoData(n.data) && n.data.videoClipId === ref.clipId,
    )
    return video?.id ?? null
  }
  const asset = nodes.find(
    (n) => isAssetData(n.data) && n.data.assetId === ref.assetId,
  )
  return asset?.id ?? null
}

export function serializeImageInputs(
  nodes: DirectorNode[],
  imageInputs: string[],
): StableWiringRef[] {
  const out: StableWiringRef[] = []
  const seen = new Set<string>()
  for (const id of imageInputs) {
    const ref = serializeWiringRef(nodes, id)
    if (!ref) continue
    const key = JSON.stringify(ref)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

export function resolveImageInputs(
  nodes: DirectorNode[],
  refs: StableWiringRef[],
): string[] {
  const resolved = refs
    .map((ref) => resolveWiringRef(nodes, ref))
    .filter((id): id is string => !!id)
  return [...new Set(resolved)]
}

export function serializeFrameInputs(
  nodes: DirectorNode[],
  frameInputs: VideoNodeData['frameInputs'],
): StableFrameInputs {
  return {
    start: frameInputs.start ? serializeWiringRef(nodes, frameInputs.start) : null,
    end: frameInputs.end ? serializeWiringRef(nodes, frameInputs.end) : null,
    refs: frameInputs.refs
      .map((id) => serializeWiringRef(nodes, id))
      .filter((ref): ref is StableWiringRef => !!ref),
  }
}

export function resolveFrameInputs(
  nodes: DirectorNode[],
  stable: StableFrameInputs,
): VideoNodeData['frameInputs'] {
  const refs = stable.refs
    .map((ref) => resolveWiringRef(nodes, ref))
    .filter((id): id is string => !!id)
  return {
    start: stable.start ? resolveWiringRef(nodes, stable.start) : null,
    end: stable.end ? resolveWiringRef(nodes, stable.end) : null,
    refs: [...new Set(refs)],
  }
}

/** DB jsonb 값 → StableWiringRef. 형태가 어긋나면 null (관대한 파싱 — 연결 하나 잃는 쪽이 throw 보다 낫다). */
export function parseWiringRef(value: unknown): StableWiringRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    (record.kind === 'shot' || record.kind === 'shotImage') &&
    typeof record.shotId === 'string' &&
    record.shotId
  ) {
    return { kind: record.kind, shotId: record.shotId }
  }
  if (record.kind === 'video' && typeof record.clipId === 'string' && record.clipId) {
    return { kind: 'video', clipId: record.clipId }
  }
  if (record.kind === 'asset' && typeof record.assetId === 'string' && record.assetId) {
    return { kind: 'asset', assetId: record.assetId }
  }
  return null
}

export function parseStableImageInputs(value: unknown): StableWiringRef[] {
  if (!Array.isArray(value)) return []
  return value
    .map(parseWiringRef)
    .filter((ref): ref is StableWiringRef => !!ref)
}

export function parseStableFrameInputs(value: unknown): StableFrameInputs | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return {
    start: parseWiringRef(record.start),
    end: parseWiringRef(record.end),
    refs: Array.isArray(record.refs)
      ? record.refs.map(parseWiringRef).filter((ref): ref is StableWiringRef => !!ref)
      : [],
  }
}

export function parseStableVideoChain(value: unknown): StableVideoChain | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.source_clip_id !== 'string' || !record.source_clip_id) return null
  return {
    source_clip_id: record.source_clip_id,
    frame_url: typeof record.frame_url === 'string' ? record.frame_url : null,
  }
}

/** 직렬화 결과가 비었는지 — 빈 연결은 DB에 null/[]로 남겨 노이즈를 줄인다. */
export function isEmptyStableFrameInputs(stable: StableFrameInputs): boolean {
  return !stable.start && !stable.end && stable.refs.length === 0
}
