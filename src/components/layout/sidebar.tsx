'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import {
  Users,
  PenTool,
  Palette,
  Clapperboard,
  Film,
  Home,
  Pencil,
  MessageCircle,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { cn } from '@/lib/utils'
import { STAGES } from '@/lib/constants'
import { UserMenu } from '@/components/layout/user-menu'
import { ContactPopover } from '@/components/contact-popover'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import type { StageId } from '@/types'

const STAGE_ICONS: Record<StageId, React.ElementType> = {
  producer: Users,
  writer: PenTool,
  artist: Palette,
  director: Clapperboard,
  editor: Film,
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const canNavigateTo = useProjectStore((s) => s.canNavigateTo)
  // reachedStage 구독 — 단계가 열리면(잠금 해제) sidebar가 리렌더되도록 (canNavigateTo는 함수 참조라 단독으론 반응 안 함)
  useProjectStore((s) => s.reachedStage)
  // 크로스스테이지 완료 알림 배지 (chat-proactive-copilot Phase 2)
  const stageBadges = useGlobalChatStore((s) => s.stageBadges)
  const projectTitle = useProjectStore((s) => s.projectTitle)
  const renameProject = useProjectStore((s) => s.renameProject)

  // Home HoverCard: 프로젝트명 인라인 편집. 편집 중에는 hover가 벗어나도 카드 유지(controlled open).
  const [homeOpen, setHomeOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(projectTitle)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // 편집 진입 시점에 draft를 현재 이름으로 시드(아래 연필 onClick) — effect 내 setState 회피.
  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }
  }, [editingName])

  const commitName = () => {
    const t = nameDraft.trim()
    if (t && t !== projectTitle) void renameProject(t)
    setEditingName(false)
  }
  const cancelName = () => {
    setNameDraft(projectTitle)
    setEditingName(false)
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-16 flex-col items-center border-r border-border bg-card py-4">
      {/* Home / Back button — hover 시 프로젝트명 표시 + 연필로 인라인 이름변경(HoverCard).
          편집 중엔 controlled open으로 카드 유지(Tooltip과 달리 상호작용 가능). */}
      <HoverCard
        open={homeOpen || editingName}
        onOpenChange={setHomeOpen}
        openDelay={0}
        closeDelay={120}
      >
        <HoverCardTrigger asChild>
          <button
            onClick={() => router.push('/')}
            className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Home className="h-5 w-5" />
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          className="flex w-56 flex-col gap-1.5"
        >
          {editingName ? (
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitName()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelName()
                }
              }}
              onBlur={commitName}
              placeholder="프로젝트 이름"
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-medium outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">
                {projectTitle || 'Untitled'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(projectTitle)
                  setEditingName(true)
                }}
                title="이름 변경"
                aria-label="프로젝트 이름 변경"
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            {editingName ? 'Enter 저장 · Esc 취소' : 'Back to Projects'}
          </span>
        </HoverCardContent>
      </HoverCard>

      <div className="mb-2 h-px w-8 bg-border" />

      {/* Stage navigation — STAGES(constants.ts) 순서 그대로 (writer 탭 2026-06-12 부활) */}
      <div className="flex flex-1 flex-col items-center gap-2">
        {STAGES.map((stage) => {
          const Icon = STAGE_ICONS[stage.id]
          const isActive = pathname.startsWith(stage.path)
          const isLocked = !canNavigateTo(stage.id)
          // 다른 stage 작업 완료 배지 — 활성/잠금 stage엔 표시 안 함(활성은 진입 시 클리어됨)
          const badge = !isActive && !isLocked ? (stageBadges[stage.id] ?? 0) : 0

          return (
            <Tooltip key={stage.id} delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => !isLocked && router.push(stage.path)}
                  disabled={isLocked}
                  className={cn(
                    'relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors',
                    isLocked && 'cursor-not-allowed opacity-30',
                    isActive && !isLocked
                      ? 'border-l-2 border-primary bg-accent text-primary'
                      : !isLocked && 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex flex-col">
                <span className="font-medium">{stage.name}</span>
                <span className="text-xs text-muted-foreground">
                  {isLocked ? 'Complete previous step first' : stage.agent}
                </span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* 문의/도움("채널톡") — 프로필(UserMenu) 바로 위. 프로필과 동일한 40px 원형.
          빨간 원(bg-primary) + 흰 말풍선 아이콘, 아래 "Help" 캡션.
          클릭 시 우측으로 문의 팝업. (구 floating Samantha를 여기로 이동) */}
      <div className="mb-2 flex flex-col items-center gap-1">
        <ContactPopover
          side="right"
          align="end"
          note={
            <>
              피드백은 항상 열려있습니다. 12시간 내로 답변 없을 시 시간당{' '}
              <strong className="font-bold text-foreground">100 Credit</strong>을
              제공해드립니다.
            </>
          }
          trigger={
            <button
              type="button"
              aria-label="문의 / Help"
              title="문의 / Help"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
          }
        />
        <span className="text-[10px] font-medium leading-none text-muted-foreground">
          Help
        </span>
      </div>
      <UserMenu />
    </aside>
  )
}
