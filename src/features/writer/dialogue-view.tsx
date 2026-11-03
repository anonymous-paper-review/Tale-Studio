'use client'

// Writer 대사 탭 (#dialogue-v4 2026-07-23) — 대본 뷰.
//   씬 → 샷 → 대사 라인을 대본처럼 나열하고, 상단 인물 칩을 선택하면 그 인물의 대사만
//   강조(나머지 흐림)한다. 데이터는 트리트먼트와 동일한 진실(shots.dialogueLines) —
//   이 뷰는 렌더 + 재생성 트리거만 담당한다.
//   "대사 생성/재생성" → POST /api/writer/dialogue (완료된 run state 기반 V4 재생성) → loadProject 리프레시.
//   대사 줄을 누르면 그 자리에서 글을 고친다(2026-11-02 오너 "탭 안에서 바로 고치기") — Enter · 바깥 누르기 = 저장, Esc = 취소.
//   고치는 칸은 저장된 글 그대로에서 시작한다(팝업의 대사 칸과 같다 — 인물 id 를 이름으로 바꾸는 것은 보기에만, 리뷰 R8).
//   저장은 샷 고치기 팝업과 같은 길(dialogue-line-save)이고 러프는 다시 그리지 않는다. 화자 · 줄 더하기 · 빼기는
//   샷마다 붙은 연필 단추가 여는 샷 고치기 팝업에서 한다(팝업은 러프 보드가 그린다 — 연 샷 id 만 board-ui-store 로 넘긴다).
//   샷 번호는 보드 카드와 같은 전체 번호(boardShots)다.
//   v3(2026-11-03 오너 "v3로 적용"): 화면 머리 · 알약 탭은 러프 보드와 같고, 인물 칩은 32px 알약, 씬마다 큰 내용 판(panel). 동작은 그대로.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MessageSquareText, Pencil, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WriterHeader } from '@/features/writer/writer-header'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { DialogueLineRow, type DialogueLineState } from '@/features/writer/dialogue-line-row'
import { saveShotDialogue, shotDialogueLines } from '@/features/writer/dialogue-line-save'
import { useGuardedAction } from '@/hooks/use-guarded-action'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { boardShots } from '@/lib/writer/board-summary'
import { commitLineEdit, revertLineEdit } from '@/lib/writer/dialogue-line-edit'
import { manifestEntities, resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import type { DialogueLine, Shot } from '@/types'
import { useT } from '@/lib/i18n'

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

type LineKey = string
const lineKey = (shotId: string, index: number): LineKey => `${shotId}#${index}`

interface LineDraft {
  shotId: string
  index: number
  /** 고치기 시작할 때의 그 줄 — 그새 바뀌었는지 볼 때와 [되돌리기]에 쓴다. */
  original: DialogueLine
  /** 고치는 글 — 저장된 글 그대로에서 시작한다(샷 고치기 창의 대사 칸과 같다, 리뷰 R8). */
  draft: string
}
interface LineSave extends LineDraft {
  status: 'saving' | 'failed'
  /** 저장하려던 글(한 줄로 다듬은 글). */
  saved: string
}

export function DialogueView() {
  const t = useT()
  const projectId = useProjectStore((state) => state.projectId)
  const sceneManifest = useWriterStore((state) => state.sceneManifest)
  const entityNames = useMemo(() => manifestEntities(sceneManifest), [sceneManifest])
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
        throw new Error(
          body?.error?.message ?? t('Dialogue generation failed ({status})', { status: res.status }),
        )
      }
      await loadProject()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Dialogue generation failed.'))
      throw e // 훅이 받아 채팅에도 사유를 남긴다(#double-fire) — 여기 빨간 줄은 탭을 떠나면 사라진다.
    } finally {
      setGenerating(false)
    }
  }

  // 클릭 즉시 잠금 + 1초 창(#double-fire). 대사 생성은 1~2분짜리라 연타가 특히 비싸다.
  const generate = useGuardedAction({
    actionKey: `writer:dialogue:${projectId ?? 'none'}`,
    stage: 'writer',
    label: t('Dialogue'),
    busy: generating,
    action: runGenerate,
  })

  // 보드 카드와 같은 전체 샷 번호(#shot-global-no) — 씬마다 1부터 다시 세지 않는다.
  const shotNoById = useMemo(
    () => new Map(boardShots(sceneManifest, shots).map((entry) => [entry.shot.shotId, entry.shotNo])),
    [sceneManifest, shots],
  )

  // ── 대사 줄 바로 고치기 ── 고치는 줄은 하나, 저장 중 · 실패한 줄은 따로 센다(저장을 기다리지 않고 다음 줄을 고친다).
  //   고치는 줄은 ref 에도 둔다 — Enter 로 끝낸 뒤 칸이 사라지며 오는 blur 가 같은 고침을 두 번 저장하지 않게.
  const [editing, setEditing] = useState<(LineDraft & { key: LineKey }) | null>(null)
  const editingRef = useRef<(LineDraft & { key: LineKey }) | null>(null)
  const [saves, setSaves] = useState<Record<LineKey, LineSave>>({})
  const rowRefs = useRef(new Map<LineKey, HTMLDivElement>())
  const [focusKey, setFocusKey] = useState<LineKey | null>(null)
  useEffect(() => {
    if (!focusKey) return
    rowRefs.current.get(focusKey)?.focus()
    setFocusKey(null)
  }, [focusKey])
  const setEditingLine = (next: (LineDraft & { key: LineKey }) | null) => {
    editingRef.current = next
    setEditing(next)
  }
  const dropSave = (key: LineKey) =>
    setSaves((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  const runSave = (key: LineKey, entry: LineSave, lines: DialogueLine[]) => {
    setSaves((prev) => ({ ...prev, [key]: { ...entry, status: 'saving' } }))
    saveShotDialogue(entry.shotId, lines).then(
      () => dropSave(key),
      () => setSaves((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], status: 'failed' } } : prev)),
    )
  }

  const startEdit = (shotId: string, index: number, line: DialogueLine) => {
    if (generate.locked) return
    const key = lineKey(shotId, index)
    // 저장 중 · 실패한 줄은 먼저 끝낸다([다시 저장] · [되돌리기]).
    if (saves[key]) return
    setEditingLine({ key, shotId, index, original: line, draft: line.text })
  }
  const commitEdit = (via: 'key' | 'blur') => {
    const current = editingRef.current
    if (!current) return
    setEditingLine(null)
    if (via === 'key') setFocusKey(current.key)
    const result = commitLineEdit({
      lines: shotDialogueLines(current.shotId) ?? [],
      index: current.index,
      original: current.original,
      draft: current.draft,
    })
    if (result.kind === 'unchanged') return
    if (result.kind === 'empty') {
      toast.info(t('Empty lines are not saved. To delete a line, open the shot editor with the pencil button.'))
      return
    }
    if (result.kind === 'conflict') {
      toast.info(t('This line changed while you were editing. Click it to edit again.'))
      return
    }
    runSave(current.key, { ...current, status: 'saving', saved: result.lines[current.index].text }, result.lines)
  }
  const cancelEdit = () => {
    const current = editingRef.current
    if (!current) return
    setEditingLine(null)
    setFocusKey(current.key)
  }
  // [다시 저장] — 화면에 남은 고친 글로 그 샷의 대사를 다시 저장한다(팝업의 다시 저장과 같은 길). 그새 그 줄이 바뀌었으면 덮어쓰지 않는다.
  const retrySave = (key: LineKey) => {
    const entry = saves[key]
    const lines = entry ? shotDialogueLines(entry.shotId) : null
    if (!entry || entry.status !== 'failed' || !lines) return
    if (lines[entry.index]?.text !== entry.saved) {
      dropSave(key)
      toast.info(t('This line changed while you were editing. Click it to edit again.'))
      return
    }
    runSave(key, entry, lines)
  }
  // [되돌리기] — 저장하지 못한 고침을 버리고 고치기 전 글로 돌린다(화면 값도 같은 길로 다시 저장).
  const revertSave = (key: LineKey) => {
    const entry = saves[key]
    if (!entry) return
    dropSave(key)
    setFocusKey(key)
    const reverted = revertLineEdit({ lines: shotDialogueLines(entry.shotId) ?? [], index: entry.index, original: entry.original, saved: entry.saved })
    if (reverted) void saveShotDialogue(entry.shotId, reverted).catch(() => {})
  }
  const lineState = (key: LineKey): DialogueLineState => {
    if (editing?.key === key) return { kind: 'editing', draft: editing.draft }
    const entry = saves[key]
    // 저장 중 · 실패한 줄도 보기처럼 이름으로 바꿔 보인다(저장값은 그대로).
    if (entry) return { kind: entry.status, draft: resolveEntityNames(entry.saved, entityNames) }
    return { kind: 'idle' }
  }

  const onGenerateClick = () => {
    // 이미 대사가 있으면 덮어쓰기 — 2단 확인 (차 있는 것 교체는 사람의 명시 행동, architecture §5).
    if (totalLines > 0 && !confirming) {
      setConfirming(true)
      return
    }
    generate.run()
  }

  return (
    <div className="flex h-full flex-col">
      <WriterHeader
        description={t('Dialogue viewer: select a character to highlight only their lines. Click a line to edit it right here')}
      />

      {/* 인물 칩 + 생성 버튼 */}
      <div className="flex flex-wrap items-center gap-1.5 px-7 pt-3">
        {/* 선택된 인물만 색을 갖는다(2026-07-31) — 아무도 선택 안 한 기본 상태는 전부 회색이라
            대본이 조용하고, 색은 "지금 보고 있는 인물"이라는 한 가지 뜻만 갖는다. */}
        {speakers.map((s) => {
          const active = selectedSpeaker === s.id
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedSpeaker(active ? null : s.id)}
              className={cn(
                'flex min-h-8 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1 text-label font-medium transition-colors',
                active
                  ? cn(s.color.chip, s.color.on)
                  : 'border-transparent bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {s.name}
              <span className="font-num text-meta opacity-70">{s.lineCount}</span>
            </button>
          )
        })}
        {speakers.length === 0 && (
          <span className="text-caption text-subtle-foreground">{t('No dialogue yet')}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {confirming && !generating && (
            <span className="text-caption text-subtle-foreground">
              {t('This rewrites the existing {count} dialogue lines. Press again to run', {
                count: totalLines,
              })}
            </span>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={onGenerateClick}
            disabled={generate.locked || !projectId}
            className={cn(
              'rounded-full px-3.5',
              confirming && 'bg-destructive/10 text-destructive hover:bg-destructive/15',
            )}
          >
            {generate.locked ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {generate.locked
              ? t('Writing dialogue… (1-2 min)')
              : totalLines > 0
                ? t('Regenerate dialogue')
                : t('Generate dialogue')}
          </Button>
        </div>
      </div>
      {error && (
        <p className="mx-7 mt-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-caption text-destructive">{error}</p>
      )}

      {/* 대본 본문 — 왼쪽 정렬(#c5 2026-08-03). 씬 판은 탭 영역 전체 폭을 쓰고 좌우 여백은 러프 보드 탭과 같다(px-7)
          — 2026-11-03 오너 QA "dialogue 탭 안 박스의 width 를 전체 섹션을 다 사용하게"(예전엔 가독 폭 max-w-3xl 에 묶었다). */}
      <ScrollArea className="min-h-0 flex-1">
        <TooltipProvider>
        <div className="w-full space-y-[18px] px-7 pb-7 pt-4">
          {scenes.length === 0 ? (
            <p className="py-16 text-center text-caption text-muted-foreground">
              {t('No scenes yet. The script will appear here once Writer generation finishes.')}
            </p>
          ) : (
            scenes.map((scene, sceneIdx) => {
              const sceneShots = shotsByScene.get(scene.sceneId) ?? []
              return (
                <section key={scene.sceneId} className="rounded-xl bg-panel px-5 py-4">
                  <h3 className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="font-num text-micro font-semibold text-foreground">Scene {sceneIdx + 1}</span>
                    <span className="text-body font-semibold text-foreground">
                      {resolveEntityNames(scene.location, entityNames)}
                    </span>
                    {scene.mood ? <span className="text-caption text-subtle-foreground">{scene.mood}</span> : null}
                  </h3>
                  <div className="flex flex-col gap-2.5">
                    {sceneShots.map((shot, shotIdx) => {
                      const lines = dialogueLinesOf(shot)
                      const shotNo = shotNoById.get(shot.shotId) ?? shotIdx + 1
                      const editShotLabel = t('Open the editor for shot {shot}', { shot: shotNo })
                      return (
                        <div key={shot.shotId} data-shot-id={shot.shotId} className="group -mx-2 rounded-md px-2 py-1">
                          {/* 글자 크기는 트리트먼트와 통일(#c5), 본문은 흰색(#c2 2026-08-03) —
                              muted 회색은 대본이 부차 정보처럼 읽혔다. 라벨(Shot N)만 muted 유지.
                              스토리는 러프에 그려지므로 여기서 고치지 않는다 — 연필 단추가 샷 고치기 창을 연다(프로토타입 대본 보기의 ✎). */}
                          <div className="flex items-start gap-2">
                            <p className="min-w-0 flex-1 text-sm leading-7 text-foreground">
                              <span className="mr-1.5 font-num text-micro font-semibold text-subtle-foreground">
                                Shot {shotNo}
                              </span>
                              {resolveEntityNames(shot.actionDescription, entityNames)}
                            </p>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  aria-label={editShotLabel}
                                  className="mt-0.5 text-subtle-foreground"
                                  onClick={() => useBoardUiStore.getState().setShotEditId(shot.shotId)}
                                >
                                  <Pencil />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{editShotLabel}</TooltipContent>
                            </Tooltip>
                          </div>
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
                                const key = lineKey(shot.shotId, i)
                                return (
                                  <DialogueLineRow
                                    key={i}
                                    rowRef={(element) => {
                                      if (element) rowRefs.current.set(key, element)
                                      else rowRefs.current.delete(key)
                                    }}
                                    rowClassName={cn(
                                      // 라인 바/배경 색은 선택된 인물의 대사에만 — 본문은 한 색으로.
                                      //   (#p1-quickwin W6: 화자 "이름"만은 상시 화자 색 — 스캔 가능성.)
                                      'rounded-sm border-l-2 py-1 pl-3 pr-2 transition-opacity hover:bg-accent/30',
                                      focused ? (color?.bar ?? 'border-l-border') : 'border-l-border',
                                      focused && (color?.on ?? 'bg-accent'),
                                      dimmed && 'opacity-30',
                                    )}
                                    speaker={speakerName}
                                    speakerClassName={
                                      line.characterId
                                        ? (color?.chip ?? 'text-foreground')
                                        : 'italic text-muted-foreground' // V.O./내레이션 구분
                                    }
                                    text={resolveEntityNames(line.text, entityNames)}
                                    delivery={line.delivery ? resolveEntityNames(line.delivery, entityNames) : undefined}
                                    label={t('Edit line {line} of shot {shot} ({speaker})', { line: i + 1, shot: shotNo, speaker: speakerName })}
                                    state={lineState(key)}
                                    disabled={generate.locked}
                                    focused={focused}
                                    onStart={() => startEdit(shot.shotId, i, line)}
                                    onDraftChange={(draft) => {
                                      const current = editingRef.current
                                      if (current?.key === key) setEditingLine({ ...current, draft })
                                    }}
                                    onCommit={(via) => commitEdit(via)}
                                    onCancel={cancelEdit}
                                    onRetry={() => retrySave(key)}
                                    onRevert={() => revertSave(key)}
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {sceneShots.length === 0 && (
                      <p className="text-caption text-subtle-foreground">{t('(no shots)')}</p>
                    )}
                  </div>
                </section>
              )
            })
          )}
          {scenes.length > 0 && totalLines === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <MessageSquareText className="size-6 text-subtle-foreground" />
              <p className="text-caption text-muted-foreground">
                {(() => {
                  const [l1, l2] = t(
                    'No shot dialogue yet. Press "Generate dialogue" above to design character voices{br}and write shot-by-shot dialogue that follows the scene.',
                  ).split('{br}')
                  return (
                    <>
                      {l1}
                      <br />
                      {l2}
                    </>
                  )
                })()}
              </p>
            </div>
          )}
        </div>
        </TooltipProvider>
      </ScrollArea>
    </div>
  )
}
