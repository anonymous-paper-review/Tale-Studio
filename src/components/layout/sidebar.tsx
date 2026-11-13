'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import {
  ArtistIcon,
  DirectorIcon,
  EditorIcon,
  HelpIcon,
  ProducerIcon,
  StoryboardIcon,
  TakeIcon,
  WriterIcon,
} from '@/components/icons/v3-icons'
import { cn } from '@/lib/utils'
import { STAGES, STAGE_LABEL, SHELL_INSET, SHELL_RAIL_WIDTH } from '@/lib/constants'
import { STAGE_PERSONA } from '@/lib/lumi'
import { railStageState } from '@/lib/stage-rail'
import { STAGE_ACCESS_KEY, stageForShortcut } from '@/lib/stage-shortcuts'
import { navigateWithStageSlide } from '@/lib/stage-transition'
import { UserMenu } from '@/components/layout/user-menu'
import { ContactPopover } from '@/components/contact-popover'
import { ExportMenu } from '@/components/export-menu'
import { useProjectStore } from '@/stores/project-store'
import { aiBusyNow, railNavBlocked, useAiBusyStore } from '@/stores/ai-busy-store'
import { useStageBadges } from '@/lib/stage-seen'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { refetchBillingAccount, useBillingAccount } from '@/lib/billing/use-billing-account'
import type { StageId } from '@/types'
import { OwnerOnly } from '@/components/demo/owner-only'
import { ShareButton } from '@/components/demo/share-button'
import { FooterIconItem, FOOTER_TRIGGER_CLASS } from '@/components/layout/footer-icon-item'
import { withDemoShare } from '@/lib/demo/context'
import { useT } from '@/lib/i18n'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { directorHasFinishedVideo, railEditorViaHandoff } from '@/lib/director/shot-state'

// 아이콘은 화면 이름을 따른다(리뉴얼 1차) — v3 채움 아이콘: Producer(entry)=전구, Writer(producer)=책, Storyboard(writer)=네 칸.
const STAGE_ICONS: Record<StageId, React.ElementType> = {
  entry: ProducerIcon,
  producer: WriterIcon,
  writer: StoryboardIcon,
  artist: ArtistIcon,
  director: DirectorIcon,
  editor: EditorIcon,
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()
  const canNavigateTo = useProjectStore((s) => s.canNavigateTo)
  const reachedStage = useProjectStore((s) => s.reachedStage)
  // Director 에 완성 영상이 있는가 — 지금 열린 프로젝트의 Director 캔버스 기준(Director 화면 밖에서는 지금 규칙 그대로).
  const sidebarProjectId = useProjectStore((s) => s.projectId)
  const directorFinishedVideo = useDirectorCanvasStore(
    (s) => !!sidebarProjectId && s.projectId === sidebarProjectId && directorHasFinishedVideo(s.nodes ?? []),
  )
  const requestNextStep = useGlobalChatStore((s) => s.requestNextStep)
  const artistImagesReady = useProjectStore((s) => s.artistImagesReady)
  const artistAssetProgress = useProjectStore((s) => s.artistAssetProgress)
  const artistImagesFailed = useProjectStore((s) => s.artistImagesFailed)
  const artistImagesStalled = useProjectStore((s) => s.artistImagesStalled)
  const retryArtistDrafts = useProjectStore((s) => s.retryArtistDrafts)
  // 크로스스테이지 완료 알림 배지 (chat-proactive-copilot Phase 2)
  // 약속 D3(2026-09-04): 배지는 서버 완료 기록에서 파생 — 화면이 완료를 봤는지와 무관하다.
  const currentStage = useProjectStore((s) => s.currentStage)
  const badgeProjectId = useProjectStore((s) => s.projectId)
  const visibleStage = STAGES.find((stage) => pathname.startsWith(stage.path))?.id ?? currentStage
  const stageBadges = useStageBadges(badgeProjectId ?? null, visibleStage ?? null)
  // AI 가 일하는 잠금 화면이 떠 있는 동안은 단계 단추를 막는다(디자이너 QA 1차 #07). 홈 단추는 그대로 둔다.
  const aiBusy = useAiBusyStore((s) => s.tokens.length > 0)
  const footerBlocked = railNavBlocked({ to: 'footer', aiBusy })

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

  // 스테이지 이동 한 곳 (#keyboard-only) — 클릭과 단축키가 같은 경로를 타야 잠금·전환 연출이 갈리지 않는다.
  //   canNavigateTo 는 getState() 로 읽는다: 리스너가 오래 살아 있어도 잠금 판정이 낡지 않게.
  //   AI 가 일하는 동안(잠금 화면이 떠 있는 동안)도 옮겨 가지 않는다 — 같은 이유로 지금 값(aiBusyNow)을 읽는다.
  const goToStage = useCallback(
    (stageId: StageId) => {
      const stage = STAGES.find((s) => s.id === stageId)
      if (!stage || pathname.startsWith(stage.path)) return
      if (railNavBlocked({ to: 'stage', locked: !useProjectStore.getState().canNavigateTo(stageId), aiBusy: aiBusyNow() })) return
      setPendingStage(stageId)
      navigateWithStageSlide(pathname, stage.path, () =>
        router.push(withDemoShare(stage.path)),
      )
    },
    [pathname, router],
  )

  // Alt(Option) + Q/W/E/R/T 로 전환하고, Alt 를 누르고 있는 동안 각 셀에 키 배지를 띄운다.
  //   Ctrl/Cmd 가 아닌 이유는 stage-shortcuts.ts 주석 참조(예약 가속키 — Cmd+W 는 탭을 닫는다).
  //   입력창에 포커스가 있어도 가로챈다: 앱 메뉴 성격의 전역 단축키라 텍스트 입력과 경쟁하지 않는다.
  const [accessKeysVisible, setAccessKeysVisible] = useState(false)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAccessKeysVisible(true)
      const target = stageForShortcut(e)
      if (!target) return
      e.preventDefault() // Windows 의 Alt+문자 메뉴 활성화 차단
      setAccessKeysVisible(false)
      goToStage(target)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAccessKeysVisible(false)
    }
    // Alt+Tab 으로 창을 떠나면 keyup 이 오지 않아 배지가 남는다 — 포커스 상실에 함께 내린다.
    const clear = () => setAccessKeysVisible(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clear)
    }
  }, [goToStage])

  const reachedStageIndex = STAGES.findIndex((stage) => stage.id === reachedStage)
  // stalled 는 실패가 아니라 "오래 대기 중"이다 (#stale-gate 2026-08-26). 한 문구로 뭉치면
  //   실패 0건인데도 "생성 실패"가 떠서 사용자가 사고로 오인한다 - 오너 실측 신고 사례.
  const artistImageLockCopy = artistImagesFailed
    ? t('Generation failed · retry')
    : artistImagesStalled
      ? t('Taking longer than usual · retry')
      : t('Generating images {ready}/{total}', {
          ready: artistAssetProgress?.ready ?? 0,
          total: artistAssetProgress?.total ?? 0,
        })

  // 화면 가장자리에 붙은 area 가 아니라 INSET 만큼 띄운 둥근 패널 (#shell-lift 2026-07-31).
  //   v3(2026-11-03): 바탕은 사이드바 색(#1F1E1D) 하나, 테두리 · 그림자 없음. 맨 위는 Tale 로고(누르면 프로젝트 목록),
  //   프로젝트 이름 바꾸기는 위 막대(StudioTopBar)의 연필로 옮겼다.
  return (
    <aside
      className="fixed z-40 flex flex-col items-center gap-1.5 rounded-xl bg-sidebar pb-4 pt-3"
      style={{
        left: SHELL_INSET,
        top: SHELL_INSET,
        bottom: SHELL_INSET,
        width: SHELL_RAIL_WIDTH,
      }}
    >
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t('Back to Projects')}
            // AI 가 일하는 동안에도 프로젝트 목록으로는 나갈 수 있다(빠져나갈 길) — 막는 규칙은 railNavBlocked 한 곳.
            onClick={() => {
              if (!railNavBlocked({ to: 'projects', aiBusy: aiBusyNow() })) router.push('/projects')
            }}
            className="flex size-10 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 브랜드 심볼 SVG(정적 파일) */}
            <img src="/brand/tale-symbol.svg" alt="" width={30} height={26} className="h-[26px] w-[30px]" draggable={false} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t('Back to Projects')}</TooltipContent>
      </Tooltip>

      {/* Stage navigation — STAGES(constants.ts) 순서 그대로 (writer 탭 2026-06-12 부활).
          아이콘 + 라벨이 한 버튼 안에 들어간다: 활성 배경이 둘을 함께 감싸야 하나의 탭으로 읽힌다.
          라벨이 5줄 늘어난 만큼 세로가 빠듯해질 수 있어 낮은 뷰포트에선 이 영역만 스크롤한다. */}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {STAGES.map((stage) => {
          const Icon = STAGE_ICONS[stage.id]
          const isCommitted = pathname.startsWith(stage.path)
          // 이동 중엔 목적지가 곧 활성 — 클릭 프레임부터 하이라이트가 옮겨가 있어야
          //   "눌렸다"가 보인다. 커밋되면 pendingStage 가 해제되며 pathname 기준으로 복귀.
          const isActive = pendingStage ? pendingStage === stage.id : isCommitted
          const isPending = pendingStage === stage.id && !isCommitted
          // 사이드바 Editor 는 [다음: Editor로]와 같은 조건 · 같은 넘김(시안 R, 오너 2026-11-14) — 넘기기 전이라도 완성 영상이 있으면 열고, 누르면 넘긴다.
          const viaHandoff = railEditorViaHandoff({
            stage: stage.id,
            reachedDirectorOnly: reachedStage === 'director' && !canNavigateTo('editor'),
            finishedVideo: directorFinishedVideo,
          })
          const isLocked = !canNavigateTo(stage.id) && !viaHandoff
          const reachedByStage =
            STAGES.findIndex((item) => item.id === stage.id) <= reachedStageIndex
          const isArtistImageLocked =
            stage.id === 'artist' && reachedByStage && !artistImagesReady
          const isArtistRetryable =
            isArtistImageLocked && (artistImagesFailed || artistImagesStalled)
          // AI 가 일하는 동안은 지금 화면이 아닌 단계 단추를 막는다(디자이너 QA 1차 #07) — 지금 단계 단추는 그대로 둔다.
          const busyBlocked = aiBusy && !isCommitted
          const isDisabled = (isLocked && !isArtistRetryable) || busyBlocked || (aiBusy && isArtistRetryable)
          // 다른 stage 작업 완료 배지 — 활성/잠금 stage엔 표시 안 함(활성은 진입 시 클리어됨)
          const badge = !isActive && !isLocked ? (stageBadges[stage.id] ?? 0) : 0
          // v3 칸 모습 — 지금 단계(밝은 바탕 · 단계 색 아이콘) · 끝낸 단계(체크) · 열린 단계 · 아직 안 연 단계(흐림).
          const railState = railStageState(stage.id, { active: isActive && !isLocked ? stage.id : null, reached: reachedStage })

          return (
            <Tooltip key={stage.id} delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    // AI 가 일하는 동안은 다시 시도도 보내지 않는다(2026-10-27) — 그리는 중에 요청을 또 보낼 수 있었다.
                    if (isArtistRetryable && !aiBusy) void retryArtistDrafts()
                    else if (isArtistRetryable) return
                    // 데모(URL 티켓): share 쿼리 유지 — 쿠키 차단 브라우저에서도 스테이지 이동 생존
                    //   이동 자체는 goToStage 한 곳(단축키와 공유. 세로 스트립 전환 포함).
                    else if (viaHandoff) void requestNextStep()
                    else if (!isLocked && !isCommitted) goToStage(stage.id)
                  }}
                  aria-label={badge > 0 ? `${STAGE_LABEL[stage.id]} · ${t('Unseen completions: {count}', { count: badge })}` : STAGE_LABEL[stage.id]}
                  aria-current={isCommitted ? 'page' : undefined}
                  disabled={isDisabled}
                  data-stage={STAGE_PERSONA[stage.id]}
                  data-rail-state={railState}
                  className={cn(
                    'group relative flex h-[58px] w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg transition-colors',
                    isDisabled && 'cursor-not-allowed',
                    busyBlocked && 'opacity-40',
                    // 글자 색은 칸 모습이 정한다 — 예전처럼 다시 시도 칸의 빨강보다 뒤에 둬서 칸 모습 색이 이긴다(오래 걸림은 실패가 아니다, #stale-gate).
                    isArtistRetryable && !aiBusy && 'cursor-pointer text-destructive hover:bg-sidebar-accent',
                    railState === 'current' && 'bg-sidebar-accent text-foreground',
                    (railState === 'done' || railState === 'open') && 'text-muted-foreground',
                    railState === 'upcoming' && 'text-subtle-foreground',
                    railState !== 'current' && !isDisabled && 'hover:bg-sidebar-accent hover:text-foreground',
                  )}
                >
                  <span className="relative">
                    {/* 지금 단계 아이콘만 그 단계 색(브랜드 가이드 "현재 단계 아이콘") — 색은 data-stage 가 정한다.
                        다른 단계 아이콘은 이름보다 한 단계 밝은 #C2C0B6(11/5 시안), 다시 시도 칸은 칸의 빨강을 그대로 따른다. */}
                    <Icon
                      className={cn(
                        'size-[22px]',
                        railState === 'current'
                          ? 'text-stage'
                          : !(isArtistRetryable && !aiBusy) && cn('text-muted-foreground', !isDisabled && 'group-hover:text-foreground'),
                      )}
                    />
                    {railState === 'done' && (
                      <span
                        data-testid="rail-done-check"
                        className="absolute -right-1.5 -top-1 flex size-2.5 items-center justify-center rounded-full bg-foreground text-on-stage"
                        aria-hidden
                      >
                        <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 5.2 4.4 6.5 7 3.8" />
                        </svg>
                      </span>
                    )}
                  </span>
                  {/* 긴 이름(Storyboard, 리뉴얼 1차)도 칸 폭(64) 안에 든다 — v3 11.5px 600. */}
                  <span className="text-micro font-semibold leading-none">
                    {STAGE_LABEL[stage.id]}
                  </span>
                  {badge > 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-num text-[9px] font-semibold leading-none text-primary-foreground">
                      {badge}
                    </span>
                  )}
                  {/* 액세스 키 배지 — Alt(Option) 를 누르고 있는 동안만. 잠긴 탭 · AI 가 일하는 동안은 갈 수 없으니 안 보인다. */}
                  {accessKeysVisible && !isLocked && !busyBlocked && (
                    <span className="absolute left-0.5 top-0.5 rounded border border-border bg-card px-1 font-num text-[9px] font-semibold leading-[1.35] text-foreground shadow-sm">
                      {STAGE_ACCESS_KEY[stage.id]}
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
                {badge > 0 ? <span>{t('Unseen completions: {count}', { count: badge })}</span> : null}
                <span className="text-xs text-muted-foreground">
                  {busyBlocked
                    ? t('AI is working. You can move once it finishes.')
                    : isLocked
                      ? isArtistImageLocked
                        ? artistImageLockCopy
                        : stage.id === 'editor' && reachedStage === 'director'
                          ? t('A finished video lets you move on.')
                          : t('Complete previous step first')
                      : stage.agent}
                </span>
                {/* 단축키 표기는 Alt 홀드 배지가 전담(#feedback 2026-08-11) — 툴팁에서 제거. */}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* 푸터 액션 — Take · 공유 · 내보내기 · Help · 프로필(v3 순서): 아이콘 · 캡션 크기와 세로 간격을 FooterIconItem 로 통일.
          AI 가 일하는 동안은 통째로 inert(누르기 · 키보드 포커스 모두 막힘, 2026-10-27 오너 재확인).
          inert 안쪽에는 마우스가 닿지 않는다 — 막힌 까닭(title) · 금지 커서는 막지 않는 바깥 묶음에 둔다(검토). */}
      <div
        className={cn('mt-2 shrink-0', footerBlocked && 'cursor-not-allowed')}
        title={footerBlocked ? t('AI is working. You can move once it finishes.') : undefined}
      >
        <div
          className={cn('flex flex-col items-center gap-1.5', footerBlocked && 'opacity-40')}
          data-testid="sidebar-footer"
          inert={footerBlocked || undefined}
        >
          <SidebarTakeBalance />
          <OwnerOnly>
            <FooterIconItem label={t('Share')}>
              <ShareButton />
            </FooterIconItem>
          </OwnerOnly>
          <OwnerOnly>
            <FooterIconItem label={t('Export')}>
              <ExportMenu />
            </FooterIconItem>
          </OwnerOnly>
          {/* 도움말은 다른 보조 메뉴와 같은 강조 수준을 쓴다. */}
          <FooterIconItem label="Help">
            <ContactPopover
              side="right"
              align="end"
              note={(() => {
                const [feedbackPre, feedbackPost] = t(
                  "Feedback is always open. If we don't reply within 12 hours, you'll get {credit} per hour.",
                ).split('{credit}')
                return (
                  <>
                    {feedbackPre}
                    <strong className="font-bold text-foreground">100 Credit</strong>
                    {feedbackPost}
                  </>
                )
              })()}
              trigger={
                <button
                  type="button"
                  aria-label={t('Contact / Help')}
                  title={t('Contact / Help')}
                  className={FOOTER_TRIGGER_CLASS}
                >
                  <HelpIcon className="size-6" />
                </button>
              }
            />
          </FooterIconItem>
          {/* 프로필은 v3 처럼 동그란 머리글자만 — 캡션 없이(이름은 누르면 열리는 메뉴에 있다). */}
          <OwnerOnly>
            <div className="mt-1">
              <UserMenu />
            </div>
          </OwnerOnly>
        </div>
      </div>
    </aside>
  )
}


// #payments-phase-3 P9a(2026-09-07): Take 잔액 배지 — 합계는 기존 잔액 훅, 호버하면 종류별(플랜/충전/무료)로
//   나눠 보인다(오너 09-07: 소멸 알림 대신 호버 구분). 누르면 계정·결제 페이지. 과금 모드 off 면 숨긴다.
//   관리자(무제한)는 ∞. 잔액 음수(환불 회수)는 경고색.
//   오너 09-07: 옛 "영상 0/100" 게이지(#f4)는 이 배지로 통합. v3(2026-11-03): 아이콘은 Take 채움 아이콘, 잔액은 아이콘 옆 작은 숫자.
function SidebarTakeBalance() {
  const t = useT()
  const router = useRouter()
  const take = useTakeBalance()
  const account = useBillingAccount(false)
  if (take.mode === 'off' || take.loading) return null
  const unlimited = take.balance === null
  const negative = !unlimited && (take.balance ?? 0) < 0
  const b = account.data?.balance ?? null
  const rows = b
    ? [
        { label: t('Plan Takes'), value: b.plan },
        { label: t('Pack Takes'), value: b.purchase },
        { label: t('Free Takes'), value: b.free },
        { label: t('Bonus Takes'), value: b.bonus },
        { label: t('Other'), value: b.other },
      ].filter((row) => row.value !== 0)
    : []
  return (
    <OwnerOnly>
      <FooterIconItem label={t('Takes')}>
        <HoverCard openDelay={150} onOpenChange={(open) => open && void refetchBillingAccount()}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              aria-label={t('Open account & billing')}
              onClick={() => router.push('/account')}
              className={cn(FOOTER_TRIGGER_CLASS, 'relative', negative && 'text-destructive')}
            >
              <TakeIcon className="size-6" />
              {/* 잔액 — 아이콘 오른쪽 아래 작은 숫자(v3 는 아이콘 · 캡션만, 숫자는 Inter). 관리자(무제한)는 ∞. */}
              <span className={cn('absolute -bottom-1 -right-1.5 min-w-4 rounded-full bg-chip px-1 text-center font-num text-[9px] font-semibold leading-[14px] tabular-nums', negative ? 'text-destructive' : 'text-foreground')}>
                {unlimited ? '∞' : take.balance}
              </span>
            </button>
          </HoverCardTrigger>
          <HoverCardContent side="right" align="end" className="w-60 text-sm">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-medium">{t('Take balance')}</span>
              <span className={cn('tabular-nums', negative && 'text-destructive')}>
                {unlimited ? t('Unlimited') : take.balance}
              </span>
            </div>
            {unlimited ? null : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{account.loading ? t('Loading…') : t('No Takes yet.')}</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {rows.map((row) => (
                  <li key={row.label} className="flex justify-between">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={cn('tabular-nums', row.value < 0 && 'text-destructive')}>{row.value}</span>
                  </li>
                ))}
                {b?.planExpiresAt && (
                  <li className="pt-1 text-muted-foreground">
                    {t('Plan Takes expire at the end of the billing period. Pack Takes last 12 months.')}
                  </li>
                )}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{t('Click to open account & billing.')}</p>
          </HoverCardContent>
        </HoverCard>
      </FooterIconItem>
    </OwnerOnly>
  )
}
