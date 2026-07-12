'use client'

// Artist New UI (실험) — 에셋·샷 보드.
//
// 위: 인물/배경 에셋 스트립(클릭=상세 팝업, 드래그=샷 카드에 참조 추가 — pointer-drag, HTML5 DnD 아님).
// 아래: 씬 순서대로 샷 카드(카메라 앵글·길이·스토리 + 상속된 인물/배경 칩. 칩 클릭=참조 해제).
// director 전단계의 "샷 ↔ 에셋 연결" 편집이 목적 — 인물은 shots.characters, 배경은 shots.location_ids(029).
import { useEffect, useMemo, useState } from 'react'
import { Redo2, Undo2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { startBinDrag } from '@/lib/pointer-drag'
import { useArtistStore } from '@/stores/artist-store'
import {
  useArtistBoardStore,
  effectiveLocationIds,
  type BoardShot,
} from '@/stores/artist-board-store'
import { useProjectStore } from '@/stores/project-store'
import { CharacterViewDialog } from '@/features/artist/character-view-dialog'
import { WorldViewDialog } from '@/features/artist/world-view-dialog'
import { SHOT_TYPE_DESCRIPTIONS } from '@/features/writer/shot-type-info'

const DROP_SELECTOR = '[data-shot-drop]'

export function AssetShotBoard() {
  const characterAssets = useArtistStore((s) => s.characterAssets)
  const worldAssets = useArtistStore((s) => s.worldAssets)
  // ⚠️ 셀렉터에서 `?.scenes ?? []` 금지 — null 매니페스트일 때 매 스냅샷 새 배열 → 무한 리렌더
  //   (Maximum update depth). 객체를 선택하고 파생은 렌더 로컬에서.
  const sceneManifest = useArtistStore((s) => s.sceneManifest)
  const scenes = useMemo(() => sceneManifest?.scenes ?? [], [sceneManifest])
  const projectId = useProjectStore((s) => s.projectId)

  const shots = useArtistBoardStore((s) => s.shots)
  const loading = useArtistBoardStore((s) => s.loading)
  const loadedProjectId = useArtistBoardStore((s) => s.loadedProjectId)
  const boardError = useArtistBoardStore((s) => s.error)
  const load = useArtistBoardStore((s) => s.load)
  const setShotCharacters = useArtistBoardStore((s) => s.setShotCharacters)
  const setShotLocationIds = useArtistBoardStore((s) => s.setShotLocationIds)
  const undo = useArtistBoardStore((s) => s.undo)
  const redo = useArtistBoardStore((s) => s.redo)
  const canUndo = useArtistBoardStore((s) => s.past.length > 0)
  const canRedo = useArtistBoardStore((s) => s.future.length > 0)

  const [hoverShotId, setHoverShotId] = useState<string | null>(null)
  const [dlgCharId, setDlgCharId] = useState<string | null>(null)
  const [dlgWorldId, setDlgWorldId] = useState<string | null>(null)
  // 드래그 중엔 hover 가 벗어나도 스트립을 펼친 채 고정 — 접히면서 카드가 위로 밀리면 드롭 좌표가 어긋난다.
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    if (projectId && loadedProjectId !== projectId) void load()
  }, [projectId, loadedProjectId, load])

  // undo/redo 키보드 오버로드 — Ctrl/Cmd+Z(취소) · Ctrl/Cmd+Shift+Z 또는 Ctrl/Cmd+Y(재실행).
  //   입력 필드(채팅 textarea 등) 포커스 중엔 네이티브 텍스트 undo 를 방해하지 않는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        void undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        void redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const charById = useMemo(
    () => new Map(characterAssets.map((c) => [c.characterId, c])),
    [characterAssets],
  )
  const worldById = useMemo(
    () => new Map(worldAssets.map((w) => [w.locationId, w])),
    [worldAssets],
  )
  const sceneById = useMemo(() => new Map(scenes.map((s) => [s.sceneId, s])), [scenes])

  // 씬 순서 그룹핑 — sceneManifest 순서 유지 + 소속 씬이 없는 샷은 말미 "(씬 미지정)".
  const groups = useMemo(() => {
    const known = scenes
      .map((scene) => ({
        scene,
        shots: shots.filter((sh) => sh.sceneId === scene.sceneId),
      }))
      .filter((g) => g.shots.length > 0)
    const orphan = shots.filter((sh) => !sceneById.has(sh.sceneId))
    return { known, orphan }
  }, [scenes, shots, sceneById])

  // 드롭 → 참조 추가 (중복 no-op). 배경은 유효값(상속 포함)을 명시 배열로 물질화한 뒤 덧붙인다.
  const dropAsset = (kind: 'character' | 'world', assetId: string, shotId: string) => {
    const shot = shots.find((s) => s.shotId === shotId)
    if (!shot) return
    if (kind === 'character') {
      if (shot.characters.includes(assetId)) return
      void setShotCharacters(shotId, [...shot.characters, assetId])
    } else {
      const eff = effectiveLocationIds(shot, sceneById.get(shot.sceneId)?.location)
      if (eff.ids.includes(assetId)) return
      void setShotLocationIds(shotId, [...eff.ids, assetId])
    }
  }

  const dragChip = (
    e: React.PointerEvent,
    kind: 'character' | 'world',
    assetId: string,
    label: string,
  ) => {
    startBinDrag({
      event: e,
      label,
      dropSelector: DROP_SELECTOR,
      onClick: () =>
        kind === 'character' ? setDlgCharId(assetId) : setDlgWorldId(assetId),
      onDragStart: () => setDragActive(true),
      onDragOver: (target) =>
        setHoverShotId(target ? ((target as HTMLElement).dataset.shotId ?? null) : null),
      onDragEnd: () => {
        setDragActive(false)
        setHoverShotId(null)
      },
      onDrop: ({ target }) => {
        const shotId = (target as HTMLElement).dataset.shotId
        if (shotId) dropAsset(kind, assetId, shotId)
      },
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── 상단: 에셋 스트립 — 평소엔 요약 한 줄, hover(또는 드래그 중)에 아래로 펼쳐져 그림 표시 ── */}
      <div className="group border-b border-border px-6 py-2">
        <div className="flex h-8 items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">에셋</span>
          <Badge variant="secondary" className="text-[10px]">
            인물 {characterAssets.length}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            배경 {worldAssets.length}
          </Badge>
          <span className="truncate">
            — 마우스를 올리면 펼쳐집니다 · 드래그해 샷에 연결, 카드의 칩 클릭으로 해제
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="실행 취소 (Ctrl+Z)"
              disabled={!canUndo}
              onClick={() => void undo()}
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="다시 실행 (Ctrl+Shift+Z / Ctrl+Y)"
              disabled={!canRedo}
              onClick={() => void redo()}
            >
              <Redo2 className="size-3.5" />
            </Button>
          </div>
        </div>
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            dragActive
              ? '[grid-template-rows:1fr]'
              : '[grid-template-rows:0fr] group-hover:[grid-template-rows:1fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="flex items-start gap-8 overflow-x-auto pb-2 pt-3 scrollbar-thin">
              <AssetGroup label="인물">
                {characterAssets.map((c) => (
                  <AssetCard
                    key={c.characterId}
                    name={c.name}
                    imageUrl={c.portrait ?? c.views.main}
                    aspect="portrait"
                    onPointerDown={(e) => dragChip(e, 'character', c.characterId, c.name)}
                  />
                ))}
                {characterAssets.length === 0 && <EmptyNote>인물 없음</EmptyNote>}
              </AssetGroup>
              <AssetGroup label="배경">
                {worldAssets.map((w) => (
                  <AssetCard
                    key={w.locationId}
                    name={w.name}
                    imageUrl={w.wideShot}
                    aspect="video"
                    onPointerDown={(e) => dragChip(e, 'world', w.locationId, w.name)}
                  />
                ))}
                {worldAssets.length === 0 && <EmptyNote>배경 없음</EmptyNote>}
              </AssetGroup>
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단: 씬별 샷 카드 ── */}
      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-4 scrollbar-thin">
        {boardError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {boardError}
          </div>
        )}
        {shots.length === 0 && !loading && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            아직 샷이 없어요 — Writer 파이프라인이 샷을 만들면 이곳에서 에셋을 연결할 수
            있습니다.
          </p>
        )}
        {groups.known.map(({ scene, shots: sceneShots }, si) => (
          <section key={scene.sceneId}>
            <header className="mb-3 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">Scene {si + 1}</h2>
              {scene.timeOfDay && (
                <Badge variant="outline" className="text-[10px]">
                  {scene.timeOfDay}
                </Badge>
              )}
              <span className="truncate text-xs text-muted-foreground">
                {scene.narrativeSummary}
              </span>
            </header>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
              {sceneShots.map((shot, ki) => (
                <ShotCard
                  key={shot.shotId}
                  shot={shot}
                  index={ki}
                  sceneLocation={scene.location}
                  highlight={hoverShotId === shot.shotId}
                  charById={charById}
                  worldById={worldById}
                  onRemoveCharacter={(id) =>
                    void setShotCharacters(
                      shot.shotId,
                      shot.characters.filter((c) => c !== id),
                    )
                  }
                  onRemoveLocation={(id) => {
                    const eff = effectiveLocationIds(shot, scene.location)
                    void setShotLocationIds(
                      shot.shotId,
                      eff.ids.filter((l) => l !== id),
                    )
                  }}
                />
              ))}
            </div>
          </section>
        ))}
        {groups.orphan.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">(씬 미지정)</h2>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
              {groups.orphan.map((shot, ki) => (
                <ShotCard
                  key={shot.shotId}
                  shot={shot}
                  index={ki}
                  sceneLocation={undefined}
                  highlight={hoverShotId === shot.shotId}
                  charById={charById}
                  worldById={worldById}
                  onRemoveCharacter={(id) =>
                    void setShotCharacters(
                      shot.shotId,
                      shot.characters.filter((c) => c !== id),
                    )
                  }
                  onRemoveLocation={(id) => {
                    const eff = effectiveLocationIds(shot, undefined)
                    void setShotLocationIds(
                      shot.shotId,
                      eff.ids.filter((l) => l !== id),
                    )
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 에셋 클릭 상세 — 기존 다이얼로그 재사용 */}
      <CharacterViewDialog
        charId={dlgCharId}
        view={dlgCharId ? 'main' : null}
        onClose={() => setDlgCharId(null)}
      />
      <WorldViewDialog
        locationId={dlgWorldId}
        shot={dlgWorldId ? 'wideShot' : null}
        onClose={() => setDlgWorldId(null)}
      />
    </div>
  )
}

function AssetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="shrink-0">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex gap-3">{children}</div>
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="self-center text-xs text-muted-foreground">{children}</p>
}

function AssetCard({
  name,
  imageUrl,
  aspect,
  onPointerDown,
}: {
  name: string
  imageUrl: string | null | undefined
  aspect: 'portrait' | 'video'
  onPointerDown: (e: React.PointerEvent) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      title={`${name} — 클릭: 상세 / 드래그: 샷에 연결`}
      className={cn(
        'shrink-0 cursor-grab touch-none select-none active:cursor-grabbing',
        // 배경(landscape)은 한 단계 크게 — 와이드샷 디테일이 보이는 사이즈(#2).
        aspect === 'portrait' ? 'w-24' : 'w-44',
      )}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-lg border border-border bg-muted',
          aspect === 'portrait' ? 'aspect-[3/4]' : 'aspect-video',
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-lg text-muted-foreground">
            {name.slice(0, 1)}
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-center text-xs">{name}</p>
    </div>
  )
}

function ShotCard({
  shot,
  index,
  sceneLocation,
  highlight,
  charById,
  worldById,
  onRemoveCharacter,
  onRemoveLocation,
}: {
  shot: BoardShot
  index: number
  sceneLocation: string | undefined
  highlight: boolean
  charById: Map<string, { name: string; portrait?: string | null; views: { main: string | null } }>
  worldById: Map<string, { name: string; wideShot: string | null }>
  onRemoveCharacter: (id: string) => void
  onRemoveLocation: (id: string) => void
}) {
  const eff = effectiveLocationIds(shot, sceneLocation)
  return (
    <div
      data-shot-drop
      data-shot-id={shot.shotId}
      className={cn(
        'rounded-xl border border-border bg-card p-3 transition-colors',
        highlight && 'border-primary ring-2 ring-primary/50',
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-mono text-xs font-semibold">Shot {index + 1}</span>
        <Badge
          variant="secondary"
          className="text-[10px]"
          title={SHOT_TYPE_DESCRIPTIONS[shot.shotType] ?? shot.shotType}
        >
          {shot.shotType}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {shot.durationSeconds}s
        </span>
      </div>

      <p className="mb-2.5 line-clamp-3 min-h-8 text-xs text-foreground/80" title={shot.description}>
        {shot.description || '(설명 없음)'}
      </p>

      {/* 인물 참조 */}
      <RefRow label="인물">
        {shot.characters.map((id) => {
          const c = charById.get(id)
          return (
            <RefChip
              key={id}
              name={c?.name ?? id}
              imageUrl={c ? (c.portrait ?? c.views.main) : null}
              onRemove={() => onRemoveCharacter(id)}
            />
          )
        })}
        {shot.characters.length === 0 && <EmptyNote>없음</EmptyNote>}
      </RefRow>

      {/* 배경 참조 — 상속(씬)분은 점선 표시 */}
      <RefRow label="배경">
        {eff.ids.map((id) => {
          const w = worldById.get(id)
          return (
            <RefChip
              key={id}
              name={w?.name ?? id}
              imageUrl={w?.wideShot ?? null}
              inherited={eff.inherited}
              onRemove={() => onRemoveLocation(id)}
            />
          )
        })}
        {eff.ids.length === 0 && <EmptyNote>없음</EmptyNote>}
      </RefRow>
    </div>
  )
}

function RefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex items-start gap-2">
      <span className="w-7 shrink-0 pt-1 text-[10px] text-muted-foreground">{label}</span>
      <div className="flex min-h-7 flex-1 flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

function RefChip({
  name,
  imageUrl,
  inherited,
  onRemove,
}: {
  name: string
  imageUrl: string | null
  inherited?: boolean
  onRemove: () => void
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      title={inherited ? `${name} (씬에서 상속) — 클릭하면 참조 해제` : `${name} — 클릭하면 참조 해제`}
      className={cn(
        'group flex items-center gap-1.5 rounded-full border bg-background py-0.5 pl-0.5 pr-2 text-xs transition-colors',
        inherited ? 'border-dashed border-border' : 'border-border',
        'hover:border-destructive/60 hover:bg-destructive/10',
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="size-6 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px]">
          {name.slice(0, 1)}
        </span>
      )}
      <span className="max-w-24 truncate">{name}</span>
      <X className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
