'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  AtSign,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Clock,
  Film,
  GalleryHorizontal,
  ImageIcon,
  Languages,
  LayoutGrid,
  Monitor,
  Palette,
  Trash2,
  Plus,
  Tag,
  User,
  Wand2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { castMentions, backgroundMentions } from '@/lib/card-mention'
import { useProducerStore, type StyleAnchor } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import type { BackgroundSource, CastArc, CastMember, CastMotivation, GateIssue, GateResult, EntityType } from '@/lib/producer-gate'
import { isProducerBackgroundComplete } from '@/lib/producer-gate'
import { depthLevelFromRuntime } from '@/lib/depth'
import type { ProjectFormat } from '@/types'
import { HOVER_RED_BORDER } from './interaction-styles'
import { HoverBeam } from '@/components/hover-beam'
import { cn } from '@/lib/utils'
import { useModifierHeld } from '@/hooks/use-modifier-held'
import { TagInput } from './tag-input'
import { AgentFace } from '@/components/agent-face'
import { STAGE_FACE_COLOR } from '@/lib/constants'

const FORMAT_OPTIONS: { value: ProjectFormat; label: string }[] = [
  { value: 'horizontal_16:9', label: '16:9 Horizontal' },
  { value: 'vertical_9:16', label: '9:16 Vertical' },
  { value: 'cinema_2.39:1', label: '2.39:1 Cinema' },
  { value: 'square_1:1', label: '1:1 Square' },
]

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
]

// 카드 안 자동확장 textarea(외모/시각 설명)용 — 네이티브 스크롤바 대신 얇은 테마 스크롤바(#b5).
//   max-h로 카드 폭주를 막고, 넘치면 얇은 썸만 보이게.
const CARD_TEXTAREA =
  'max-h-40 resize-none [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border'

const ROLE_LABEL: Record<string, string> = {
  protagonist: '주인공',
  antagonist: '적대자',
  supporting: '조연',
}

const ROLE_TOGGLE: [string, string][] = [
  ['protagonist', '주인공'],
  ['antagonist', '적대자'],
  ['supporting', '조연'],
]

// 보드 카드/필드를 @멘션 대상으로 만드는 공통 래퍼.
// - 입력창에 @라벨이 있으면 시안 링으로 "참조 중" 표시(mentionedRefs 동기화).
// - Cmd/Ctrl+클릭 → 입력창에 @멘션 삽입.
// - 어포던스: ⌘/Ctrl(모디파이어)를 누르면 상단에 "⌘/Ctrl+클릭 멘션" 핀 + 모든 멘션 카드가
//   cursor-copy + 시안 외곽선으로 떠올라 클릭 가능함을 알린다. (호버만으로는 표시 안 함)
function MentionableCard({
  refId,
  label,
  pulse = false,
  className,
  children,
}: {
  refId: string
  label: string
  pulse?: boolean
  className?: string
  children: ReactNode
}) {
  const mentioned = useChatUiStore((s) => s.mentionedRefs.includes(refId))
  // toggle 모드: 이미 멘션된 카드를 다시 Ctrl+클릭하면 입력창에서 @라벨 제거(언멘션, #b6).
  const requestMentionToggle = useChatUiStore((s) => s.requestMentionToggle)
  const armed = useModifierHeld()
  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-shadow',
        mentioned
          ? 'border-sky-400/50 bg-sky-400/10 ring-2 ring-sky-400/70 shadow-lg shadow-sky-500/10'
          : pulse
            ? 'animate-pulse border-success/50 bg-card/70 ring-2 ring-success/60'
            : armed
              ? 'cursor-copy border-sky-400/40 bg-card/70 ring-1 ring-sky-400/40'
              : 'border-border bg-card/70',
        armed && 'cursor-copy',
        className,
      )}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          requestMentionToggle(label)
        }
      }}
    >
      <span
        className={cn(
          'pointer-events-none absolute -top-2.5 left-3 z-10 inline-flex items-center gap-1 rounded-full border border-sky-400/50 bg-popover px-2 py-0.5 text-[10px] font-medium text-sky-300 opacity-0 shadow-sm transition-opacity',
          armed && 'opacity-100',
        )}
      >
        <AtSign className="size-3" /> {mentioned ? '⌘/Ctrl+클릭 멘션 해제' : '⌘/Ctrl+클릭 멘션'}
      </span>
      {children}
    </div>
  )
}
function FieldShell({
  icon,
  label,
  issue,
  softIssue,
  children,
  mentionRef,
  mentionLabel,
}: {
  icon: ReactNode
  label: string
  issue?: GateIssue
  softIssue?: GateIssue
  children: ReactNode
  mentionRef?: string
  mentionLabel?: string
}) {
  const state = issue ? 'missing' : softIssue ? 'recommended' : 'ready'
  // C7: 필드가 채워져 'ready'로 전환되면 잠깐 펄스 하이라이트(채팅으로 채워질 때 시각 피드백).
  //   상태 전환 감지는 set-state-in-render 패턴(권장)으로, 자동 해제만 effect 타이머로.
  const [prevState, setPrevState] = useState(state)
  const [justReady, setJustReady] = useState(false)
  if (state !== prevState) {
    if (prevState !== 'ready' && state === 'ready') setJustReady(true)
    setPrevState(state)
  }
  useEffect(() => {
    if (!justReady) return
    const t = setTimeout(() => setJustReady(false), 1500)
    return () => clearTimeout(t)
  }, [justReady])
  const inner = (
    <>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      <div>{children}</div>
      <div className="mt-2 flex items-start gap-2 text-xs">
        {state === 'ready' ? (
          <Badge variant="outline" className="shrink-0 gap-1 border-success/40 text-success">
            <CheckCircle2 className="size-3" /> 준비됨
          </Badge>
        ) : state === 'missing' ? (
          <Badge variant="outline" className="shrink-0 gap-1 border-destructive/40 text-destructive">
            <AlertCircle className="size-3" /> 필요
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0 gap-1 border-warning/40 text-warning">
            <AlertCircle className="size-3" /> 권장
          </Badge>
        )}
        {(issue ?? softIssue) ? (
          <p className={`pt-0.5 ${issue ? 'text-destructive' : 'text-warning'}`}>
            {(issue ?? softIssue)?.label}
            {(issue ?? softIssue)?.detail ? ` · ${(issue ?? softIssue)?.detail}` : ''}
          </p>
        ) : null}
      </div>
    </>
  )
  if (mentionRef) {
    return (
      <MentionableCard refId={mentionRef} label={mentionLabel ?? label} pulse={justReady}>
        {inner}
      </MentionableCard>
    )
  }
  return (
    <div
      className={`rounded-xl border bg-card/70 p-4 transition-shadow ${
        justReady ? 'animate-pulse border-success/50 ring-2 ring-success/60' : 'border-border'
      }`}
    >
      {inner}
    </div>
  )
}

// 스타일&톤 선택기 — 콤보 박스(글자만 표기) → 클릭 시 그리드 팝업(#b 2026-07-14).
//   실제 I2I 레퍼런스 이미지(anchor.imageUrl)는 노출하지 않는다. 예시 이미지 자리는 빈
//   플레이스홀더 — 사용자가 추후 예시 이미지를 넣을 예정. 선택 표시는 라벨 텍스트로만.
/** 예시 이미지 + 라벨 카드 내용(그리드·슬라이더 공용). */
function StyleAnchorCardBody({ anchor, active }: { anchor: StyleAnchor; active: boolean }) {
  return (
    <>
      {/* 예시 이미지(preview_url) — I2I 레퍼런스(anchor.imageUrl)와 분리된 표시 전용.
          정사각 원본을 그대로 보여준다. 프리뷰 없으면 플레이스홀더 폴백. */}
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted">
        {anchor.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={anchor.previewUrl}
            alt={anchor.label}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground opacity-40" />
        )}
        {active ? (
          <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="size-3" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2">
        <span className="line-clamp-1 text-sm font-medium text-foreground">{anchor.label}</span>
        {anchor.medium ? (
          <span className="line-clamp-1 text-xs text-muted-foreground">{anchor.medium}</span>
        ) : null}
      </div>
    </>
  )
}

// 스타일 선택기 — 콤보 박스(글자만) → 그리드/슬라이더 두 뷰 팝업(#b1 2026-07-18).
//   헤더 우상단 토글 아이콘으로 grid ↔ sliding card 전환. 슬라이더는 한 장씩 크게 보여주며
//   좌우 화살표/도트로 이동하고, 이동 시 트랙이 translateX 로 미끄러진다(카드 이동 애니메이션).
type StyleView = 'grid' | 'slider'

function StyleAnchorPicker({
  anchors,
  value,
  onSelect,
}: {
  anchors: StyleAnchor[]
  value: string | null
  onSelect: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<StyleView>('grid')
  const [slide, setSlide] = useState(0)
  const selected = anchors.find((a) => a.key === value) ?? null
  const selectedIdx = Math.max(0, anchors.findIndex((a) => a.key === value))

  // 슬라이더로 전환하거나 팝업을 열 때 현재 선택 카드로 위치를 맞춘다.
  const syncSlideToSelected = () => setSlide(selectedIdx)

  const choose = (key: string) => {
    onSelect(key)
    setOpen(false)
  }
  const move = (dir: 1 | -1) =>
    setSlide((i) => (i + dir + anchors.length) % anchors.length)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) syncSlideToSelected()
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50',
            HOVER_RED_BORDER,
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="line-clamp-1 text-left">
            {selected ? selected.label : '선택…'}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>스타일 선택</DialogTitle>
          <DialogDescription>
            영상 전체에 적용할 시각 스타일을 골라 주세요.
          </DialogDescription>
          {/* 뷰 전환 토글 — 우상단(닫기 X 왼쪽). grid ↔ sliding card. */}
          {anchors.length > 0 ? (
            <div className="absolute right-12 top-4 inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5">
              <button
                type="button"
                aria-label="그리드 보기"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
                className={cn(
                  'flex size-6 items-center justify-center rounded transition-colors',
                  view === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="슬라이드 보기"
                aria-pressed={view === 'slider'}
                onClick={() => {
                  syncSlideToSelected()
                  setView('slider')
                }}
                className={cn(
                  'flex size-6 items-center justify-center rounded transition-colors',
                  view === 'slider' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <GalleryHorizontal className="size-3.5" />
              </button>
            </div>
          ) : null}
        </DialogHeader>
        {anchors.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            아직 등록된 스타일이 없어요.
          </p>
        ) : view === 'grid' ? (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto p-0.5 sm:grid-cols-3">
            {anchors.map((anchor) => (
              <button
                key={anchor.key}
                type="button"
                onClick={() => choose(anchor.key)}
                className={cn(
                  'group flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
                  anchor.key === value
                    ? 'border-primary ring-2 ring-primary/50'
                    : 'border-border hover:border-primary/60',
                )}
              >
                <StyleAnchorCardBody anchor={anchor} active={anchor.key === value} />
              </button>
            ))}
          </div>
        ) : (
          <div className="p-0.5">
            {/* 슬라이딩 카드 — 한 장씩 크게. 트랙을 translateX 로 밀어 카드 이동 애니메이션. */}
            <div className="relative overflow-hidden rounded-lg">
              <div
                className="flex transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${slide * 100}%)` }}
              >
                {anchors.map((anchor) => (
                  <div key={anchor.key} className="w-full shrink-0 px-8">
                    <button
                      type="button"
                      onClick={() => choose(anchor.key)}
                      className={cn(
                        'group mx-auto flex w-full max-w-sm flex-col overflow-hidden rounded-lg border text-left transition-colors',
                        anchor.key === value
                          ? 'border-primary ring-2 ring-primary/50'
                          : 'border-border hover:border-primary/60',
                      )}
                    >
                      <StyleAnchorCardBody anchor={anchor} active={anchor.key === value} />
                    </button>
                  </div>
                ))}
              </div>
              {/* 좌우 이동 화살표 */}
              <button
                type="button"
                aria-label="이전 스타일"
                onClick={() => move(-1)}
                className="absolute left-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                aria-label="다음 스타일"
                onClick={() => move(1)}
                className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            {/* 도트 인디케이터 — 클릭 시 해당 카드로 이동 */}
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {anchors.map((anchor, i) => (
                <button
                  key={anchor.key}
                  type="button"
                  aria-label={`${anchor.label}로 이동`}
                  onClick={() => setSlide(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === slide ? 'w-4 bg-primary' : 'w-1.5 bg-border hover:bg-muted-foreground',
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function issueByField(issues: GateIssue[], field: string) {
  return issues.find((i) => i.field === field)
}

function castIssuesFor(gate: GateResult, localId: string) {
  return gate.hardMissing.filter((i) => i.field.startsWith(`cast:${localId}:`))
}

function castDraftPrompt(member: CastMember, issue?: GateIssue) {
  const label = member.name || (member.entityType === 'person' ? '이 인물' : '이 사물')
  const current = [
    member.name ? `이름: ${member.name}` : null,
    member.appearance ? `외형: ${member.appearance}` : null,
    member.role ? `역할: ${ROLE_LABEL[member.role] ?? member.role}` : null,
  ].filter(Boolean).join(' / ')
  const target = issue?.label ?? `${label}의 비어 있는 필드`
  return `Producer, ${target}을 채울 수 있게 한 가지 질문을 해 주세요.${current ? ` 현재 정보: ${current}.` : ''}`
}

function CastCard({
  member,
  issues,
  onPatch,
  onAskProducer,
  onDelete,
  runtimeSeconds,
  mentionLabel,
}: {
  member: CastMember
  issues: GateIssue[]
  onPatch: (localId: string, patch: Partial<CastMember>) => void
  onAskProducer: (prompt: string) => void
  onDelete: (localId: string) => void
  runtimeSeconds: number
  mentionLabel: string
}) {
  const isPerson = member.entityType === 'person'
  const ready = issues.length === 0
  const nameIssue = issues.find((i) => i.field.endsWith(':name'))
  const appearanceIssue = issues.find((i) => i.field.endsWith(':appearance'))
  const arcIssue = issues.find((i) => i.field.endsWith(':arc'))
  const motivationIssue = issues.find((i) => i.field.endsWith(':want'))
  const depth = depthLevelFromRuntime(runtimeSeconds || 0)
  const deepPerson = isPerson && depth !== 'D1' && depth !== 'D2' // D3+ : arc/motivation 인라인 편집
  // 상세(역할·아크·동기) 접기 — 기본 접힘, V(chevron) 버튼으로 펼침/접힘 토글(#b2 2026-07-13).
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailIssueCount = [arcIssue, motivationIssue].filter(Boolean).length

  const patchArc = (p: Partial<CastArc>) =>
    onPatch(member.localId, {
      arc: { start_state: '', end_state: '', arc_type: '', ...member.arc, ...p },
    })
  const patchMot = (p: Partial<CastMotivation>) =>
    onPatch(member.localId, {
      motivation: { want: '', ...member.motivation, ...p },
    })

  return (
    <MentionableCard refId={member.localId} label={mentionLabel}>
      <div className="mb-3 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {isPerson ? <User className="size-5" /> : <Box className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">
              {member.name || (isPerson ? '이름 미정 인물' : '이름 미정 사물')}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {isPerson ? ROLE_LABEL[member.role ?? 'supporting'] ?? '인물' : '사물'}
            </Badge>
            {member.origin === 'writer' ? (
              <Badge variant="ghost" className="text-[10px] text-muted-foreground">
                writer 추가
              </Badge>
            ) : null}
            {ready ? (
              <Badge variant="outline" className="ml-auto gap-1 border-success/40 text-success">
                <CheckCircle2 className="size-3" /> 준비됨
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-auto gap-1 border-destructive/40 text-destructive">
                <AlertCircle className="size-3" /> {issues.length}개 필요
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {member.appearance || '외모 미입력'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">이름</label>
          <HoverBeam>
            <Input
              value={member.name}
              placeholder={isPerson ? '예: 지아' : '예: 은빛 반지'}
              onChange={(e) => onPatch(member.localId, { name: e.target.value })}
            />
          </HoverBeam>
          {nameIssue ? <p className="text-xs text-destructive">{nameIssue.label}</p> : null}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">외모</label>
          <HoverBeam>
            <Textarea
              value={member.appearance}
              rows={2}
              className={CARD_TEXTAREA}
              placeholder={isPerson ? '복장, 나이, 특징' : '형태, 재질, 특징'}
              onChange={(e) => onPatch(member.localId, { appearance: e.target.value })}
            />
          </HoverBeam>
          {appearanceIssue ? <p className="text-xs text-destructive">{appearanceIssue.label}</p> : null}
        </div>
      </div>

      {/* 상세 정보(역할·아크·동기) 접기 토글 — 테두리 둥근 사각형(#b4). mx-auto 중앙 배치라
          호버 시 폭이 늘며 중앙 기준으로 확장되고, 옆에 "상세 정보" 문구가 슬라이드로 나타난다.
          접힘+미완료면 우상단 빨간 점으로만 표시. */}
      {isPerson ? (
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          aria-label={detailsOpen ? '상세 접기' : '상세 정보 (역할·아크·동기) 펼치기'}
          title={detailsOpen ? '상세 접기' : '상세 정보 (역할·아크·동기)'}
          className="group/detail relative mx-auto mt-2 flex h-6 min-w-6 items-center justify-center rounded-md border border-border px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {detailsOpen ? (
            <ChevronsUp className="size-4 shrink-0" />
          ) : (
            <ChevronsDown className="size-4 shrink-0" />
          )}
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] opacity-0 transition-all duration-200 group-hover/detail:ml-1 group-hover/detail:max-w-16 group-hover/detail:opacity-100">
            상세 정보
          </span>
          {!detailsOpen && detailIssueCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-destructive" />
          ) : null}
        </button>
      ) : null}

      {/* 상세 본문 — 항상 마운트하고 grid-rows 0fr↔1fr 전환으로 펼침/접힘 애니메이션(#b1 2026-07-15). */}
      {isPerson ? (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            detailsOpen ? '[grid-template-rows:1fr]' : '[grid-template-rows:0fr]',
          )}
          aria-hidden={!detailsOpen}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-3 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">역할</label>
              <div className="flex gap-2">
                {ROLE_TOGGLE.map(([value, label]) => {
                  const active = (member.role ?? 'supporting') === value
                  return (
                    <button
                      key={value}
                      type="button"
                      tabIndex={detailsOpen ? 0 : -1}
                      onClick={() => onPatch(member.localId, { role: value })}
                      className={`rounded-md border px-3 py-1.5 text-xs ${
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : `border-border text-muted-foreground ${HOVER_RED_BORDER}`
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {deepPerson ? (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">아크 (시작 / 끝 / 유형)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <HoverBeam><Input value={member.arc?.start_state ?? ''} placeholder="시작 상태" tabIndex={detailsOpen ? 0 : -1} onChange={(e) => patchArc({ start_state: e.target.value })} /></HoverBeam>
                    <HoverBeam><Input value={member.arc?.end_state ?? ''} placeholder="끝 상태" tabIndex={detailsOpen ? 0 : -1} onChange={(e) => patchArc({ end_state: e.target.value })} /></HoverBeam>
                    <HoverBeam><Input value={member.arc?.arc_type ?? ''} placeholder="유형" tabIndex={detailsOpen ? 0 : -1} onChange={(e) => patchArc({ arc_type: e.target.value })} /></HoverBeam>
                  </div>
                  {arcIssue ? <p className="text-xs text-destructive">{arcIssue.label}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">동기 (want / need)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <HoverBeam><Input value={member.motivation?.want ?? ''} placeholder="want (필수)" tabIndex={detailsOpen ? 0 : -1} onChange={(e) => patchMot({ want: e.target.value })} /></HoverBeam>
                    <HoverBeam><Input value={member.motivation?.need ?? ''} placeholder="need (선택)" tabIndex={detailsOpen ? 0 : -1} onChange={(e) => patchMot({ need: e.target.value })} /></HoverBeam>
                  </div>
                  {motivationIssue ? <p className="text-xs text-destructive">{motivationIssue.label}</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" className={HOVER_RED_BORDER} onClick={() => onAskProducer(castDraftPrompt(member, issues[0]))}>
          <Wand2 className="size-3.5" /> 프로듀서에게 채워달라
        </Button>
        <Button size="sm" variant="ghost" className={`text-destructive hover:text-destructive ${HOVER_RED_BORDER}`} onClick={() => onDelete(member.localId)}>
          <Trash2 className="size-3.5" /> 삭제
        </Button>
      </div>
    </MentionableCard>
  )
}

function backgroundReady(background: BackgroundSource): boolean {
  return isProducerBackgroundComplete(background)
}

function backgroundDraftPrompt(background?: BackgroundSource) {
  const current = background
    ? [
        background.name ? `이름: ${background.name}` : null,
        background.visualDescription ? `시각 설명: ${background.visualDescription}` : null,
        background.purpose ? `목적: ${background.purpose}` : null,
      ].filter(Boolean).join(' / ')
    : ''
  return `Producer, writer와 artist가 바로 쓸 수 있는 배경 카드 1개를 채워 주세요. 필수는 이름, 시각 설명, 이야기 속 목적입니다.${current ? ` 현재 정보: ${current}.` : ''}`
}

function BackgroundCard({
  background,
  onPatch,
  onAskProducer,
  onDelete,
  mentionLabel,
}: {
  background: BackgroundSource
  onPatch: (localId: string, patch: Partial<BackgroundSource>) => void
  onAskProducer: (prompt: string) => void
  onDelete: (localId: string) => void
  mentionLabel: string
}) {
  const ready = backgroundReady(background)
  return (
    <MentionableCard refId={background.localId} label={mentionLabel}>
      <div className="mb-3 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Monitor className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{background.name || '이름 미정 배경'}</span>
            {background.origin === 'writer' ? (
              <Badge variant="ghost" className="text-[10px] text-muted-foreground">writer 추가</Badge>
            ) : null}
            {background.stale ? (
              <Badge variant="outline" className="text-[10px] text-warning">stale</Badge>
            ) : null}
            {ready ? (
              <Badge variant="outline" className="ml-auto gap-1 border-success/40 text-success">
                <CheckCircle2 className="size-3" /> 준비됨
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-auto gap-1 border-destructive/40 text-destructive">
                <AlertCircle className="size-3" /> 필요
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {background.visualDescription || '시각 설명 미입력'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">이름</label>
          <HoverBeam>
            <Input
              value={background.name}
              placeholder="예: 네온 뒷골목"
              onChange={(e) => onPatch(background.localId, { name: e.target.value })}
            />
          </HoverBeam>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">목적</label>
          <HoverBeam>
            <Input
              value={background.purpose}
              placeholder="예: 추격이 시작되는 공간"
              onChange={(e) => onPatch(background.localId, { purpose: e.target.value })}
            />
          </HoverBeam>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">시각 설명</label>
        <HoverBeam>
          <Textarea
            value={background.visualDescription}
            rows={2}
            className={CARD_TEXTAREA}
            placeholder="색감, 구조, 소품, 분위기"
            onChange={(e) => onPatch(background.localId, { visualDescription: e.target.value })}
          />
        </HoverBeam>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" className={HOVER_RED_BORDER} onClick={() => onAskProducer(backgroundDraftPrompt(background))}>
          <Wand2 className="size-3.5" /> 프로듀서에게 채워달라
        </Button>
        <Button size="sm" variant="ghost" className={`text-destructive hover:text-destructive ${HOVER_RED_BORDER}`} onClick={() => onDelete(background.localId)}>
          <Trash2 className="size-3.5" /> 삭제
        </Button>
      </div>
    </MentionableCard>
  )
}

export function ProducerReadinessBoard({ gate }: { gate: GateResult }) {
  const projectSettings = useProducerStore((s) => s.projectSettings)
  const updateSettings = useProducerStore((s) => s.updateSettings)
  const storyText = useProducerStore((s) => s.storyText)
  const cast = useProducerStore((s) => s.cast)
  const syncing = useProducerStore((s) => s.syncing)
  const addCastMember = useProducerStore((s) => s.addCastMember)
  const updateCastMember = useProducerStore((s) => s.updateCastMember)
  const removeCastMember = useProducerStore((s) => s.removeCastMember)
  const backgrounds = useProducerStore((s) => s.backgrounds)
  const addBackground = useProducerStore((s) => s.addBackground)
  const updateBackground = useProducerStore((s) => s.updateBackground)
  const removeBackground = useProducerStore((s) => s.removeBackground)
  // 스타일&톤 (style_anchors 카탈로그 + projects.style_anchor_key) — 세부 장르 슬롯 대체.
  const styleAnchors = useProducerStore((s) => s.styleAnchors)
  const styleAnchorKey = useProducerStore((s) => s.styleAnchorKey)
  const loadStyleAnchors = useProducerStore((s) => s.loadStyleAnchors)
  const setStyleAnchor = useProducerStore((s) => s.setStyleAnchor)
  const projectId = useProjectStore((s) => s.projectId)
  useEffect(() => {
    if (projectId) void loadStyleAnchors()
  }, [projectId, loadStyleAnchors])

  // Brief Story 전체보기 토글 — 길면 4줄로 클램프, "더 보기"로 스크롤 박스 펼침.
  const [storyExpanded, setStoryExpanded] = useState(false)
  const persons = cast.filter((m) => m.entityType === 'person')
  const objects = cast.filter((m) => m.entityType === 'object')
  const readyBackgrounds = backgrounds.filter(backgroundReady)
  // @멘션 라벨(ref 정렬) — cast/backgrounds 배열과 인덱스 일치. 카드에 라벨 전달(Cmd+클릭 삽입용).
  const castMentionList = castMentions(cast)
  const bgMentionList = backgroundMentions(backgrounds)

  const hardByField = useMemo(
    () => new Map(gate.hardMissing.map((issue) => [issue.field, issue])),
    [gate.hardMissing],
  )
  const softByField = useMemo(
    () => new Map(gate.softMissing.map((issue) => [issue.field, issue])),
    [gate.softMissing],
  )

  // Brief Story 준비 전환 시 잠깐 펄스 — FieldShell 시절의 justReady 피드백을 섹션 승격(#b7)
  //   후에도 유지. 상태 전환 감지는 set-state-in-render 패턴, 자동 해제만 effect 타이머.
  const storyIssue = hardByField.get('storyText')
  const storyReadyNow = !storyIssue
  const [prevStoryReady, setPrevStoryReady] = useState(storyReadyNow)
  const [storyPulse, setStoryPulse] = useState(false)
  if (storyReadyNow !== prevStoryReady) {
    if (storyReadyNow) setStoryPulse(true)
    setPrevStoryReady(storyReadyNow)
  }
  useEffect(() => {
    if (!storyPulse) return
    const t = setTimeout(() => setStoryPulse(false), 1500)
    return () => clearTimeout(t)
  }, [storyPulse])

  // C5: 버튼 클릭 시 프롬프트를 타이핑창에 채우는 대신 대화에 바로 보내고 전송 동작을 수행한다.
  const askProducer = (prompt: string) => {
    void useGlobalChatStore.getState().sendMessage(prompt)
  }
  // 헤더 우측 Producer 호출 버튼(#b8) — 옛 Brief Story 카드의 "기본적인 스토리를 알려주세요"
  //   기능을 승격. 접힌 채팅을 펴고 프롬프트 전송 + 입력창 포커스.
  const callProducerForStory = () => {
    useChatUiStore.getState().setCollapsed(false)
    askProducer(
      'Producer, 이 이야기가 writer로 넘어갈 수 있게 캐릭터·장소·시작-갈등-결말 중 부족한 한 가지를 질문해 주세요.',
    )
    useChatUiStore.getState().requestChatFocus()
  }
  const add = (entityType: EntityType) => {
    addCastMember(entityType)
  }
  const addBg = () => {
    addBackground()
  }
  // Producer 호출 버튼 호버(#b1 2026-07-15) — 얼굴이 웃고 깜빡이는 인터랙션. CSS로는
  //   AgentFace의 expression/animate prop을 못 바꾸므로 상태로 전달.
  const [producerHover, setProducerHover] = useState(false)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Meeting Room</h1>
            {gate.canHandoff ? (
              <Badge variant="outline" className="gap-1 border-success/40 text-success">
                <CheckCircle2 className="size-3" /> Writer 계약 준비 완료
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {syncing ? <Badge variant="outline">저장 중</Badge> : null}
          {/* Producer 호출 CTA(#b8) — 얼굴 + 이름 병기, 헤더 맨오른쪽.
              호버 시 얼굴이 활짝 웃으며 깜빡이고(#b1) 살짝 커진다 + 툴팁 안내. */}
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={HOVER_RED_BORDER}
                onClick={callProducerForStory}
                onMouseEnter={() => setProducerHover(true)}
                onMouseLeave={() => setProducerHover(false)}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted transition-transform duration-200',
                    producerHover && 'scale-125',
                  )}
                >
                  <AgentFace
                    color={STAGE_FACE_COLOR.producer}
                    size={15}
                    expression={producerHover ? 'happy' : 'idle'}
                    animate={producerHover}
                  />
                </span>
                Producer와 스토리 만들기
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">도움이 필요하시면 저를 불러주세요</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto max-w-6xl space-y-5">
          {/* Brief Story — Story Foundation과 같은 레벨의 메인 섹션(#b7). 게이트 배지는 제목 옆,
              카드 본문은 스토리 텍스트만. 프로듀서 호출 버튼은 헤더로 이동(#b8). */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Brief Story</h2>
              {storyIssue ? (
                <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                  <AlertCircle className="size-3" /> 필요
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-success/40 text-success">
                  <CheckCircle2 className="size-3" /> 준비됨
                </Badge>
              )}
              {storyIssue ? (
                <span className="text-xs text-destructive">
                  {storyIssue.label}
                  {storyIssue.detail ? ` · ${storyIssue.detail}` : ''}
                </span>
              ) : null}
            </div>
            <MentionableCard refId="story" label="스토리" pulse={storyPulse}>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                {storyText ? (
                  <>
                    <p
                      className={cn(
                        'text-sm text-muted-foreground italic whitespace-pre-wrap',
                        storyExpanded
                          ? 'max-h-72 overflow-y-auto pr-1'
                          : 'line-clamp-4',
                      )}
                    >
                      {storyText}
                    </p>
                    {storyText.length > 200 && (
                      <button
                        type="button"
                        onClick={() => setStoryExpanded((v) => !v)}
                        className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {storyExpanded ? '접기' : '더 보기'}
                        <ChevronDown
                          className={cn('size-3.5 transition-transform', storyExpanded && 'rotate-180')}
                        />
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    채팅으로 촬영 가능한 스토리를 정리해 주세요. 우상단의 Producer 버튼으로
                    시작할 수 있어요.
                  </p>
                )}
              </div>
            </MentionableCard>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Story Foundation</h2>
            </div>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              <FieldShell icon={<Clock className="size-4" />} label="러닝타임" issue={hardByField.get('playtime')} mentionRef="setting:playtime" mentionLabel="러닝타임">
                <HoverBeam>
                  <Input
                    type="number"
                    min={5}
                    value={projectSettings.playtime || ''}
                    placeholder="예: 120"
                    onChange={(e) => updateSettings({ playtime: Number(e.target.value) || 0 })}
                    className="font-mono tabular-nums"
                  />
                </HoverBeam>
              </FieldShell>

              <FieldShell icon={<Film className="size-4" />} label="장르" issue={hardByField.get('genre')} mentionRef="setting:genre" mentionLabel="장르">
                <HoverBeam>
                  <Input
                    value={projectSettings.genre}
                    placeholder="예: thriller"
                    onChange={(e) => updateSettings({ genre: e.target.value })}
                  />
                </HoverBeam>
              </FieldShell>

              {/* 세부 장르 필드는 숨김(2026-07-13 — 데이터(settings.subGenre)는 유지) → 스타일&톤(style_anchors)으로 대체.
                  콤보 박스는 글자만, 클릭 시 그리드 팝업으로 선택(#b 2026-07-14). */}
              <FieldShell icon={<Tag className="size-4" />} label="스타일" mentionRef="setting:styleAnchor" mentionLabel="스타일">
                <StyleAnchorPicker
                  anchors={styleAnchors}
                  value={styleAnchorKey}
                  onSelect={(k) => void setStyleAnchor(k)}
                />
              </FieldShell>

              <FieldShell icon={<Monitor className="size-4" />} label="포맷" issue={hardByField.get('format')} mentionRef="setting:format" mentionLabel="포맷">
                <Select
                  value={projectSettings.format}
                  onValueChange={(v) => updateSettings({ format: v as ProjectFormat })}
                >
                  <SelectTrigger className={`w-full ${HOVER_RED_BORDER}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>

              <FieldShell icon={<Palette className="size-4" />} label="톤" softIssue={softByField.get('tone')} mentionRef="setting:tone" mentionLabel="톤">
                <HoverBeam>
                  <TagInput
                    values={projectSettings.tone}
                    onChange={(tone) => updateSettings({ tone })}
                    placeholder="예: dark"
                  />
                </HoverBeam>
              </FieldShell>

              <FieldShell icon={<Languages className="size-4" />} label="대사 언어" issue={hardByField.get('dialogueLanguage')} mentionRef="setting:dialogueLanguage" mentionLabel="대사 언어">
                <Select
                  value={projectSettings.dialogueLanguage || ''}
                  onValueChange={(v) => updateSettings({ dialogueLanguage: v })}
                >
                  <SelectTrigger className={`w-full ${HOVER_RED_BORDER}`}><SelectValue placeholder="선택…" /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Casting</h2>
                <span className="text-xs text-muted-foreground">인물 {persons.length} · 사물 {objects.length}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className={HOVER_RED_BORDER} onClick={() => add('person')}>
                  <Plus className="size-4" /> 인물
                </Button>
                <Button size="sm" variant="outline" className={HOVER_RED_BORDER} onClick={() => add('object')}>
                  <Plus className="size-4" /> 사물
                </Button>
              </div>
            </div>

            {issueByField(gate.hardMissing, 'cast:minPerson') ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {issueByField(gate.hardMissing, 'cast:minPerson')?.label}
              </div>
            ) : null}

            {cast.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
                <User className="size-10 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">아직 캐스트가 없어요</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  추가하고 싶은 인물과 사물에 대한 묘사를 AI Producer에게 알려주세요
                </p>
              </div>
            ) : (
              // items-start: 같은 행의 이웃 카드가 확장된 카드 높이로 같이 늘어나지 않게(#b4).
              <div className="grid items-start gap-3 xl:grid-cols-2">
                {cast.map((member, i) => (
                  <CastCard
                    key={member.localId}
                    member={member}
                    issues={castIssuesFor(gate, member.localId)}
                    onPatch={updateCastMember}
                    onAskProducer={askProducer}
                    onDelete={removeCastMember}
                    runtimeSeconds={projectSettings.playtime || 0}
                    mentionLabel={castMentionList[i]?.label ?? member.name}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Background</h2>
                <span className="text-xs text-muted-foreground">준비됨 {readyBackgrounds.length} / 전체 {backgrounds.length}</span>
              </div>
              <Button size="sm" variant="outline" className={HOVER_RED_BORDER} onClick={addBg}>
                <Plus className="size-4" /> 배경
              </Button>
            </div>

            {issueByField(gate.hardMissing, 'background:minComplete') ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {issueByField(gate.hardMissing, 'background:minComplete')?.label}
                <span className="ml-2 text-xs text-muted-foreground">
                  {issueByField(gate.hardMissing, 'background:minComplete')?.detail}
                </span>
              </div>
            ) : null}

            {backgrounds.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
                <Monitor className="size-10 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">아직 배경 설정이 없어요</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  추가하고 싶은 배경이나 세계관에 대한 묘사를 AI Producer에게 알려주세요
                </p>
              </div>
            ) : (
              <div className="grid items-start gap-3 xl:grid-cols-2">
                {backgrounds.map((background, i) => (
                  <BackgroundCard
                    key={background.localId}
                    background={background}
                    onPatch={updateBackground}
                    onAskProducer={askProducer}
                    onDelete={removeBackground}
                    mentionLabel={bgMentionList[i]?.label ?? background.name}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

    </div>
  )
}
