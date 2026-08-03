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
  Loader2,
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
import { STAGES, STAGE_LABEL, SHELL_INSET, SHELL_RAIL_WIDTH } from '@/lib/constants'
import { navigateWithStageSlide } from '@/lib/stage-transition'
import { UserMenu } from '@/components/layout/user-menu'
import { ContactPopover } from '@/components/contact-popover'
import { ExportMenu } from '@/components/export-menu'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import type { StageId } from '@/types'
import { OwnerOnly } from '@/components/demo/owner-only'
import { ShareButton } from '@/components/demo/share-button'
import { FooterIconItem } from '@/components/layout/footer-icon-item'
import { withDemoShare } from '@/lib/demo/context'

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
  const reachedStage = useProjectStore((s) => s.reachedStage)
  const artistImagesReady = useProjectStore((s) => s.artistImagesReady)
  const artistAssetProgress = useProjectStore((s) => s.artistAssetProgress)
  const artistImagesFailed = useProjectStore((s) => s.artistImagesFailed)
  const artistImagesStalled = useProjectStore((s) => s.artistImagesStalled)
  const retryArtistDrafts = useProjectStore((s) => s.retryArtistDrafts)
  // 크로스스테이지 완료 알림 배지 (chat-proactive-copilot Phase 2)
  const stageBadges = useGlobalChatStore((s) => s.stageBadges)
  const projectTitle = useProjectStore((s) => s.projectTitle)
  const renameProject = useProjectStore((s) => s.renameProject)

  // 스테이지 라우트 프리페치(#tab-slide 2026-08-03) — 탭 클릭 시점에 RSC payload·JS 청크를
  //   받기 시작하면 그 다운로드가 곧 "무응답 구간"이 된다. 미리 받아두면 클릭 → 커밋이 즉시다.
  //   (dev 서버는 prefetch 를 무시하므로 효과는 프로덕션에서만 보인다.)
  useEffect(() => {
    for (const stage of STAGES) router.prefetch(stage.path)
  }, [router])

  // 클릭 즉시 피드백(#tab-slide) — 라우트 커밋(청크 로드·렌더)까지의 공백 동안 아무 반응이
  //   없으면 유저는 다시 누른다. 클릭 순간 목적지 셀을 활성으로 옮기고, 150ms 넘게 걸리면
  //   스피너를 보인다. pathname 이 바뀌면(어디로든) 해제.
  const [pendingStage, setPendingStage] = useState<StageId | null>(null)
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setPendingStage(null)
  }

  const reachedStageIndex = STAGES.findIndex((stage) => stage.id === reachedStage)
  const artistImageLockCopy =
    artistImagesFailed || artistImagesStalled
      ? '생성 실패·재시도'
      : `이미지 생성 중 ${artistAssetProgress?.ready ?? 0}/${artistAssetProgress?.total ?? 0}`

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

  // 화면 가장자리에 붙은 area 가 아니라 INSET 만큼 띄운 둥근 패널 (#shell-lift 2026-07-31).
  //   실제 가용 면적은 그대로지만 배경이 사방으로 비쳐 화면이 넓어 보인다. bg-sidebar 는
  //   surface 사다리 최상단보다 밝은 전용 토큰 — 레일만 앞으로 떠오르게 한다.
  return (
    <aside
      className="fixed z-40 flex flex-col items-center rounded-2xl border border-sidebar-border bg-sidebar py-3 shadow-lg"
      style={{
        left: SHELL_INSET,
        top: SHELL_INSET,
        bottom: SHELL_INSET,
        width: SHELL_RAIL_WIDTH,
      }}
    >
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
            onClick={() => router.push('/projects')}
            className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
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

      <div className="mb-2 h-px w-8 bg-sidebar-border" />

      {/* Stage navigation — STAGES(constants.ts) 순서 그대로 (writer 탭 2026-06-12 부활).
          아이콘 + 라벨이 한 버튼 안에 들어간다: 활성 배경이 둘을 함께 감싸야 하나의 탭으로 읽힌다.
          라벨이 5줄 늘어난 만큼 세로가 빠듯해질 수 있어 낮은 뷰포트에선 이 영역만 스크롤한다. */}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
        {STAGES.map((stage) => {
          const Icon = STAGE_ICONS[stage.id]
          const isCommitted = pathname.startsWith(stage.path)
          // 이동 중엔 목적지가 곧 활성 — 클릭 프레임부터 하이라이트가 옮겨가 있어야
          //   "눌렸다"가 보인다. 커밋되면 pendingStage 가 해제되며 pathname 기준으로 복귀.
          const isActive = pendingStage ? pendingStage === stage.id : isCommitted
          const isPending = pendingStage === stage.id && !isCommitted
          const isLocked = !canNavigateTo(stage.id)
          const reachedByStage =
            STAGES.findIndex((item) => item.id === stage.id) <= reachedStageIndex
          const isArtistImageLocked =
            stage.id === 'artist' && reachedByStage && !artistImagesReady
          const isArtistRetryable =
            isArtistImageLocked && (artistImagesFailed || artistImagesStalled)
          // 다른 stage 작업 완료 배지 — 활성/잠금 stage엔 표시 안 함(활성은 진입 시 클리어됨)
          const badge = !isActive && !isLocked ? (stageBadges[stage.id] ?? 0) : 0

          return (
            <Tooltip key={stage.id} delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    if (isArtistRetryable) void retryArtistDrafts()
                    // 데모(URL 티켓): share 쿼리 유지 — 쿠키 차단 브라우저에서도 스테이지 이동 생존
                    else if (!isLocked && !isCommitted) {
                      setPendingStage(stage.id)
                      // 세로 연속 스트립 전환(#tab-slide-v2) — 방향은 현재 경로 ↔ 목적지로 계산.
                      navigateWithStageSlide(pathname, stage.path, () =>
                        router.push(withDemoShare(stage.path)),
                      )
                    }
                  }}
                  disabled={isLocked && !isArtistRetryable}
                  className={cn(
                    'relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors',
                    isLocked && !isArtistRetryable && 'cursor-not-allowed opacity-30',
                    isArtistRetryable && 'cursor-pointer text-destructive hover:bg-sidebar-accent',
                    isActive && !isLocked
                      ? 'bg-sidebar-accent text-primary'
                      : !isLocked &&
                          'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                  )}
                >
                  {/* 활성 표시 — 둥근 패널에 직각 border-l 은 어울리지 않아 좌측 pill 로 대체 */}
                  {isActive && !isLocked && (
                    <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
                  )}
                  <Icon className="size-5" />
                  <span className="text-[10px] font-medium leading-none tracking-tight">
                    {STAGE_LABEL[stage.id]}
                  </span>
                  {badge > 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                  {/* 이동 중 스피너 — 150ms 안에 커밋되면 안 보인다(fill-mode backwards 로 지연). */}
                  {isPending && (
                    <span
                      className="absolute bottom-0.5 right-0.5 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
                      style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
                    >
                      <Loader2 className="size-3 animate-spin text-muted-foreground" />
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex flex-col">
                <span className="font-medium">{stage.name}</span>
                <span className="text-xs text-muted-foreground">
                  {isLocked
                    ? isArtistImageLocked
                      ? artistImageLockCopy
                      : 'Complete previous step first'
                    : stage.agent}
                </span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* 푸터 액션 — 공유·내보내기·문의·프로필: 버튼 크기·캡션 타이포·세로 간격을 FooterIconItem 로 통일 */}
      <div className="mt-2 flex shrink-0 flex-col items-center gap-2.5">
        <OwnerOnly>
          <FooterIconItem label="공유">
            <ShareButton />
          </FooterIconItem>
        </OwnerOnly>
        <OwnerOnly>
          <FooterIconItem label="내보내기">
            <ExportMenu />
          </FooterIconItem>
        </OwnerOnly>
        {/* 문의/도움("채널톡") — 빨간 원(bg-primary) + 흰 말풍선. 데모에서도 노출(OwnerOnly 밖). */}
        <FooterIconItem label="Help">
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
        </FooterIconItem>
        <OwnerOnly>
          <FooterIconItem label="프로필">
            <UserMenu />
          </FooterIconItem>
        </OwnerOnly>
      </div>
    </aside>
  )
}
