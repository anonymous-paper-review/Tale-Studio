'use client'

import { useQuery } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query-client'
import type { CameraConfig, CameraPreset, LightingConfig } from '@/types/shot'

// ============================================================================
// Camera/Light Preset Library — Director Canvas D-6 (decisions #46)
//
// zustand store(preset-storage-store) → TanStack Query 전환 1호 (2026-08-24).
// 옛 구조의 실사고: store 가 loadedProjectId 표식을 만들었지만 director/page.tsx 의
// useEffect 가 그 표식을 검사하지 않아, 캔버스에 들어갈 때마다 프리셋을 다시
// 가져왔다 — 오류 없이 조용히. 여기서는 "가져왔나/신선한가" 판단이 캐시 층으로
// 내려가므로 그 어긋남 자체가 성립하지 않는다.
//
// 쓰기(savePreset/deletePreset)와 명령형 읽기(findPresetInCache)는 훅이 아니라
// 일반 함수다 — 호출처가 드래그·드롭/클릭 핸들러라 훅 규칙 밖이고, zustand 시절
// getState() 호출과 같은 자리에 그대로 끼운다.
// ============================================================================

export type CameraLightPreset = {
  id: string
  name: string
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
}

type SavePresetInput = {
  projectId: string
  name: string
  camera: CameraConfig
  lighting: LightingConfig
  cameraPreset: CameraPreset
}

/** 캐시 칸 주소. 첫 원소가 계열, 둘째가 프로젝트 — 계열 전체를 한 번에 만질 때는
 *  앞부분 일치로 잡는다(deletePreset·findPresetInCache 가 그렇게 쓴다). */
export const presetsKey = (projectId: string) => ['director-presets', projectId] as const
const PRESETS_ROOT = ['director-presets'] as const

async function fetchPresets(projectId: string): Promise<CameraLightPreset[]> {
  const res = await fetch(`/api/director/presets?projectId=${encodeURIComponent(projectId)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { presets } = (await res.json()) as { presets: CameraLightPreset[] }
  return presets ?? []
}

/** 프로젝트의 프리셋 목록. 사용자가 저장/삭제할 때만 바뀌는 데이터라 5분간
 *  신선으로 본다 — 그 사이 재마운트는 네트워크 없이 캐시로 답한다. */
export function usePresets(projectId: string | null) {
  return useQuery({
    queryKey: presetsKey(projectId ?? ''),
    queryFn: () => fetchPresets(projectId ?? ''),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  })
}

/** 저장 성공 시 해당 프로젝트 칸 맨 앞에 붙인다(옛 store 의 [preset, ...s.presets] 동일).
 *  실패는 옛 동작 그대로 warn 만 하고 삼킨다 — 호출처가 팝업 저장 버튼이라 던지면 죽는다. */
export async function savePreset(input: SavePresetInput): Promise<void> {
  try {
    const res = await fetch('/api/director/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { preset } = (await res.json()) as { preset: CameraLightPreset }
    getQueryClient().setQueryData<CameraLightPreset[]>(
      presetsKey(input.projectId),
      (old) => [preset, ...(old ?? [])],
    )
  } catch (err) {
    console.warn('[preset-library] savePreset failed', err)
  }
}

/** 삭제 성공 시 모든 프리셋 칸에서 걷어낸다 — 호출처(PresetCard)가 projectId 를
 *  모르는 옛 시그니처를 유지하기 위해 계열 전체를 훑는다(칸은 프로젝트당 하나라 싸다). */
export async function deletePreset(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/director/presets?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    getQueryClient().setQueriesData<CameraLightPreset[]>(
      { queryKey: PRESETS_ROOT },
      (old) => old?.filter((p) => p.id !== id),
    )
  } catch (err) {
    console.warn('[preset-library] deletePreset failed', err)
  }
}

/** 드롭 핸들러용 명령형 읽기 — 옛 getState().presets.find 자리. 캐시에 이미 있는
 *  것만 본다(드래그 출발지가 PresetStrip 이므로 캐시에 반드시 있다). */
export function findPresetInCache(id: string): CameraLightPreset | undefined {
  for (const [, presets] of getQueryClient().getQueriesData<CameraLightPreset[]>({
    queryKey: PRESETS_ROOT,
  })) {
    const hit = presets?.find((p) => p.id === id)
    if (hit) return hit
  }
  return undefined
}
