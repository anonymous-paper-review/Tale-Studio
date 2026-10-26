'use client'

// 프로젝트 목록의 시리즈 창들(2026-10-26, 프로토타입 N2 · LU · LS · LD · 앞 화 산문 보기).
//   판정은 ./series-list(순수)가 하고, 여기서는 그 결과대로 창을 띄우고 계약된 서버 주소만 부른다.
//   - 만들기 창: GET /api/project/next-episode?from=<앞 화 id> 로 이어받는 것을 보여 주고,
//     POST /api/project/next-episode 로 만든 뒤 /studio/start?projectId=<새 프로젝트> 로 간다.
//   - 이어받을 것을 고르는 단계는 없다(10-26 오너) — 앞 화의 인물 · 배경 · 그림체 · 말투를 전부 이어받는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import { useSeriesInfo } from '@/features/series/use-series-info'
import { NEXT_EPISODE_NOT_READY, canContinueLastScene, nextEpisodeFailure, type NextEpisodeFailure } from './series-list'

/** GET /api/project/next-episode 미리보기(계약 1). */
interface NextEpisodePreview {
  prevTitle: string
  characters: string[]
  locations: string[]
  hasVoices: boolean
  lastSceneAvailable: boolean
}

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
function InheritRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-foreground">{value}</dd>
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
  const router = useRouter()
  const [preview, setPreview] = useState<NextEpisodePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [failure, setFailure] = useState<NextEpisodeFailure | null>(null)
  const [continueLastScene, setContinueLastScene] = useState(false)

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

  const create = useCallback(async () => {
    if (!projectId || creating) return
    setCreating(true)
    setFailure(null)
    try {
      const res = await fetch('/api/project/next-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromProjectId: projectId, continueLastScene }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.projectId) {
        const mapped = nextEpisodeFailure(body?.error)
        if (mapped === 'plan' || mapped === 'slots') {
          onClose()
          onFailure(mapped)
          return
        }
        setFailure(mapped)
        return
      }
      router.push(`/studio/start?projectId=${body.projectId}`)
    } catch {
      setFailure('unknown')
    } finally {
      setCreating(false)
    }
  }, [projectId, continueLastScene, creating, onClose, onFailure, router])

  const error = failureText(t, failure)

  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && !creating && onClose()}>
      <DialogContent className="sm:max-w-md">
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
            <dl className="divide-y divide-border rounded-xl border border-border bg-card px-3 py-1">
              <InheritRow
                label={t('Characters')}
                value={preview.characters.length ? preview.characters.join(DOT) : t('None')}
              />
              <InheritRow
                label={t('Backgrounds')}
                value={preview.locations.length ? preview.locations.join(DOT) : t('None')}
              />
              <InheritRow label={t('Art style')} value={t('Same as the previous episode')} />
              {preview.hasVoices ? <InheritRow label={t('Voices')} value={t('Inherited from the previous episode')} /> : null}
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
          <Button variant="outline" disabled={creating} onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button disabled={creating || !preview} onClick={() => void create()} data-testid="next-episode-create">
            {creating ? <Loader2 className="size-4 animate-spin" /> : null}
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4" aria-hidden />
            {t('Creating a next episode needs Producer10 or above')}
          </DialogTitle>
          <DialogDescription>{t('Keeping the previous episode and the next one together needs at least 2 project slots.')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('Close')}
          </Button>
          <Button onClick={() => router.push('/pricing')}>{t('View pricing')}</Button>
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
      <DialogContent className="sm:max-w-md">
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
          <Button variant="outline" onClick={onClose}>
            {t('Close')}
          </Button>
          <Button onClick={() => router.push('/pricing')}>{t('View pricing')}</Button>
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
      <DialogContent className="sm:max-w-md">
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
          <Button variant="outline" disabled={deleting} onClick={onCancel}>
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
      <DialogContent className="sm:max-w-2xl">
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
          <Button variant="outline" onClick={onClose}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
