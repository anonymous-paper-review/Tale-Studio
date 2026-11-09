'use client'

// 프로젝트 목록의 시리즈 창들(2026-10-26, 프로토타입 N2 · LU · LS · LD · 앞 화 산문 보기).
//   판정은 ./series-list(순수)가 하고, 여기서는 그 결과대로 창을 띄우고 계약된 서버 주소만 부른다.
//   - 만들기 창: GET /api/project/next-episode?from=<앞 화 id> 로 이어받는 것을 보여 주고,
//     POST /api/project/next-episode 로 만든 뒤 /studio/start?projectId=<새 프로젝트> 로 간다.
//   - 이어받을 것을 고르는 단계는 없다(10-26 오너) — 앞 화의 인물 · 배경 · 그림체 · 말투를 전부 이어받는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, Lock, Trash2 } from 'lucide-react'
import { AiBusyOverlay, type AiBusyStep } from '@/components/ai-busy-overlay'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PRICING_PAGE_VISIBLE } from '@/lib/billing/pricing-visibility'
import { useLocale, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useSeriesInfo } from '@/features/series/use-series-info'
import { useProjectStore } from '@/stores/project-store'
import {
  NEXT_EPISODE_NOT_READY,
  NEXT_EPISODE_WAIT_STEPS,
  NEXT_EPISODE_WAIT_STEP_MS,
  canContinueLastScene,
  canCreateNextEpisode,
  nextEpisodeFailure,
  nextEpisodeRows,
  nextEpisodeSwitch,
  nextEpisodeWaitDone,
  nextEpisodeWaitStep,
  type NextEpisodeFailure,
  type NextEpisodePreviewView,
} from './series-list'

/** GET /api/project/next-episode 미리보기(계약 1) — 그림체 · 장르 칸은 2026-11-09 오너 추천대로 더했다. */
type NextEpisodePreview = NextEpisodePreviewView

export interface SeriesTarget {
  id: string
  title: string
}

const DOT = ' · '

/** 창 안에 보이는 실패 안내. 요금제 · 칸은 창을 바꿔 띄우므로 여기 없다. */
function failureText(t: (text: string) => string, failure: NextEpisodeFailure | null): string | null {
  if (failure === 'not_found') return t('The previous episode is gone. Refresh the list.')
  if (failure === 'not_ready') return t(NEXT_EPISODE_NOT_READY)
  if (failure) return t('Could not create the next episode. Please try again.')
  return null
}

/** 이어받는 것 한 줄. */
/**
 * 이어받는 것 한 줄. roomy = 11/5 시안 R6 의 표(줄 위아래 11 · 이름 흐린 글자) — 부모 dl 이 두 칸 격자라
 *   이름 칸이 줄마다 같은 폭이다(영어 이름이 길어도 겹치지 않는다).
 */
function InheritRow({ label, value, roomy }: { label: string; value: string; roomy?: boolean }) {
  return (
    <div className={roomy ? 'contents text-sm' : 'flex gap-3 py-1.5 text-sm'}>
      <dt className={cn('shrink-0', roomy ? 'py-[11px] text-subtle-foreground' : 'w-20 text-muted-foreground')}>{label}</dt>
      <dd className={cn('min-w-0 flex-1 text-foreground', roomy && 'py-[11px]')}>{value}</dd>
    </div>
  )
}

/**
 * 만들기 창(N2) — 이어받는 것 · 마지막 장면 잇기 · [다음 화 만들기 · 칸 1개 사용].
 *   요금제 · 칸 때문에 막히면 창을 닫고 부모가 그 안내 창을 연다(버튼 단계와 같은 창).
 */
export function NextEpisodeDialog({
  project,
  onClose,
  onFailure,
}: {
  project: SeriesTarget | null
  onClose: () => void
  onFailure: (failure: NextEpisodeFailure) => void
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [preview, setPreview] = useState<NextEpisodePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [failure, setFailure] = useState<NextEpisodeFailure | null>(null)
  const [continueLastScene, setContinueLastScene] = useState(false)
  // 이 창에서 만든 다음 화 — 있으면 다시 만들 수 없고, 열린 프로젝트가 그 화로 바뀌면 창을 닫는다(검토 B 높음 1).
  const [createdId, setCreatedId] = useState<string | null>(null)
  const switchProject = useProjectStore((s) => s.switchProject)
  const openProjectId = useProjectStore((s) => s.projectId)
  const pathname = usePathname()

  const projectId = project?.id ?? null

  // 부모가 인라인으로 넘기는 출력 함수는 매 렌더 새로 생긴다 — 아래 effect 의 조건에 넣으므로 미리보기를 매 렌더 다시 부른다
  //   (#editor-render-loop 2026-08-24 사고와 같은 고리). 여는 프로젝트가 바뀔 때만 다시 부르고, 출력은 ref 로 전한다.
  const onCloseRef = useRef(onClose)
  const onFailureRef = useRef(onFailure)
  useEffect(() => {
    onCloseRef.current = onClose
    onFailureRef.current = onFailure
  }, [onClose, onFailure])

  useEffect(() => {
    if (!projectId) return
    let alive = true
    setPreview(null)
    setFailure(null)
    setContinueLastScene(false)
    setCreatedId(null)
    setLoading(true)
    void (async () => {
      try {
        const res = await fetch(`/api/project/next-episode?from=${encodeURIComponent(projectId)}`)
        const body = await res.json().catch(() => null)
        if (!alive) return
        if (!res.ok || !body?.ok) {
          const mapped = nextEpisodeFailure(body?.error)
          if (mapped === 'plan' || mapped === 'slots') {
            onCloseRef.current()
            onFailureRef.current(mapped)
            return
          }
          setFailure(mapped)
          return
        }
        setPreview(body as NextEpisodePreview)
      } catch {
        if (alive) setFailure('unknown')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [projectId])

  // 만드는 동안 기다리는 카드의 단계(11/5 시안 R5) — 서버가 단계를 알려 주지 않아 시간으로 넘기고, 마지막 단계에서 답을 기다린다.
  const [waitStep, setWaitStep] = useState(0)
  useEffect(() => {
    if (!creating) return
    const ticker = setInterval(() => setWaitStep(nextEpisodeWaitStep), NEXT_EPISODE_WAIT_STEP_MS)
    return () => clearInterval(ticker)
  }, [creating])

  // 스튜디오 안(레일 프로필 메뉴)에서 연 창은 틀이 이동해도 그대로다 — 열린 프로젝트가 새 화로 바뀌면 기다리는 카드와 창을 닫는다.
  //   프로젝트 목록 화면은 새 화로 옮겨 가면 화면째 사라져서 닫지 않는다(nextEpisodeWaitDone).
  useEffect(() => {
    if (!nextEpisodeWaitDone({ createdId, projectId: openProjectId, pathname })) return
    setCreating(false)
    setCreatedId(null)
    onCloseRef.current()
  }, [createdId, openProjectId, pathname])

  const create = useCallback(async () => {
    if (!projectId || !canCreateNextEpisode({ preview, creating, createdId })) return
    setWaitStep(0)
    setCreating(true)
    setFailure(null)
    try {
      const res = await fetch('/api/project/next-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromProjectId: projectId, continueLastScene }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.projectId) {
        // 만들어졌으면 기다리는 카드를 띄운 채 새 화로 간다 — 카드를 먼저 닫으면 뒤의 창이 잠깐 다시 보인다.
        //   스튜디오는 주소만 바꿔서는 다른 프로젝트를 열지 않아 먼저 바꾼다(유저 메뉴의 프로젝트 바꾸기와 같은 길).
        //   바뀌면 위 effect 가 카드와 창을 닫고, 이 창에서는 다시 만들 수 없다.
        const next = nextEpisodeSwitch(body)
        setCreatedId(next.id)
        void switchProject(next.id, next.title, next.stage)
        router.push(`/studio/start?projectId=${body.projectId}`)
        return
      }
      // 못 만들었으면 카드를 닫고 창에서 이유를 보인다(요금제 · 칸은 부모가 그 안내 창을 연다).
      setCreating(false)
      const mapped = nextEpisodeFailure(body?.error)
      if (mapped === 'plan' || mapped === 'slots') {
        onClose()
        onFailure(mapped)
        return
      }
      setFailure(mapped)
    } catch {
      setCreating(false)
      setFailure('unknown')
    }
  }, [projectId, preview, creating, createdId, continueLastScene, onClose, onFailure, router, switchProject])

  const error = failureText(t, failure)
  const waitSteps: AiBusyStep[] = NEXT_EPISODE_WAIT_STEPS.map((label, i) => ({
    label: t(label),
    state: i < waitStep ? 'done' : i === waitStep ? 'current' : 'todo',
  }))

  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && !creating && onClose()}>
      {/* 만드는 동안 기다리는 카드(11/5 시안 R5) — 열린 이 창 위를 덮는다. */}
      <AiBusyOverlay
        open={creating}
        layer="dialog"
        lumi="pearl"
        title={t('Loading the previous episode')}
        description={t('Carrying over the characters, backgrounds and art style of "{title}".', { title: project?.title || '' })}
        steps={waitSteps}
      />
      {/* 폭은 공용 팝업 틀이 정한다(11/5 SYS: 모든 팝업 520). */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Create the next episode of "{title}"', { title: project?.title || '' })}</DialogTitle>
          <DialogDescription>{t('The next episode starts as a new project and inherits everything below.')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            {t('Loading…')}
          </p>
        ) : preview ? (
          <>
            {/* 11/5 시안(R6): 테두리 · 나눔 선 없는 바탕색 상자(팝업 #1F1E1D 보다 한 단 밝게) · 모서리 16 · 안쪽 10/20 · 이름 칸 64 이상 · 이름과 값 사이 16 */}
            <dl className="grid grid-cols-[minmax(4rem,auto)_1fr] gap-x-4 rounded-xl bg-background px-5 py-2.5">
              {nextEpisodeRows(preview, t, locale).map((row) => (
                <InheritRow key={row.key} roomy label={row.label} value={row.value} />
              ))}
            </dl>

            {canContinueLastScene(preview) ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={continueLastScene}
                  disabled={creating}
                  onChange={(e) => setContinueLastScene(e.target.checked)}
                  data-testid="next-episode-last-scene"
                />
                {t('Start from the last scene of the previous episode')}
              </label>
            ) : null}
          </>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          {/* SYS 단추: 취소 = secondary(#30302E), 확인 = 크림. 만드는 동안은 기다리는 카드가 덮는다. */}
          <Button variant="secondary" disabled={creating} onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button disabled={!canCreateNextEpisode({ preview, creating, createdId })} onClick={() => void create()} data-testid="next-episode-create">
            {t('Create next episode · uses 1 slot')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 요금제 안내 창(LU) — 프로젝트 칸이 2개 이상인 요금제에서만 다음 화를 만든다. */
export function SeriesPlanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const router = useRouter()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4" aria-hidden />
            {t('Creating a next episode needs Producer10 or above')}
          </DialogTitle>
          <DialogDescription>{t('Keeping the previous episode and the next one together needs at least 2 project slots.')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('Close')}
          </Button>
          {PRICING_PAGE_VISIBLE && <Button onClick={() => router.push('/pricing')}>{t('View pricing')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 칸을 다 썼어요 창(LS) — 다음 화도 프로젝트 하나다. */
export function SeriesSlotLimitDialog({ open, slotLimit, onClose }: { open: boolean; slotLimit: number | null; onClose: () => void }) {
  const t = useT()
  const router = useRouter()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('You have used all {count} project slots', { count: slotLimit ?? 0 })}</DialogTitle>
          <DialogDescription>
            {t('The next episode is a project too, so it needs one slot. Delete an old episode or upgrade your plan.')}
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-r-md border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {t('Deleting an old episode keeps the character and background images copied into the next episode.')}
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('Close')}
          </Button>
          {PRICING_PAGE_VISIBLE && <Button onClick={() => router.push('/pricing')}>{t('View pricing')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 지우기 전 경고 창(LD) — 이 화를 이어받은 다음 화가 있을 때만. 지우기는 목록의 기존 흐름이 한다. */
export function SeriesDeleteWarningDialog({
  open,
  project,
  nextEpisodes,
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean
  project: SeriesTarget | null
  nextEpisodes: readonly { id: string; title?: string | null }[]
  deleting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !deleting && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('This episode has a next episode')}</DialogTitle>
          <DialogDescription>{t('Delete the project "{title}"?', { title: project?.title || '' })}</DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-border rounded-xl border border-border bg-card px-3 py-1">
          <InheritRow
            label={t('Next episode')}
            value={nextEpisodes.map((p) => (p.title || '').trim()).filter(Boolean).join(DOT)}
          />
          <InheritRow
            label={t('What stays')}
            value={t('Character and background images copied into the next episode, the art style, the voices')}
          />
          <InheritRow
            label={t('What disappears')}
            value={t('Every video and image file in this episode, and the story of this episode that the next episode reads')}
          />
        </dl>
        <p className="text-xs leading-5 text-muted-foreground">
          {t('After deleting, the next episode card shows "The previous episode was deleted". This cannot be undone.')}
        </p>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" disabled={deleting} onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button variant="destructive" disabled={deleting} onClick={onConfirm} data-testid="series-delete-confirm">
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {t('Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 앞 화 산문 보기 — 이어받은 화 카드의 [산문 보기]. 앞 화에서 매번 다시 읽는다(읽기 전용). */
export function PrevProseDialog({ project, onClose }: { project: SeriesTarget | null; onClose: () => void }) {
  const t = useT()
  const { view, loading, error } = useSeriesInfo(project?.id ?? null, { prose: true })
  const prose = (view?.prose ?? '').trim()
  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{t('Previous episode prose')}</DialogTitle>
          <DialogDescription>
            {t('This is the confirmed prose of "{title}". If you edit the previous episode, this changes too.', {
              title: view?.prevTitle || '',
            })}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            {t('Loading…')}
          </p>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {t('Could not load the prose.')}
          </p>
        ) : prose ? (
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-sm leading-6 text-foreground">
            {prose}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('The previous episode was deleted, so its prose can no longer be read.')}</p>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
