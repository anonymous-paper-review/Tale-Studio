'use client'

// Writer 탭 — read-only 스크립트 뷰어.
//   씬 단위 블록: 씬 헤딩(클릭=@L 멘션) → 스토리 비트(읽기 본문, primary) → 샷 섹션(접힘, 클릭=@L).
//   직접 편집은 없다 — 수정은 @L 라인 클릭으로 채팅에 지시한다.

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, FileText, Loader2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WriterHeader } from '@/features/writer/writer-header'
import { buildScriptLines, replaceSlugs, type ScriptLine, type SlugEntry } from '@/lib/script-lines'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { friendlyStageLabel } from '@/lib/writer/stage-labels'
import { cn } from '@/lib/utils'
import type { Scene } from '@/types'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useWriterUiStore } from '@/stores/writer-ui-store'

// 라벨 없는 헤딩 텍스트 컬럼과 정렬시키는 들여쓰기 (px-6 + w-16 라벨열 + gap-4).
const TEXT_INDENT = 'pl-[6.5rem] pr-6'

// 표시 전용 변환(#c13): 인라인 본문의 슬러그(dr_lee·location_2 등) → @실제이름,
//   구조 필드(씬 헤딩 장소·화자명)는 플레인 이름. 멘션 ref·채팅 컨텍스트·데이터는 원문 유지.
type Roster = SlugEntry[]

function ScriptLineText({ line, roster }: { line: ScriptLine; roster: Roster }) {
  if (line.kind === 'sceneHeading') {
    return (
      <span className="font-semibold uppercase tracking-wide text-foreground">
        {replaceSlugs(line.text, roster, '')}
      </span>
    )
  }
  if (line.kind === 'dialogue') {
    return (
      <span className="block">
        <span className="font-medium">
          {replaceSlugs(line.characterName ?? '인물', roster, '')}
        </span>
        : &quot;{replaceSlugs(line.text, roster)}&quot;
      </span>
    )
  }
  return <span>{replaceSlugs(line.text, roster)}</span>
}

function ScriptLineButton({
  line,
  label,
  mentioned,
  roster,
  onToggle,
}: {
  line: ScriptLine
  /** 좌측 컬럼 표시 라벨 — Scene N / Shot N / 대사 (#c11, 내부 ref는 L# 유지) */
  label: string
  mentioned: boolean
  roster: Roster
  onToggle: (lineNo: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(line.lineNo)}
      aria-pressed={mentioned}
      className={cn(
        'hover-red-beam flex w-full items-start gap-4 px-6 py-1.5 text-left text-sm leading-7 transition-colors [content-visibility:auto] hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring/50',
        mentioned && 'bg-sky-400/10 ring-1 ring-inset ring-sky-400/60 hover:bg-sky-400/15',
      )}
    >
      <span className="w-16 shrink-0 pt-px font-mono text-xs tabular-nums tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words text-foreground">
        <ScriptLineText line={line} roster={roster} />
      </span>
    </button>
  )
}

function SceneBeats({ scene, roster }: { scene: Scene; roster: Roster }) {
  const summary = scene.narrativeSummary?.trim()
  const quote = scene.originalTextQuote?.trim()
  if (!summary && !quote) {
    return (
      <p className={cn(TEXT_INDENT, 'pb-1 pt-0.5 text-sm italic text-muted-foreground/70')}>
        스토리 텍스트 없음
      </p>
    )
  }
  return (
    <div className={cn(TEXT_INDENT, 'space-y-2 pb-1 pt-0.5')}>
      {summary ? (
        <p className="text-xs text-muted-foreground">{replaceSlugs(summary, roster)}</p>
      ) : null}
      {quote ? (
        <p className="max-w-[68ch] text-[15px] leading-7 text-foreground/90">
          {replaceSlugs(quote, roster)}
        </p>
      ) : null}
    </div>
  )
}

function ShotSection({
  lines,
  labels,
  shotCount,
  mentionedRefs,
  roster,
  onToggle,
}: {
  lines: ScriptLine[]
  labels: Map<string, string>
  shotCount: number
  mentionedRefs: string[]
  roster: Roster
  onToggle: (lineNo: number) => void
}) {
  const hasMentioned = lines.some((l) => mentionedRefs.includes(l.ref))
  // 기본 접힘. 사용자가 명시적으로 토글하면 그 값이 우선, 미조작 씬에 멘션이 걸리면 자동 펼침.
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? hasMentioned

  if (lines.length === 0) {
    return (
      <p className={cn(TEXT_INDENT, 'py-1 text-xs text-muted-foreground/70')}>샷 없음</p>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className={cn(
          TEXT_INDENT,
          'flex w-full items-center gap-1.5 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring/50',
        )}
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        <span>
          샷 {shotCount}개 {open ? '접기' : '보기'}
        </span>
      </button>
      {open
        ? lines.map((line) => (
            <ScriptLineButton
              key={line.ref}
              line={line}
              label={labels.get(line.ref) ?? ''}
              mentioned={mentionedRefs.includes(line.ref)}
              roster={roster}
              onToggle={onToggle}
            />
          ))
        : null}
    </div>
  )
}

export function ScriptView() {
  const projectId = useProjectStore((state) => state.projectId)
  const sceneManifest = useWriterStore((state) => state.sceneManifest)
  const shots = useWriterStore((state) => state.shots)
  const mentionedRefs = useChatUiStore((state) => state.mentionedRefs)
  const { status } = useWriterStatus(projectId)
  const lines = useMemo(() => buildScriptLines(sceneManifest, shots), [sceneManifest, shots])

  const onToggle = (lineNo: number) =>
    useChatUiStore.getState().requestMentionToggle(`L${lineNo}`)

  // 슬러그 → 이름 로스터: 인물(characterId) + 장소(locationId) 모두 커버(#c13).
  const roster: Roster = useMemo(
    () => [
      ...(sceneManifest?.characters ?? []).map((c) => ({
        slug: c.characterId,
        name: c.name,
      })),
      ...(sceneManifest?.locations ?? []).map((l) => ({
        slug: l.locationId,
        name: l.name,
      })),
    ],
    [sceneManifest],
  )

  const { headingByScene, shotLinesByScene, orphanLines } = useMemo(() => {
    const sceneIds = new Set((sceneManifest?.scenes ?? []).map((s) => s.sceneId))
    const headingByScene = new Map<string, ScriptLine>()
    const shotLinesByScene = new Map<string, ScriptLine[]>()
    const orphanLines: ScriptLine[] = []
    for (const line of lines) {
      if (line.kind === 'sceneHeading') {
        headingByScene.set(line.sceneId, line)
        continue
      }
      if (!sceneIds.has(line.sceneId)) {
        orphanLines.push(line)
        continue
      }
      const arr = shotLinesByScene.get(line.sceneId) ?? []
      arr.push(line)
      shotLinesByScene.set(line.sceneId, arr)
    }
    return { headingByScene, shotLinesByScene, orphanLines }
  }, [lines, sceneManifest])

  // 좌측 컬럼 표시 라벨(#c11): L# 대신 Scene N(씬 순서) / Shot N(씬 내 샷 순서) / 대사.
  //   내부 ref·멘션(@L#)·채팅 컨텍스트는 그대로 L# — 표시 전용 매핑.
  const displayLabels = useMemo(() => {
    const map = new Map<string, string>()
    const sceneOrder = new Map(
      (sceneManifest?.scenes ?? []).map((s, i) => [s.sceneId, i + 1]),
    )
    const shotCounter = new Map<string, number>()
    let orphanShotNo = 0
    for (const line of lines) {
      if (line.kind === 'sceneHeading') {
        map.set(line.ref, `Scene ${sceneOrder.get(line.sceneId) ?? '?'}`)
      } else if (line.kind === 'action') {
        if (sceneOrder.has(line.sceneId)) {
          const n = (shotCounter.get(line.sceneId) ?? 0) + 1
          shotCounter.set(line.sceneId, n)
          map.set(line.ref, `Shot ${n}`)
        } else {
          map.set(line.ref, `Shot ${++orphanShotNo}`)
        }
      } else {
        map.set(line.ref, '대사')
      }
    }
    return map
  }, [lines, sceneManifest])

  const running = !!(
    status?.started &&
    !status.pipeline_completed &&
    !status.pipeline_failed
  )

  // 트리트먼트 첫 진입 사용법 안내(#c10) — 탭이 "활성"이고 내용이 준비된 뒤 프로젝트당 1회
  //   (localStorage 가드). 활성 조건이 없으면 두 뷰가 동시 마운트된 구조에서 러프 보드의
  //   첫 진입 브리핑과 제안 슬롯을 두고 경합해 이 안내가 덮여 사라진다.
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  const activeTab = useWriterUiStore((s) => s.activeTab)
  useEffect(() => {
    if (!projectId || lines.length === 0 || activeTab !== 'script') return
    const guardKey = `writer:treatmentGuide:${projectId}`
    try {
      if (localStorage.getItem(guardKey)) return
    } catch {
      return
    }
    // 제안 슬롯은 선점형(offerSuggestion: 이미 떠 있으면 무시) — 러프 보드 첫 진입 브리핑이
    //   떠 있으면 내리고 이 안내를 올린다. 다른 제안이면 이번엔 양보(가드 안 태움 → 다음 진입에 재시도).
    const chat = useGlobalChatStore.getState()
    if (chat.suggestion) {
      if (chat.suggestion.id === `writer-brief:${projectId}`) chat.dismissSuggestion()
      else return
    }
    try {
      localStorage.setItem(guardKey, '1')
    } catch {}
    offerSuggestion({
      id: `writer-treatment-guide:${projectId}`,
      stage: 'writer',
      dismissible: false,
      action: null,
      content:
        '이 탭에서는 스토리를 다듬을 수 있어요.\n\n' +
        '· 클릭한 부분의 스토리를 수정할 수 있어요\n' +
        '· 클릭한 부분의 앞뒤에 스토리를 추가할 수 있어요\n\n' +
        '수정한 스토리를 기반으로 전체적인 스토리를 재구성해 달라고 저에게 요청할 수도 있어요.',
    })
  }, [projectId, lines.length, activeTab, offerSuggestion])

  const header = (
    <WriterHeader description="트리트먼트 뷰어 — 라인을 클릭하면 채팅에서 바로 수정을 지시할 수 있어요 (다시 클릭하면 해제)" />
  )

  if (lines.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {running ? (
            <>
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-busy="true" />
              <p className="text-base font-medium">{friendlyStageLabel(status?.current_stage)}</p>
              {/* 진행률 바(#c3) — 러프 보드 진행 화면과 동일 스타일 */}
              <div className="flex w-full max-w-md items-center gap-3">
                <div
                  role="progressbar"
                  aria-valuenow={status?.progress_percent ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${Math.max(0, Math.min(100, status?.progress_percent ?? 0))}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
                  {status?.progress_percent ?? 0}%
                </span>
              </div>
            </>
          ) : (
            <>
              <FileText className="size-12 text-muted-foreground" />
              <p className="text-base font-medium">아직 대본이 없어요</p>
              <p className="text-sm text-muted-foreground">
                {status?.pipeline_failed
                  ? 'Writer 실행이 실패했어요. Producer에서 다시 실행해주세요.'
                  : 'Producer에서 스토리를 핸드오프하면 대본이 생성됩니다.'}
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  const scenes = sceneManifest?.scenes ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-2">
          {scenes.map((scene) => {
            const heading = headingByScene.get(scene.sceneId)
            const sceneShots = shotLinesByScene.get(scene.sceneId) ?? []
            const shotCount = sceneShots.filter((l) => l.kind === 'action').length
            return (
              <section key={scene.sceneId} className="border-b border-border/40 pb-3 last:border-b-0">
                {heading ? (
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                    <ScriptLineButton
                      line={heading}
                      label={displayLabels.get(heading.ref) ?? ''}
                      mentioned={mentionedRefs.includes(heading.ref)}
                      roster={roster}
                      onToggle={onToggle}
                    />
                  </div>
                ) : null}
                <SceneBeats scene={scene} roster={roster} />
                <ShotSection
                  lines={sceneShots}
                  labels={displayLabels}
                  shotCount={shotCount}
                  mentionedRefs={mentionedRefs}
                  roster={roster}
                  onToggle={onToggle}
                />
              </section>
            )
          })}

          {orphanLines.length > 0 ? (
            <section className="pb-3 pt-1">
              <p className={cn(TEXT_INDENT, 'py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground')}>
                씬 미배정 샷
              </p>
              {orphanLines.map((line) => (
                <ScriptLineButton
                  key={line.ref}
                  line={line}
                  label={displayLabels.get(line.ref) ?? ''}
                  mentioned={mentionedRefs.includes(line.ref)}
                  roster={roster}
                  onToggle={onToggle}
                />
              ))}
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
