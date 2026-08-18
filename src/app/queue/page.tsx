'use client'

// 큐 콘솔 (#queue-console 2026-08-18) — 전 프로젝트 생성 잡을 한 화면에서 보고 관리한다.
//   배경: 좀비 queued(웹훅 유실)·실패 잡이 SQL 없이는 보이지 않아 며칠씩 방치됐다(실측 8/9~8/18).
//   진실은 generation_jobs 하나 — 이 페이지는 pull 만 하고(10s 폴), 행동은 세 가지뿐:
//   reconcile(fal 진실 회수, 무과금)·상세 보기·삭제(queued/failed 한정, completed 는 이력).

import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw, RotateCw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { cn } from '@/lib/utils'

interface QueueJob {
  id: string
  project_id: string
  kind: string
  status: 'queued' | 'completed' | 'failed'
  model: string
  error: string | null
  error_class: string | null
  request_id: string
  created_at: string
  completed_at: string | null
}

// 서버 STALE_QUEUED_MS(10분)와 같은 값 — 이보다 오래 queued 면 웹훅이 유실된 좀비다.
const STALE_MS = 10 * 60 * 1000
const POLL_MS = 10_000

type Filter = 'all' | 'queued' | 'failed' | 'completed'

// now 는 렌더에서 시계를 읽지 않도록(react-hooks/purity) 로드 사이클이 갱신해 내려준다.
function age(iso: string, now: number): string {
  const min = Math.floor((now - Date.parse(iso)) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간`
  return `${Math.floor(hr / 24)}일`
}

function StatusDot({ job, now }: { job: QueueJob; now: number }) {
  const zombie = job.status === 'queued' && now - Date.parse(job.created_at) > STALE_MS
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          'size-2 rounded-full',
          job.status === 'queued' && !zombie && 'animate-pulse bg-amber-400',
          job.status === 'queued' && zombie && 'bg-amber-600',
          job.status === 'failed' && 'bg-red-500',
          job.status === 'completed' && 'bg-emerald-500/70',
        )}
      />
      <span className="text-sm text-gray-300">
        {job.status === 'queued' ? '진행 중' : job.status === 'failed' ? '실패' : '완료'}
      </span>
      {zombie && (
        <span className="rounded-full border border-amber-600/60 px-2 py-0.5 text-[11px] text-amber-500">
          좀비 {age(job.created_at, now)}
        </span>
      )}
    </span>
  )
}

export default function QueuePage() {
  const [jobs, setJobs] = useState<QueueJob[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [sweeping, setSweeping] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [deleteArm, setDeleteArm] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [falInfo, setFalInfo] = useState<{
    status: string
    queuePosition: number | null
    logs: Array<{ timestamp?: string; level?: string; message?: string }>
    note?: string
  } | null>(null)
  const [falLoading, setFalLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const sweptOnce = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/generation/queue')
    if (!res.ok) return
    const body = (await res.json()) as {
      ok: boolean
      data?: { jobs: QueueJob[]; projectTitles: Record<string, string> }
    }
    if (!body.ok || !body.data) return
    setNow(Date.now())
    setJobs(body.data.jobs)
    setTitles(body.data.projectTitles)
    setLoading(false)
  }, [])

  // 진입 시 1회: stale queued 자동 회수(무과금·멱등) → 목록. 이후 10s 폴(탭이 보일 때만).
  useEffect(() => {
    const boot = async () => {
      if (!sweptOnce.current) {
        sweptOnce.current = true
        await fetch('/api/generation/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }).catch(() => null)
      }
      await load()
    }
    void boot()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const sweepStale = async () => {
    setSweeping(true)
    try {
      const res = await fetch('/api/generation/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const body = (await res.json()) as { data?: { checked: number; settled: number } }
      setNotice(
        body.data
          ? `stale ${body.data.checked}건 확인, ${body.data.settled}건 종결`
          : '회수 실패 — 잠시 후 다시 시도',
      )
      await load()
    } finally {
      setSweeping(false)
    }
  }

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusy((s) => new Set(s).add(id))
    try {
      await fn()
      await load()
    } finally {
      setBusy((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }
  }

  const reconcileOne = (id: string) =>
    withBusy(id, async () => {
      await fetch('/api/generation/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
    })

  const deleteOne = (id: string) =>
    withBusy(id, async () => {
      setDeleteArm(null)
      await fetch(`/api/generation-jobs/${id}`, { method: 'DELETE' })
    })

  const fetchFalStatus = async (id: string) => {
    setFalLoading(true)
    try {
      const res = await fetch(`/api/generation/queue?falStatus=${id}`)
      const body = (await res.json()) as { data?: typeof falInfo }
      setFalInfo(body.data ?? null)
    } finally {
      setFalLoading(false)
    }
  }

  const openDetail = async (id: string) => {
    setFalInfo(null)
    // 상세와 fal 큐 상태를 병렬로 — fal 조회는 무과금 상태 API 라 열 때마다 신선하게.
    void fetchFalStatus(id)
    const res = await fetch(`/api/generation/queue?id=${id}`)
    const body = (await res.json()) as { data?: { job: Record<string, unknown> } }
    if (body.data?.job) setDetail(body.data.job)
  }

  const counts = {
    all: jobs.length,
    queued: jobs.filter((j) => j.status === 'queued').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
  }
  const zombieCount = jobs.filter(
    (j) => j.status === 'queued' && now - Date.parse(j.created_at) > STALE_MS,
  ).length
  const visible = filter === 'all' ? jobs : jobs.filter((j) => j.status === filter)

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: '전체' },
    { key: 'queued', label: '진행 중' },
    { key: 'failed', label: '실패' },
    { key: 'completed', label: '완료' },
  ]

  return (
    <div className="min-h-screen bg-black text-white">
      <DashboardHeader active="queue" />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-sm">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 transition-colors',
                  filter === f.key ? 'bg-white text-black' : 'text-gray-300 hover:text-white',
                )}
              >
                {f.label}
                <span className={cn('ml-1.5 tabular-nums', filter === f.key ? 'text-black/60' : 'text-gray-500')}>
                  {counts[f.key]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {notice && <span className="text-xs text-gray-400">{notice}</span>}
            <button
              onClick={sweepStale}
              disabled={sweeping}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-gray-200 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {sweeping ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
              stale 회수{zombieCount > 0 && ` (좀비 ${zombieCount})`}
            </button>
            <button
              onClick={() => void load()}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-gray-200 transition-colors hover:bg-white/10"
              aria-label="새로고침"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] py-24 text-center text-sm text-gray-500">
            {filter === 'all' ? '잡이 없습니다' : '해당 상태의 잡이 없습니다'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">종류</th>
                  <th className="px-4 py-3 font-medium">프로젝트</th>
                  <th className="px-4 py-3 font-medium">모델</th>
                  <th className="px-4 py-3 font-medium">경과</th>
                  <th className="px-4 py-3 font-medium">오류</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((job) => (
                  <tr key={job.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5"><StatusDot job={job} now={now} /></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{job.kind}</td>
                    <td className="max-w-44 truncate px-4 py-2.5">
                      <Link
                        href={`/studio/producer?projectId=${job.project_id}`}
                        className="text-gray-200 hover:text-white hover:underline"
                      >
                        {titles[job.project_id] ?? job.project_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="max-w-40 truncate px-4 py-2.5 font-mono text-xs text-gray-500">
                      {job.model.split('/').slice(-2).join('/')}
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-gray-400">{age(job.created_at, now)}</td>
                    <td className="max-w-56 px-4 py-2.5">
                      {job.error ? (
                        <span className="text-xs text-red-400/90">
                          {job.error_class && (
                            <span className="mr-1.5 rounded border border-red-500/30 px-1.5 py-0.5 text-[10px] text-red-400">
                              {job.error_class}
                            </span>
                          )}
                          <span className="align-middle">{job.error.slice(0, 60)}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {busy.has(job.id) ? (
                          <Loader2 className="size-3.5 animate-spin text-gray-400" />
                        ) : (
                          <>
                            {job.status === 'queued' && (
                              <button
                                onClick={() => void reconcileOne(job.id)}
                                className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10"
                                title="fal 상태를 즉시 동기화 (무과금)"
                              >
                                reconcile
                              </button>
                            )}
                            <button
                              onClick={() => void openDetail(job.id)}
                              className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10"
                            >
                              상세
                            </button>
                            {job.status !== 'completed' &&
                              (deleteArm === job.id ? (
                                <button
                                  onClick={() => void deleteOne(job.id)}
                                  className="rounded-md bg-red-600 px-2 py-1 text-[11px] text-white hover:bg-red-500"
                                >
                                  정말 삭제
                                </button>
                              ) : (
                                <button
                                  onClick={() => setDeleteArm(job.id)}
                                  onBlur={() => setDeleteArm((v) => (v === job.id ? null : v))}
                                  className="rounded-md border border-white/15 px-1.5 py-1 text-gray-400 hover:border-red-500/40 hover:text-red-400"
                                  aria-label="삭제"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              ))}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-600">
          reconcile 은 이미 제출된 fal 요청의 결과를 회수합니다(재생성·추가 과금 없음). 10분 넘게
          진행 중인 잡은 웹훅이 유실된 좀비로 표시되며, 매일 새벽 워치독이 자동 회수를 시도합니다.
          완료된 잡은 이력으로 보존되어 삭제할 수 없습니다.
        </p>
      </main>

      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null)
            setFalInfo(null)
          }
        }}
      >
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              {String(detail?.kind ?? '')} · {String(detail?.status ?? '')}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              job {String(detail?.id ?? '')} · request {String(detail?.request_id ?? '')}
            </DialogDescription>
          </DialogHeader>
          {/* 타임라인 — 잡의 생애 흔적. attempts/last_error 는 재시도 이력이 있을 때만. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs sm:grid-cols-4">
            {(
              [
                ['생성', detail?.created_at],
                ['제출', detail?.submitted_at],
                ['완료', detail?.completed_at],
                ['갱신', detail?.updated_at],
              ] as Array<[string, unknown]>
            ).map(([label, v]) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
                <p className="tabular-nums text-gray-300">
                  {typeof v === 'string' ? new Date(v).toLocaleString() : '—'}
                </p>
              </div>
            ))}
            {typeof detail?.attempts === 'number' && detail.attempts > 0 && (
              <div className="col-span-2 sm:col-span-4">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">attempts</p>
                <p className="text-gray-300">
                  {String(detail.attempts)}
                  {typeof detail?.last_error === 'string' && detail.last_error && (
                    <span className="ml-2 text-red-400/80">last: {detail.last_error.slice(0, 120)}</span>
                  )}
                </p>
              </div>
            )}
          </div>

          {typeof detail?.error === 'string' && detail.error && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
              {detail.error}
            </pre>
          )}
          {typeof detail?.result_url === 'string' && detail.result_url && (
            <a
              href={detail.result_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-sky-400 hover:underline"
            >
              <ExternalLink className="size-3" /> 결과물 열기
            </a>
          )}

          {/* fal 큐 실시간 상태 + 러너 로그 — API 서버 쪽 디버깅 표면 (#queue-console). */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wider text-gray-500">
                fal queue{' '}
                {falInfo && (
                  <span
                    className={cn(
                      'ml-1 rounded px-1.5 py-0.5 text-[10px]',
                      falInfo.status === 'COMPLETED' && 'bg-emerald-500/15 text-emerald-400',
                      falInfo.status === 'UNAVAILABLE' && 'bg-white/10 text-gray-400',
                      falInfo.status !== 'COMPLETED' && falInfo.status !== 'UNAVAILABLE' && 'bg-amber-500/15 text-amber-400',
                    )}
                  >
                    {falInfo.status}
                    {falInfo.queuePosition !== null && ` · #${falInfo.queuePosition}`}
                  </span>
                )}
              </p>
              <button
                onClick={() => typeof detail?.id === 'string' && void fetchFalStatus(detail.id)}
                disabled={falLoading}
                className="flex items-center gap-1 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-white/10 disabled:opacity-50"
              >
                {falLoading ? <Loader2 className="size-2.5 animate-spin" /> : <RefreshCw className="size-2.5" />}
                조회
              </button>
            </div>
            {falInfo?.note && (
              <p className="mb-1 text-[11px] text-gray-500">fal 큐에서 조회 불가(만료·정리됨): {falInfo.note}</p>
            )}
            {falInfo && falInfo.logs.length > 0 && (
              <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black p-3 font-mono text-[11px] leading-relaxed">
                {falInfo.logs.map((l, i) => (
                  <div key={i} className={cn(
                    l.level === 'ERROR' || l.level === 'error' ? 'text-red-400' :
                    l.level === 'WARN' || l.level === 'warning' ? 'text-amber-400' : 'text-gray-400',
                  )}>
                    {l.timestamp ? `${l.timestamp} ` : ''}{l.level ? `[${l.level}] ` : ''}{l.message ?? ''}
                  </div>
                ))}
              </div>
            )}
            {falInfo && falInfo.logs.length === 0 && !falInfo.note && (
              <p className="text-[11px] text-gray-600">러너 로그 없음 (모델이 로그를 남기지 않았거나 이미 정리됨)</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">input snapshot</p>
            <pre className="max-h-72 overflow-auto rounded-md border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-gray-300">
              {JSON.stringify(detail?.input_snapshot ?? null, null, 2)}
            </pre>
          </div>
          {detail?.response_snapshot != null && (
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">response snapshot (fal 원 응답)</p>
              <pre className="max-h-72 overflow-auto rounded-md border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-gray-300">
                {JSON.stringify(detail.response_snapshot, null, 2)}
              </pre>
            </div>
          )}
          <p className="text-[11px] text-gray-600">
            우리 서버(Vercel) 런타임 로그는 대시보드에서만 열람 가능하고 짧게 보존됩니다 — 잡의 영속
            흔적은 위 스냅샷·오류·타임라인이 전부이며, fal queue 블록은 열 때마다 실시간 조회입니다.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
