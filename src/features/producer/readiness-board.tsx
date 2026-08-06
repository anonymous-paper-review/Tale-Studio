'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react'
import {
  AlertCircle,
  AtSign,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Film,
  GalleryHorizontal,
  ImageIcon,
  Languages,
  LayoutGrid,
  Monitor,
  Mountain,
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
import { StageHelpBadge } from '@/components/stage-help-badge'
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
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
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

// Brief Story 접힘 상태(#b1 2026-07-31) — 4줄(text-sm 20px × 4)만 보이고, 마우스를 올리면
//   넘친 만큼 일정한 속도로 천천히 올라온다. 속도를 고정했으므로 글이 길수록 오래 흐른다.
const STORY_PEEK_VIEW_PX = 80
const STORY_PEEK_SPEED_PX_PER_SEC = 26
const STORY_PEEK_RETURN_MS = 240

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

// ── 줄(row) 레이아웃 공통 (#b-rows 2026-07-31) ───────────────────────────────
// 카드 격자는 같은 행의 이웃과 높이가 동기화돼 짧은 항목 아래에 빈 공간이 남는다. 줄 목록은
//   각 항목이 필요한 높이만 쓰고, 테두리는 목록 컨테이너가 한 번만 갖는다.
const ROW_LIST = 'divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/70'
const ROW_LABEL =
  'flex w-24 shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground'

// 줄 안의 입력/선택 컨트롤 — 채워진 값은 테두리 없이 텍스트처럼 조용히 있고, hover·focus·열림
//   이나 "아직 채워야 하는 필드"(FieldSlot needs)에서만 테두리·드롭다운 화살표가 드러난다.
//   (#b2: 항상 떠 있는 선택 버튼이 유저에게 "골라야 한다"는 부담을 준다는 피드백)
const QUIET_CONTROL =
  'border-transparent bg-transparent shadow-none dark:bg-transparent hover:border-input focus-visible:border-ring data-[state=open]:border-input group-data-[needs=true]/field:border-input'
const QUIET_CHEVRON =
  '[&>svg]:opacity-0 [&>svg]:transition-opacity hover:[&>svg]:opacity-60 focus-visible:[&>svg]:opacity-60 data-[state=open]:[&>svg]:opacity-60 group-data-[needs=true]/field:[&>svg]:opacity-60'

/** 컨트롤 슬롯 — 아직 채워야 하는 필드면 조용한 컨트롤의 테두리를 드러낸다(group-data). */
function FieldSlot({
  needs,
  className,
  children,
}: {
  needs?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('group/field min-w-0', className)} data-needs={needs ? 'true' : undefined}>
      {children}
    </div>
  )
}

/** 줄 끝 아이콘 버튼 — 아이콘만 두고 전체 문구는 호버 툴팁으로(#b4, 폭이 흔들리지 않게). */
function RowIconButton({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: ElementType
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
            destructive
              ? 'hover:bg-destructive/10 hover:text-destructive'
              : 'hover:bg-accent hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

// 보드 카드/필드를 @멘션 대상으로 만드는 공통 래퍼.
// - 입력창에 @라벨이 있으면 시안 링으로 "참조 중" 표시(mentionedRefs 동기화).
// - Cmd/Ctrl+클릭 → 입력창에 @멘션 삽입.
// - 어포던스: ⌘/Ctrl(모디파이어)를 누르면 "⌘/Ctrl+클릭 멘션" 핀 + 모든 멘션 대상이
//   cursor-copy + 시안 외곽선으로 떠올라 클릭 가능함을 알린다. (호버만으로는 표시 안 함)
// - variant: 'card'(독립 카드) | 'row'(줄 목록의 한 줄 — 테두리는 목록 컨테이너 몫이라
//   상태는 안쪽 ring/배경으로만 표시하고, 핀은 줄 오른쪽 끝 세로 중앙에 건다).
type MentionVariant = 'card' | 'row'
type MentionTone = 'mentioned' | 'pulse' | 'armed' | 'idle'

const MENTION_BASE: Record<MentionVariant, string> = {
  card: 'group relative rounded-xl border p-4 transition-shadow',
  // py-3: 줄 사이 숨 쉴 틈 (#b1 2026-08-03 — py-1.5 는 정보 밀도가 너무 높았다)
  row: 'group relative px-3 py-3 transition-colors',
}
const MENTION_TONE: Record<MentionVariant, Record<MentionTone, string>> = {
  card: {
    mentioned: 'border-sky-400/50 bg-sky-400/10 ring-2 ring-sky-400/70 shadow-lg shadow-sky-500/10',
    pulse: 'animate-pulse border-success/50 bg-card/70 ring-2 ring-success/60',
    armed: 'cursor-copy border-sky-400/40 bg-card/70 ring-1 ring-sky-400/40',
    idle: 'border-border bg-card/70',
  },
  row: {
    mentioned: 'bg-sky-400/10 ring-1 ring-inset ring-sky-400/60',
    pulse: 'animate-pulse bg-success/10 ring-1 ring-inset ring-success/50',
    armed: 'cursor-copy ring-1 ring-inset ring-sky-400/30',
    idle: '',
  },
}
const MENTION_PIN: Record<MentionVariant, string> = {
  card: '-top-2.5 left-3',
  row: 'right-2 top-1/2 -translate-y-1/2',
}

function MentionableCard({
  refId,
  label,
  pulse = false,
  variant = 'card',
  className,
  onClick,
  containerRef,
  children,
}: {
  refId: string
  label: string
  pulse?: boolean
  variant?: MentionVariant
  className?: string
  /** 일반 클릭 핸들러 — ⌘/Ctrl 클릭은 캡처 단계가 선점하므로 여기엔 오지 않는다. */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void
  /** 카드 루트 div ref — 바깥 클릭 감지(외부 클릭 닫기) 등 경계 판정용. */
  containerRef?: React.Ref<HTMLDivElement>
  children: ReactNode
}) {
  const mentioned = useChatUiStore((s) => s.mentionedRefs.includes(refId))
  // toggle 모드: 이미 멘션된 카드를 다시 Ctrl+클릭하면 입력창에서 @라벨 제거(언멘션, #b6).
  const requestMentionToggle = useChatUiStore((s) => s.requestMentionToggle)
  const armed = useModifierHeld()
  const tone: MentionTone = mentioned ? 'mentioned' : pulse ? 'pulse' : armed ? 'armed' : 'idle'
  return (
    <div
      ref={containerRef}
      className={cn(MENTION_BASE[variant], MENTION_TONE[variant][tone], armed && 'cursor-copy', className)}
      onClick={onClick}
      // ⌘/Ctrl 클릭은 멘션 전용(#b5 2026-08-03) — 캡처 단계에서 기본 동작을 끊는다.
      //   포커스는 pointerdown 에서 일어나고 radix 콤보박스도 pointerdown 으로 열리므로,
      //   click 만 막으면 입력창에 커서가 앉거나 드롭다운이 펼쳐진 채 멘션된다.
      onPointerDownCapture={(e) => {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onClickCapture={(e) => {
        if (!(e.metaKey || e.ctrlKey)) return
        e.preventDefault()
        e.stopPropagation()
        // 방향은 입력창 텍스트가 진실(#b2) — mentioned prop 은 mentionItems 미등록 필드(스타일 등)
        //   에서 항상 false 라 해제 비행이 나오지 않았다. 토글 반영 전 값으로 판정.
        const removing = chatInputHasMention(label)
        requestMentionToggle(label)
        // 비행 연출 — 추가면 클릭 지점 → 채팅, 해제면 채팅 → 클릭 지점 (표시 전용)
        launchMentionFlight({ label, clickX: e.clientX, clickY: e.clientY, toChat: !removing })
      }}
    >
      <span
        className={cn(
          'pointer-events-none absolute z-10 inline-flex items-center gap-1 rounded-full border border-sky-400/50 bg-popover px-2 py-0.5 text-[10px] font-medium text-sky-300 opacity-0 shadow-sm transition-opacity',
          MENTION_PIN[variant],
          armed && 'opacity-100',
        )}
      >
        <AtSign className="size-3" /> {mentioned ? '⌘/Ctrl+클릭 멘션 해제' : '⌘/Ctrl+클릭 멘션'}
      </span>
      {children}
    </div>
  )
}

/** 줄 오른쪽 끝 상태 표시 — 준비된 필드는 체크 하나로, 미완료면 사유를 그 자리에 적는다. */
function RowStatus({
  state,
  issue,
}: {
  state: 'ready' | 'missing' | 'recommended'
  issue?: GateIssue
}) {
  if (state === 'ready') {
    return (
      <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label="준비됨" />
    )
  }
  const text = issue ? `${issue.label}${issue.detail ? ` · ${issue.detail}` : ''}` : '필요'
  return (
    <span
      title={text}
      className={cn(
        'flex max-w-56 shrink-0 items-center gap-1 text-xs',
        state === 'missing' ? 'text-destructive' : 'text-warning',
      )}
    >
      <AlertCircle className="size-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  )
}

/** Story Foundation 한 줄 — [아이콘+라벨] [컨트롤] [상태]. */
function FieldRow({
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
  mentionRef: string
  mentionLabel: string
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

  return (
    <MentionableCard variant="row" refId={mentionRef} label={mentionLabel} pulse={justReady}>
      <div className="flex items-center gap-3">
        <span className={ROW_LABEL}>
          <span className="text-muted-foreground/70">{icon}</span>
          {label}
        </span>
        <FieldSlot needs={state !== 'ready'} className="flex-1">
          {children}
        </FieldSlot>
        <RowStatus state={state} issue={issue ?? softIssue} />
      </div>
    </MentionableCard>
  )
}

// 스타일&톤 선택기 — 콤보 박스(글자만 표기) → 클릭 시 그리드 팝업(#b 2026-07-14).
//   실제 I2I 레퍼런스 이미지(anchor.imageUrl)는 노출하지 않는다. 예시 이미지 자리는 빈
//   플레이스홀더 — 사용자가 추후 예시 이미지를 넣을 예정. 선택 표시는 라벨 텍스트로만.
// medium 슬러그(2d_cartoon 등)를 표시용으로 정리 — 언더바 제거 + 단어별 대문자, 2d/3d는 통째 대문자.
//   예) 2d_cartoon → "2D Cartoon", live_action → "Live Action", 3d → "3D".
function prettyMedium(medium: string): string {
  return medium
    .split('_')
    .map((w) => (/^\d+d$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

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
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {anchor.subtitle ?? prettyMedium(anchor.medium)}
          </span>
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
  // stacked deck(slider)를 기본 뷰로(#b1 2026-07-18).
  const [view, setView] = useState<StyleView>('slider')
  const [slide, setSlide] = useState(0)
  const selected = anchors.find((a) => a.key === value) ?? null
  const selectedIdx = Math.max(0, anchors.findIndex((a) => a.key === value))

  // 슬라이더로 전환하거나 팝업을 열 때 현재 선택 카드로 위치를 맞춘다.
  const syncSlideToSelected = () => setSlide(selectedIdx)

  // 뷰 전환 애니메이션(#b1):
  //   - 팝업 크기: 뷰별 max-width(위 DialogContent) + 내용 높이를 측정해 래퍼 height 트랜지션.
  //   - 카드 진입("딜"): 덱/그리드 카드가 각자 자리로 날아든다 — 위치 transform 은 바깥 래퍼가,
  //     진입 애니메이션은 안쪽 버튼의 CSS animate-in 이 담당(둘이 곱해져 충돌 없음). 뷰를 바꾸면
  //     카드가 새로 마운트돼 애니메이션이 다시 재생된다(별도 상태 불요).
  // 내용 높이 측정 → 래퍼 height 트랜지션(뷰 전환 시 팝업 높이가 부드럽게 변함).
  //   콜백 ref 로 ResizeObserver 를 붙인다 — 포털(radix Dialog) 콘텐츠가 부모 effect 보다
  //   늦게 마운트돼도, 노드가 실제로 붙는 그 순간 관찰이 시작돼 측정이 누락되지 않는다.
  //   (닫힘/재오픈 시 내용이 안 보이던 버그 수정, 2026-07-18)
  const [bodyH, setBodyH] = useState<number>()
  const roRef = useRef<ResizeObserver | null>(null)
  const bodyRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const ro = new ResizeObserver(() => setBodyH(el.offsetHeight))
    ro.observe(el)
    roRef.current = ro
  }, [])

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
        // 닫을 때 측정 높이 리셋 → 재오픈 시 auto 로 시작해 stale 높이로 클리핑되지 않는다.
        else setBodyH(undefined)
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:bg-input/50',
            QUIET_CONTROL,
            QUIET_CHEVRON,
            HOVER_RED_BORDER,
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="line-clamp-1 text-left">
            {selected ? selected.label : '선택…'}
          </span>
          <ChevronDown className="size-4 shrink-0" />
        </button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          // 뷰별 팝업 폭 + 전환 애니메이션(#b1) — 덱은 좁게, 그리드는 넓게, max-width 를 트랜지션.
          'transition-[max-width] duration-300 ease-out',
          view === 'grid' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <DialogHeader>
          <DialogTitle>영상 스타일 선택</DialogTitle>
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
        {/* 뷰 전환 시 팝업 높이가 부드럽게 변하도록, 내용 높이를 측정해 래퍼 height 를 트랜지션. */}
        <div
          className="overflow-hidden transition-[height] duration-300 ease-out"
          style={{ height: bodyH }}
        >
        <div ref={bodyRef}>
        {anchors.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            아직 등록된 스타일이 없어요.
          </p>
        ) : view === 'grid' ? (
          // 그리드 진입 시 카드가 아래에서 살짝 확대되며 순차로 날아든다(#b1).
          <div
            key="grid"
            className="scrollbar-thin grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto p-0.5 sm:grid-cols-3"
          >
            {anchors.map((anchor, i) => (
              <button
                key={anchor.key}
                type="button"
                onClick={() => choose(anchor.key)}
                style={{ animationDelay: `${i * 35}ms`, animationFillMode: 'backwards' }}
                className={cn(
                  'group flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
                  'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-300',
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
            {/* Stacked sliding card(#b1 2026-07-18) — 활성 카드를 앞으로, 양옆은 뒤로 겹쳐 쌓는 덱.
                각 카드 위치를 활성 인덱스와의 wrap-around 거리(offset)로 계산 → 마지막→첫 카드로
                넘어가도 offset 이 1씩 밀릴 뿐이라 트랙 리셋 없는 자연스러운 무한 루프. */}
            <div className="relative flex h-[19rem] items-center justify-center overflow-hidden">
              {anchors.map((anchor, i) => {
                const n = anchors.length
                // 활성(slide)로부터의 최단 부호 거리 — 무한 루프의 핵심.
                let off = i - slide
                if (off > n / 2) off -= n
                if (off < -n / 2) off += n
                const abs = Math.abs(off)
                const hidden = abs > 2
                const isFront = off === 0
                return (
                  <div
                    key={anchor.key}
                    // 숨은 카드는 transition 없이 순간이동(opacity 0이라 안 보임) → 마지막↔첫 카드
                    //   전환 시 반대편 카드가 화면을 가로질러 슬라이드하는 어색함을 없앤다(무한 루프).
                    className={cn(
                      'absolute',
                      hidden ? 'transition-none' : 'transition-all duration-300 ease-out',
                    )}
                    style={{
                      transform: `translateX(${off * 42}%) scale(${1 - abs * 0.16})`,
                      opacity: hidden ? 0 : 1 - abs * 0.32,
                      zIndex: 30 - abs,
                      pointerEvents: hidden ? 'none' : 'auto',
                    }}
                    aria-hidden={hidden}
                  >
                    <button
                      type="button"
                      // 앞 카드 클릭 = 선택, 옆 카드 클릭 = 그 카드를 앞으로.
                      onClick={() => (isFront ? choose(anchor.key) : setSlide(i))}
                      tabIndex={hidden ? -1 : 0}
                      // 진입 딜(#b1): 마운트 시 작게 튀어나오듯 확대+페이드, 바깥 카드일수록 늦게(cascade).
                      //   위치는 래퍼가 잡으므로 여기선 scale/opacity만 → 스택 transform과 곱해져 충돌 없음.
                      style={{ animationDelay: `${abs * 55}ms`, animationFillMode: 'backwards' }}
                      className={cn(
                        'group flex w-56 flex-col overflow-hidden rounded-xl border bg-card text-left shadow-lg transition-colors',
                        'animate-in fade-in-0 zoom-in-50 duration-500',
                        anchor.key === value
                          ? 'border-primary ring-2 ring-primary/50'
                          : isFront
                            ? 'border-border hover:border-primary/60'
                            : 'border-border',
                      )}
                    >
                      <StyleAnchorCardBody anchor={anchor} active={anchor.key === value} />
                    </button>
                  </div>
                )
              })}
              {/* 좌우 이동 화살표 — 덱 위(z 최상단) */}
              <button
                type="button"
                aria-label="이전 스타일"
                onClick={() => move(-1)}
                className="absolute left-1 top-1/2 z-40 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                aria-label="다음 스타일"
                onClick={() => move(1)}
                className="absolute right-1 top-1/2 z-40 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
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
        </div>
        </div>
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

// 캐스트 한 줄(#b-rows) — [삭제] [아이콘] [이름] [외모] [배지] [상태] [상세] [프로듀서 호출].
//   필수 두 칸(이름·외모)은 줄 위에서 바로 고치고, 역할·아크·동기는 아래로 펼친다.
function CastRow({
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

  // 바깥 클릭 닫기(2026-08-06) — 펼쳐진 상세는 팝오버처럼 "다른 곳을 누르면 닫힌다"가
  //   대부분의 인지 모델이다. pointerdown 기준(안쪽에서 시작해 밖에서 끝나는 드래그에 오발동 없음),
  //   카드 안쪽은 아래 onClick 토글이 담당하므로 여기는 카드 밖만 본다.
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!detailsOpen) return
    const onDocPointerDown = (e: PointerEvent) => {
      const el = rowRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setDetailsOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [detailsOpen])

  const patchArc = (p: Partial<CastArc>) =>
    onPatch(member.localId, {
      arc: { start_state: '', end_state: '', arc_type: '', ...member.arc, ...p },
    })
  const patchMot = (p: Partial<CastMotivation>) =>
    onPatch(member.localId, {
      motivation: { want: '', ...member.motivation, ...p },
    })

  return (
    <MentionableCard
      variant="row"
      refId={member.localId}
      label={mentionLabel}
      className={cn('px-2', isPerson && 'cursor-pointer')}
      containerRef={rowRef}
      // 상세 토글은 빈 공간 클릭(#b3, 2026-08-06 확장) — 카드 어디든 상호작용 요소(입력·버튼·
      //   콤보박스)가 아닌 곳을 누르면 토글된다. 펼쳐진 상세 본문의 여백 클릭도 닫힘(바깥 클릭
      //   닫기와 함께 "다른 데를 누르면 닫힌다" 인지 모델 완성). ⌘/Ctrl 은 멘션 캡처가 선점.
      onClick={(e) => {
        if (!isPerson) return
        const target = e.target as HTMLElement
        if (target.closest('input,textarea,button,a,[role="combobox"]')) return
        setDetailsOpen((v) => !v)
      }}
    >
      <div className="flex items-center gap-2">
        {/* 삭제는 줄 왼쪽 끝, 프로듀서 호출은 오른쪽 끝 (#b4) */}
        <RowIconButton
          icon={Trash2}
          label="삭제"
          destructive
          onClick={() => onDelete(member.localId)}
        />
        {/* 인물 아이콘 — hover 로 상세 안내, 미완료면 빨간 점(#b3) */}
        {isPerson ? (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <span className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <User className="size-4" />
                {!detailsOpen && detailIssueCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-destructive" />
                ) : null}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">상세 정보 (역할·아크·동기)</TooltipContent>
          </Tooltip>
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Box className="size-4" />
          </span>
        )}

        <FieldSlot needs={!!nameIssue} className="w-36 shrink-0">
          <HoverBeam>
            <Input
              value={member.name}
              placeholder={isPerson ? '이름 (예: 지아)' : '이름 (예: 은빛 반지)'}
              className={cn(QUIET_CONTROL, 'h-8')}
              onChange={(e) => onPatch(member.localId, { name: e.target.value })}
            />
          </HoverBeam>
        </FieldSlot>
        <FieldSlot needs={!!appearanceIssue} className="flex-1">
          <HoverBeam>
            <Textarea
              value={member.appearance}
              rows={1}
              className={cn(CARD_TEXTAREA, QUIET_CONTROL, 'min-h-8 py-1.5')}
              placeholder={isPerson ? '외모 — 복장, 나이, 특징' : '형태, 재질, 특징'}
              onChange={(e) => onPatch(member.localId, { appearance: e.target.value })}
            />
          </HoverBeam>
        </FieldSlot>

        <div className="flex shrink-0 items-center gap-1">
          {isPerson ? (
            <Badge variant="outline" className="text-[10px]">
              {ROLE_LABEL[member.role ?? 'supporting'] ?? '조연'}
            </Badge>
          ) : null}
          {member.origin === 'writer' ? (
            <Badge variant="ghost" className="text-[10px] text-muted-foreground">
              writer
            </Badge>
          ) : null}
        </div>

        {/* 상태 — 준비됐으면 체크 하나, 아니면 남은 개수(전체 사유는 호버 툴팁) */}
        {ready ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label="준비됨" />
        ) : (
          <span
            title={issues.map((i) => i.label).join(' · ')}
            className="flex shrink-0 items-center gap-1 text-xs text-destructive"
          >
            <AlertCircle className="size-3.5" />
            {issues.length}
          </span>
        )}

        <RowIconButton
          icon={Wand2}
          label="프로듀서에게 채워달라"
          onClick={() => onAskProducer(castDraftPrompt(member, issues[0]))}
        />
        {/* 상세 펼침/접힘 전용 버튼(2026-08-06) — 빈 공간 클릭 토글(#b3)은 줄이 입력창으로
            가득 차 닫을 자리가 거의 없었다. 명시적 chevron 이 항상 열고 닫는다. */}
        {isPerson ? (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                aria-expanded={detailsOpen}
                aria-label={detailsOpen ? '상세 접기' : '상세 펼치기 (역할·아크·동기)'}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronDown
                  className={cn('size-4 transition-transform duration-200', detailsOpen && 'rotate-180')}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{detailsOpen ? '상세 접기' : '상세 펼치기'}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* 상세 본문 — 항상 마운트하고 grid-rows 0fr↔1fr 전환으로 펼침/접힘 애니메이션(#b1 2026-07-15). */}
      {isPerson ? (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            detailsOpen ? '[grid-template-rows:1fr]' : '[grid-template-rows:0fr]',
          )}
          aria-hidden={!detailsOpen}
        >
          {/* 줄의 이름 칸(삭제 버튼 + 아이콘 폭)에 맞춰 들여쓴다 — 어느 줄에 딸린 상세인지 보이게. */}
          <div className="min-h-0 overflow-hidden pl-[4.5rem] pr-2">
            <div className="mt-2 space-y-1.5">
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

// 배경 한 줄(#b-rows) — [삭제] [아이콘] [이름] [시각 설명] [목적] [배지] [상태] [프로듀서 호출].
//   세 칸 모두 완성돼야 배경 게이트를 통과하므로(isProducerBackgroundComplete) 셋 다 줄 위에 둔다.
function BackgroundRow({
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
  const missing = [
    background.name?.trim() ? null : '이름',
    background.visualDescription?.trim() ? null : '시각 설명',
    background.purpose?.trim() ? null : '목적',
  ].filter(Boolean) as string[]

  return (
    <MentionableCard variant="row" refId={background.localId} label={mentionLabel} className="px-2">
      <div className="flex items-center gap-2">
        <RowIconButton
          icon={Trash2}
          label="삭제"
          destructive
          onClick={() => onDelete(background.localId)}
        />
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Mountain className="size-4" />
        </span>

        <FieldSlot needs={missing.includes('이름')} className="w-36 shrink-0">
          <HoverBeam>
            <Input
              value={background.name}
              placeholder="이름 (예: 네온 뒷골목)"
              className={cn(QUIET_CONTROL, 'h-8')}
              onChange={(e) => onPatch(background.localId, { name: e.target.value })}
            />
          </HoverBeam>
        </FieldSlot>
        {/* 묘사는 줄에, 목적은 아래 줄로(#b4 2026-08-03) — 각 필드에 row head 를 붙인다. */}
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">묘사</span>
        <FieldSlot needs={missing.includes('시각 설명')} className="flex-1">
          <HoverBeam>
            <Textarea
              value={background.visualDescription}
              rows={1}
              className={cn(CARD_TEXTAREA, QUIET_CONTROL, 'min-h-8 py-1.5')}
              placeholder="색감, 구조, 소품, 분위기"
              onChange={(e) => onPatch(background.localId, { visualDescription: e.target.value })}
            />
          </HoverBeam>
        </FieldSlot>

        <div className="flex shrink-0 items-center gap-1">
          {background.origin === 'writer' ? (
            <Badge variant="ghost" className="text-[10px] text-muted-foreground">writer</Badge>
          ) : null}
          {background.stale ? (
            <Badge variant="outline" className="text-[10px] text-warning">stale</Badge>
          ) : null}
        </div>

        {ready ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label="준비됨" />
        ) : (
          <span
            title={`${missing.join(' · ')} 필요`}
            className="flex shrink-0 items-center gap-1 text-xs text-destructive"
          >
            <AlertCircle className="size-3.5" />
            {missing.length}
          </span>
        )}
        <RowIconButton
          icon={Wand2}
          label="프로듀서에게 채워달라"
          onClick={() => onAskProducer(backgroundDraftPrompt(background))}
        />
      </div>
      {/* 목적 — 둘째 줄. 들여쓰기는 첫 줄 "묘사" head 의 x 위치에 맞춘다(#b1 2026-08-03):
          삭제(28)+gap(8)+아이콘(28)+gap(8)+이름(144)+gap(8) = 224px = pl-56. */}
      <div className="mt-1.5 flex items-center gap-2 pl-56 pr-2">
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">목적</span>
        <FieldSlot needs={missing.includes('목적')} className="max-w-md flex-1">
          <HoverBeam>
            <Input
              value={background.purpose}
              placeholder="예: 추격이 시작되는 공간"
              className={cn(QUIET_CONTROL, 'h-8')}
              onChange={(e) => onPatch(background.localId, { purpose: e.target.value })}
            />
          </HoverBeam>
        </FieldSlot>
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
  // 접힘 상태에서 hover 하면 잘린 뒷부분이 천천히 올라온다(#b1). 이동 거리는 실제로 넘친
  //   높이라 렌더 후 측정해야 하고, 텍스트·패널 폭이 바뀌면 다시 재야 해서 ResizeObserver 로 본다.
  const [storyPeek, setStoryPeek] = useState(0)
  const [storyHover, setStoryHover] = useState(false)
  const storyPeekRo = useRef<ResizeObserver | null>(null)
  const storyBodyRef = useCallback((el: HTMLParagraphElement | null) => {
    storyPeekRo.current?.disconnect()
    storyPeekRo.current = null
    if (!el) {
      setStoryPeek(0)
      return
    }
    const measure = () => setStoryPeek(Math.max(0, el.scrollHeight - STORY_PEEK_VIEW_PX))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    storyPeekRo.current = ro
  }, [])
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
            <StageHelpBadge text="스토리·설정·캐스트를 채우는 기획 회의실이에요. 프로듀서와 대화하면 보드가 함께 채워지고, 필수 항목이 모두 차면 Writer로 넘길 수 있어요." />
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
                    {storyExpanded ? (
                      <p className="max-h-72 overflow-y-auto pr-1 text-sm italic whitespace-pre-wrap text-muted-foreground">
                        {storyText}
                      </p>
                    ) : (
                      <div
                        onMouseEnter={() => setStoryHover(true)}
                        onMouseLeave={() => setStoryHover(false)}
                        className={cn(
                          'max-h-20 overflow-hidden',
                          // 아래를 흐리게 — 아직 더 남았다는 신호(line-clamp 말줄임의 대체).
                          storyPeek > 0 &&
                            '[mask-image:linear-gradient(to_bottom,#000_72%,transparent)]',
                        )}
                      >
                        <p
                          ref={storyBodyRef}
                          style={
                            {
                              '--peek-shift': storyHover ? `-${storyPeek}px` : '0px',
                              transitionDuration: storyHover
                                ? `${Math.round((storyPeek / STORY_PEEK_SPEED_PX_PER_SEC) * 1000)}ms`
                                : `${STORY_PEEK_RETURN_MS}ms`,
                            } as CSSProperties
                          }
                          className="translate-y-[var(--peek-shift)] text-sm italic whitespace-pre-wrap text-muted-foreground transition-transform ease-linear motion-reduce:translate-y-0 motion-reduce:transition-none"
                        >
                          {storyText}
                        </p>
                      </div>
                    )}
                    {(storyExpanded || storyPeek > 0) && (
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
            {/* 카드 격자 → 줄 목록(#b-rows 2026-07-31). 여섯 필드는 서로 높이가 다를 이유가
                없는데 카드 격자에선 같은 행끼리 높이가 맞춰져 빈 공간이 생겼다. */}
            <div className={ROW_LIST}>
              <FieldRow icon={<Clock className="size-4" />} label="러닝타임" issue={hardByField.get('playtime')} mentionRef="setting:playtime" mentionLabel="러닝타임">
                <HoverBeam>
                  <Input
                    type="number"
                    min={5}
                    value={projectSettings.playtime || ''}
                    placeholder="예: 120"
                    onChange={(e) => updateSettings({ playtime: Number(e.target.value) || 0 })}
                    // 네이티브 위아래 스피너 스타일(#b4 2026-08-03) — globals.css .number-spin.
                    //   기본은 은은하게, hover 시 또렷하게 + 커서, dark 에선 invert(Chromium 계열).
                    className={cn(QUIET_CONTROL, 'number-spin h-8 font-mono tabular-nums')}
                  />
                </HoverBeam>
              </FieldRow>

              <FieldRow icon={<Film className="size-4" />} label="스토리 장르" issue={hardByField.get('genre')} mentionRef="setting:genre" mentionLabel="스토리 장르">
                <HoverBeam>
                  <Input
                    value={projectSettings.genre}
                    placeholder="예: thriller"
                    className={cn(QUIET_CONTROL, 'h-8')}
                    onChange={(e) => updateSettings({ genre: e.target.value })}
                  />
                </HoverBeam>
              </FieldRow>

              {/* 세부 장르 필드는 숨김(2026-07-13 — 데이터(settings.subGenre)는 유지) → 스타일&톤(style_anchors)으로 대체.
                  콤보 박스는 글자만, 클릭 시 그리드 팝업으로 선택(#b 2026-07-14). */}
              <FieldRow icon={<Tag className="size-4" />} label="영상 스타일" mentionRef="setting:styleAnchor" mentionLabel="영상 스타일">
                <StyleAnchorPicker
                  anchors={styleAnchors}
                  value={styleAnchorKey}
                  onSelect={(k) => void setStyleAnchor(k)}
                />
              </FieldRow>

              <FieldRow icon={<Monitor className="size-4" />} label="포맷" issue={hardByField.get('format')} mentionRef="setting:format" mentionLabel="포맷">
                <Select
                  value={projectSettings.format}
                  onValueChange={(v) => updateSettings({ format: v as ProjectFormat })}
                >
                  <SelectTrigger size="sm" className={cn('w-full', QUIET_CONTROL, QUIET_CHEVRON, HOVER_RED_BORDER)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow icon={<Palette className="size-4" />} label="톤" softIssue={softByField.get('tone')} mentionRef="setting:tone" mentionLabel="톤">
                <HoverBeam>
                  <TagInput
                    values={projectSettings.tone}
                    onChange={(tone) => updateSettings({ tone })}
                    placeholder="예: dark"
                  />
                </HoverBeam>
              </FieldRow>

              <FieldRow icon={<Languages className="size-4" />} label="대사 언어" issue={hardByField.get('dialogueLanguage')} mentionRef="setting:dialogueLanguage" mentionLabel="대사 언어">
                <Select
                  value={projectSettings.dialogueLanguage || ''}
                  onValueChange={(v) => updateSettings({ dialogueLanguage: v })}
                >
                  <SelectTrigger size="sm" className={cn('w-full', QUIET_CONTROL, QUIET_CHEVRON, HOVER_RED_BORDER)}>
                    <SelectValue placeholder="선택…" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
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
              // 줄 목록(#b-rows) — 카드 격자의 높이 동기화 문제가 애초에 생기지 않는다.
              <div className={ROW_LIST}>
                {cast.map((member, i) => (
                  <CastRow
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
                <Mountain className="size-10 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">아직 배경 설정이 없어요</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  추가하고 싶은 배경이나 세계관에 대한 묘사를 AI Producer에게 알려주세요
                </p>
              </div>
            ) : (
              <div className={ROW_LIST}>
                {backgrounds.map((background, i) => (
                  <BackgroundRow
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
