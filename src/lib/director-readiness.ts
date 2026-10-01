// Director 진입 직전 샷별 준비 판정(#director-readiness 2026-10-01, 오너 "director 넘어갈 때 미완성 팝업").
//   프로토타입(tale-proto-v04 directorCheck)과 같은 기준 — 샷에 나오는 인물과 그 샷의 배경에 이미지가 있으면 준비된 샷,
//   없으면 이유(정보 부족 · 이미지 없음 · 만드는 중)를 단다. 러프 스토리보드는 판정에 넣지 않고 보여주기만 한다.
//   순수 함수 — 데이터 모으기는 director-readiness-loader(브라우저), 결정은 global-chat-store.

export interface ReadinessCharacter {
  characterId: string
  name: string
  entityType: 'person' | 'object'
  /** 기본 모습 이미지(시트)가 있는가 — Artist 게이트와 같은 기준(views.main). */
  hasImage: boolean
  generating: boolean
  /** 외형 설명이 있는가 — 없으면 이미지를 만들 재료가 없다. */
  hasInfo: boolean
}

export interface ReadinessLocation {
  locationId: string
  name: string
  hasImage: boolean
  generating: boolean
  hasInfo: boolean
}

export interface ReadinessScene {
  sceneId: string
  sortOrder: number
  locationId: string | null
  timeOfDay: string | null
}

export interface ReadinessShot {
  shotId: string
  sceneId: string
  sortOrder: number
  description: string
  characterIds: string[]
  /** 샷 자체의 배경. 비어 있으면 씬의 배경을 쓴다. */
  locationIds: string[]
  rough: { start: string; end: string } | null
}

export type ShotGapKind = 'info' | 'image' | 'generating'

export interface ShotGap {
  kind: ShotGapKind
  target: 'character' | 'background'
  id: string
  name: string
}

export interface ShotReadiness {
  shotId: string
  /** 씬 순서-샷 순서(1부터) — 화면에 보이는 샷 번호. */
  code: string
  description: string
  rough: { start: string; end: string } | null
  gaps: ShotGap[]
  ready: boolean
}

export interface SceneReadiness {
  sceneId: string
  sceneNumber: number
  locationName: string
  timeOfDay: string
  shots: ShotReadiness[]
}

export interface DirectorReadinessReport {
  scenes: SceneReadiness[]
  readyCount: number
  incompleteCount: number
}

function gapFor(
  target: ShotGap['target'],
  asset: { hasImage: boolean; generating: boolean; hasInfo: boolean; name: string },
  id: string,
): ShotGap | null {
  if (asset.hasImage) return null
  const kind: ShotGapKind = asset.generating ? 'generating' : asset.hasInfo ? 'image' : 'info'
  return { kind, target, id, name: asset.name }
}

export function classifyDirectorReadiness(input: {
  scenes: ReadinessScene[]
  shots: ReadinessShot[]
  characters: ReadinessCharacter[]
  locations: ReadinessLocation[]
}): DirectorReadinessReport {
  const characters = new Map(input.characters.map((c) => [c.characterId, c]))
  const locations = new Map(input.locations.map((l) => [l.locationId, l]))
  const orderedScenes = [...input.scenes].sort((a, b) => a.sortOrder - b.sortOrder)
  const scenes: SceneReadiness[] = []
  let readyCount = 0
  let incompleteCount = 0

  orderedScenes.forEach((scene) => {
    const shots = input.shots
      .filter((shot) => shot.sceneId === scene.sceneId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    if (shots.length === 0) return
    const sceneNumber = scenes.length + 1
    const sceneLocation = scene.locationId ? locations.get(scene.locationId) : undefined
    scenes.push({
      sceneId: scene.sceneId,
      sceneNumber,
      locationName: sceneLocation?.name ?? '',
      timeOfDay: scene.timeOfDay ?? '',
      shots: shots.map((shot, index) => {
        const gaps: ShotGap[] = []
        for (const id of new Set(shot.characterIds)) {
          const character = characters.get(id)
          // 사물은 Artist 게이트에서도 경고일 뿐이다 — 샷 준비를 막지 않는다.
          if (!character || character.entityType !== 'person') continue
          const gap = gapFor('character', character, id)
          if (gap) gaps.push(gap)
        }
        const locationId = shot.locationIds.find((id) => locations.has(id)) ?? scene.locationId
        const location = locationId ? locations.get(locationId) : undefined
        if (location && locationId) {
          const gap = gapFor('background', location, locationId)
          if (gap) gaps.push(gap)
        }
        const ready = gaps.length === 0
        if (ready) readyCount += 1
        else incompleteCount += 1
        return {
          shotId: shot.shotId,
          code: `${sceneNumber}-${index + 1}`,
          description: shot.description,
          rough: shot.rough,
          gaps,
          ready,
        }
      }),
    })
  })

  return { scenes, readyCount, incompleteCount }
}
