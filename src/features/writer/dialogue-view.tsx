'use client'

// Writer 대사 탭 (#dialogue-v4 2026-07-23) — 대본 뷰.
//   씬 → 샷 → 대사 라인을 대본처럼 나열하고, 상단 인물 칩을 선택하면 그 인물의 대사만
//   강조(나머지 흐림)한다. 데이터는 트리트먼트와 동일한 진실(shots.dialogueLines) —
//   이 뷰는 렌더 + 재생성 트리거만 담당한다.
//   "대사 생성/재생성" → POST /api/writer/dialogue (완료된 run state 기반 V4 재생성) → loadProject 리프레시.

import { useMemo, useState } from 'react'
import { Loader2, MessageSquareText, RefreshCw } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WriterHeader } from '@/features/writer/writer-header'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import type { DialogueLine, Shot } from '@/types'

// 화자 칩/라인 색 — 등장 순서대로 순환 (chart 토큰과 무관한 대사 전용 4색).
const SPEAKER_COLORS = [
  { chip: 'border-amber-500/60 text-amber-600 dark:text-amber-400', bar: 'border-l-amber-500/70', on: 'bg-amber-500/10' },
  { chip: 'border-sky-500/60 text-sky-600 dark:text-sky-400', bar: 'border-l-sky-500/70', on: 'bg-sky-500/10' },
  { chip: 'border-violet-500/60 text-violet-600 dark:text-violet-400', bar: 'border-l-violet-500/70', on: 'bg-violet-500/10' },
  { chip: 'border-rose-500/60 text-rose-600 dark:text-rose-400', bar: 'border-l-rose-500/70', on: 'bg-rose-500/10' },
]

interface SpeakerInfo {
  id: string
  name: string
  lineCount: number
  color: (typeof SPEAKER_COLORS)[number]
}

function dialogueLinesOf(shot: Shot): DialogueLine[] {
  return Array.isArray(shot.dialogueLines) ? shot.dialogueLines : []
}

export function DialogueView() {
  const projectId = useProjectStore((state) => state.projectId)
  const sceneManifest = useWriterStore((state) => state.sceneManifest)
  const shots = useWriterStore((state) => state.shots)
  const loadProject = useWriterStore((state) => state.loadProject)

  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameById = useMemo(
    () => new Map((sceneManifest?.characters ?? []).map((c) => [c.characterId, c.name])),
    [sceneManifest],
  )

  // 등장 화자 집계 (대사가 있는 인물만 칩으로) — 색은 등장 순서 고정.
  const speakers = useMemo<SpeakerInfo[]>(() => {
    const counts = new Map<string, number>()
    for (const shot of shots) {
      for (const line of dialogueLinesOf(shot)) {
        if (!line.characterId) continue
        counts.set(line.characterId, (counts.get(line.characterId) ?? 0) + 1)
      }
    }
    return [...counts.entries()].map(([id, lineCount], i) => ({
      id,
      name: nameById.get(id) ?? id,
      lineCount,
      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
    }))
  }, [shots, nameById])

  const colorBySpeaker = useMemo(
    () => new Map(speakers.map((s) => [s.id, s.color])),
    [speakers],
  )

  const totalLines = useMemo(
    () => shots.reduce((a, s) => a + dialogueLinesOf(s).length, 0),
    [shots],
  )

  const scenes = sceneManifest?.scenes ?? []
  const shotsByScene = useMemo(() => {
    const map = new Map<string, Shot[]>()
    for (const shot of shots) {
      const arr = map.get(shot.sceneId) ?? []
      arr.push(shot)
      map.set(shot.sceneId, arr)
    }
    return map
  }, [shots])

  const runGenerate = async () => {
    if (!projectId || generating) return
    setGenerating(true)
    setConfirming(false)
    setError(null)
    try {
      const res = await fetch('/api/writer/dialogue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? `대사 생성 실패 (${res.status})`)
      }
      await loadProject()
    } catch (e) {
      setError(e instanceof Error ? e.message : '대사 생성에 실패했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  const onGenerateClick = () => {
    // 이미 대사가 있으면 덮어쓰기 — 2단 확인 (차 있는 것 교체는 사람의 명시 행동, architecture §5).
    if (totalLines > 0 && !confirming) {
      setConfirming(true)
      return
    }
    void runGenerate()
  }

  return (
    <div className="flex h-full flex-col">
      <WriterHeader description="대사 뷰어 — 인물을 선택하면 그 인물의 대사만 강조돼요" />

      {/* 인물 칩 + 생성 버튼 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2.5">
        {speakers.map((s) => {
          const active = selectedSpeaker === s.id
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedSpeaker(active ? null : s.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                s.color.chip,
                active ? s.color.on : 'hover:bg-accent',
              )}
            >
              {s.name}
              <span className="font-mono text-[10px] opacity-70">{s.lineCount}</span>
            </button>
          )
        })}
        {speakers.length === 0 && (
          <span className="text-xs text-muted-foreground">아직 대사가 없어요</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {confirming && !generating && (
            <span className="text-[11px] text-muted-foreground">
              기존 대사 {totalLines}개를 새로 씁니다 — 한 번 더 누르면 실행
            </span>
          )}
          <button
            type="button"
            onClick={onGenerateClick}
            disabled={generating || !projectId}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
              confirming && 'border-destructive/50 text-destructive',
            )}
          >
            {generating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {generating ? '대사 쓰는 중… (1~2분)' : totalLines > 0 ? '대사 재생성' : '대사 생성'}
          </button>
        </div>
      </div>
      {error && (
        <p className="border-b border-border bg-destructive/10 px-6 py-1.5 text-xs text-destructive">{error}</p>
      )}

      {/* 대본 본문 */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {scenes.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              씬이 아직 없어요 — writer 생성이 끝나면 여기에 대본이 나타나요.
            </p>
          ) : (
            scenes.map((scene, sceneIdx) => {
              const sceneShots = shotsByScene.get(scene.sceneId) ?? []
              return (
                <section key={scene.sceneId} className="mb-8">
                  <h3 className="mb-3 border-b border-border pb-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Scene {sceneIdx + 1}
                    <span className="ml-2 font-normal normal-case">
                      {scene.location}
                      {scene.mood ? ` · ${scene.mood}` : ''}
                    </span>
                  </h3>
                  <div className="flex flex-col gap-2.5">
                    {sceneShots.map((shot, shotIdx) => {
                      const lines = dialogueLinesOf(shot)
                      return (
                        <div key={shot.shotId} className="group">
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            <span className="mr-1.5 font-mono text-[10px] font-semibold text-muted-foreground/60">
                              Shot {shotIdx + 1}
                            </span>
                            {shot.actionDescription}
                          </p>
                          {lines.length > 0 && (
                            <div className="mt-1 flex flex-col gap-1 pl-4">
                              {lines.map((line, i) => {
                                const speakerName = line.characterId
                                  ? (nameById.get(line.characterId) ?? line.characterId)
                                  : 'V.O.'
                                const color = line.characterId
                                  ? colorBySpeaker.get(line.characterId)
                                  : undefined
                                const dimmed = !!selectedSpeaker && line.characterId !== selectedSpeaker
                                const focused = !!selectedSpeaker && line.characterId === selectedSpeaker
                                return (
                                  <div
                                    key={i}
                                    className={cn(
                                      'rounded-sm border-l-2 py-1 pl-3 pr-2 transition-opacity',
                                      color?.bar ?? 'border-l-border',
                                      focused && (color?.on ?? 'bg-accent'),
                                      dimmed && 'opacity-30',
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        'mr-2 font-mono text-[11px] font-semibold uppercase tracking-wide',
                                        focused ? undefined : 'text-muted-foreground',
                                      )}
                                    >
                                      {speakerName}
                                    </span>
                                    <span className={cn('text-sm', focused && 'font-medium')}>
                                      &ldquo;{line.text}&rdquo;
                                    </span>
                                    {line.delivery && (
                                      <span className="ml-2 text-[11px] text-muted-foreground">({line.delivery})</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {sceneShots.length === 0 && (
                      <p className="text-xs text-muted-foreground/60">(샷 없음)</p>
                    )}
                  </div>
                </section>
              )
            })
          )}
          {scenes.length > 0 && totalLines === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <MessageSquareText className="size-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                아직 샷 대사가 없어요 — 위의 &ldquo;대사 생성&rdquo;을 누르면 인물 어투를 설계하고
                <br />씬 흐름을 따라 샷 단위 대사를 써 드려요.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
